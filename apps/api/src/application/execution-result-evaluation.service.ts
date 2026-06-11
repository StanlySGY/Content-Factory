import type {
  CreateExecutionResultEvaluationBody,
  EvaluationCostAttributionQuery,
  EvaluationModelComparisonQuery,
  RegressionEvaluationRunBody,
} from "@cf/shared";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import {
  attributeEvaluationCosts,
  buildRuleEvaluation,
  compareEvaluationsByModel,
  listLowQualityEvaluations,
  normalizeEvaluationTags,
  summarizeEvaluationAnalytics,
  summarizeEvaluations,
  type ExecutionEvaluationAnalytics,
  type ExecutionEvaluationCostAttribution,
  type ExecutionEvaluationModelComparison,
  validateExecutionResultEvaluation,
  type ExecutionResultEvaluationSummary,
  type LowQualityEvaluationList,
} from "../domain/execution/evaluation.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionResultEvaluationRow, ExecutionResultRow } from "../infrastructure/db/schema.js";
import * as evaluationRepo from "../infrastructure/repositories/execution-result-evaluation.repository.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";
import type { RequestContext } from "./task.service.js";

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === "23505";
const DEFAULT_REGRESSION_EVALUATION_LIMIT = 50;
const DEFAULT_COST_ATTRIBUTION_LIMIT = 100;

export interface RegressionEvaluationBatch {
  limit: number;
  created: ExecutionResultEvaluationRow[];
  skippedResultIds: string[];
}

export class ExecutionResultEvaluationService {
  constructor(private readonly db: Db) {}

  async createEvaluation(
    ctx: RequestContext,
    resultId: string,
    input: CreateExecutionResultEvaluationBody,
  ): Promise<ExecutionResultEvaluationRow> {
    validateExecutionResultEvaluation(input);
    const actorId = this.requireActor(ctx);
    const result = await resultRepo.getExecutionResult(this.db, resultId);
    if (!result) throw new NotFoundError(`execution_result ${resultId} not found`);
    try {
      return await evaluationRepo.createEvaluation(this.db, {
        execution_result_id: resultId,
        execution_job_id: result.executionJobId,
        evaluator_type: input.evaluator_type,
        quality_score: input.quality_score,
        cost_score: input.cost_score,
        latency_score: input.latency_score,
        notes: input.notes ?? null,
        tags: normalizeEvaluationTags(input.tags),
        evaluated_by: actorId,
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictError(`execution_result ${resultId} already has ${input.evaluator_type} evaluation`);
      throw error;
    }
  }

  async listByResult(resultId: string): Promise<ExecutionResultEvaluationRow[]> {
    const result = await resultRepo.getExecutionResult(this.db, resultId);
    if (!result) throw new NotFoundError(`execution_result ${resultId} not found`);
    return evaluationRepo.listEvaluationsByResult(this.db, resultId);
  }

  async evaluateResultWithRules(ctx: RequestContext, resultId: string): Promise<ExecutionResultEvaluationRow> {
    const result = await resultRepo.getExecutionResult(this.db, resultId);
    if (!result) throw new NotFoundError(`execution_result ${resultId} not found`);
    const input = buildRuleEvaluation({
      status: result.status,
      runtimeStatus: result.runtimeStatus,
      errorType: result.errorType,
      retryable: result.retryable,
      durationMs: result.durationMs,
    });
    return this.createEvaluation(ctx, resultId, input);
  }

  async evaluateJobWithRules(ctx: RequestContext, jobId: string): Promise<{
    jobId: string;
    created: ExecutionResultEvaluationRow[];
    skippedResultIds: string[];
  }> {
    const results = await resultRepo.listResultsByJob(this.db, jobId);
    const created: ExecutionResultEvaluationRow[] = [];
    const skippedResultIds: string[] = [];
    for (const result of results) {
      const existing = await evaluationRepo.getEvaluationByResultAndType(this.db, result.id, "rule");
      if (existing) {
        skippedResultIds.push(result.id);
        continue;
      }
      created.push(await this.evaluateResultWithRules(ctx, result.id));
    }
    return { jobId, created, skippedResultIds };
  }

  async evaluateRegressionWithRules(
    ctx: RequestContext,
    input: RegressionEvaluationRunBody = {},
  ): Promise<RegressionEvaluationBatch> {
    const limit = input.limit ?? DEFAULT_REGRESSION_EVALUATION_LIMIT;
    const candidates = await this.regressionCandidates(input.job_ids ?? [], limit);
    const created: ExecutionResultEvaluationRow[] = [];
    const skippedResultIds: string[] = [];
    for (const result of candidates) {
      const existing = await evaluationRepo.getEvaluationByResultAndType(this.db, result.id, "rule");
      if (existing) {
        skippedResultIds.push(result.id);
        continue;
      }
      created.push(await this.evaluateResultWithRules(ctx, result.id));
    }
    return { limit, created, skippedResultIds };
  }

  async summaryByJob(jobId: string): Promise<ExecutionResultEvaluationSummary> {
    return summarizeEvaluations(jobId, await evaluationRepo.listEvaluationsByJob(this.db, jobId));
  }

  async analytics(): Promise<ExecutionEvaluationAnalytics> {
    return summarizeEvaluationAnalytics(await evaluationRepo.listAllEvaluations(this.db));
  }

  async modelComparison(query: EvaluationModelComparisonQuery = {}): Promise<ExecutionEvaluationModelComparison> {
    return compareEvaluationsByModel(await evaluationRepo.listAllEvaluations(this.db), {
      modelPrefix: query.model_prefix,
      limit: query.limit,
    });
  }

  async costAttribution(query: EvaluationCostAttributionQuery = {}): Promise<ExecutionEvaluationCostAttribution> {
    const limit = query.limit ?? DEFAULT_COST_ATTRIBUTION_LIMIT;
    const rows = await evaluationRepo.listEvaluationsWithResults(this.db, {
      jobId: query.job_id,
      limit,
    });
    return attributeEvaluationCosts(
      rows.map(({ evaluation, result }) => ({
        evaluationId: evaluation.id,
        executionResultId: evaluation.executionResultId,
        executionJobId: evaluation.executionJobId,
        evaluatorType: evaluation.evaluatorType,
        costScore: evaluation.costScore,
        responseSnapshot: result.responseSnapshot,
      })),
      { jobId: query.job_id, limit },
    );
  }

  async listLowQuality(threshold = 60, limit = 20): Promise<LowQualityEvaluationList> {
    return listLowQualityEvaluations(await evaluationRepo.listAllEvaluations(this.db), threshold, limit);
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("execution result evaluation requires an actor");
    return ctx.actorId;
  }

  private async regressionCandidates(jobIds: string[], limit: number) {
    if (jobIds.length === 0) return resultRepo.listRecentResults(this.db, limit);
    const seen = new Set<string>();
    const out: ExecutionResultRow[] = [];
    for (const jobId of jobIds) {
      for (const result of await resultRepo.listResultsByJob(this.db, jobId)) {
        if (seen.has(result.id)) continue;
        seen.add(result.id);
        out.push(result);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
}

export class ExecutionRegressionEvaluationRunner {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly service: ExecutionResultEvaluationService,
    private readonly ctx: RequestContext,
    readonly enabled: boolean,
    readonly intervalMs: number,
    readonly batchSize: number,
  ) {}

  runOnce(input: RegressionEvaluationRunBody = {}): Promise<RegressionEvaluationBatch> {
    return this.service.evaluateRegressionWithRules(this.ctx, { limit: input.limit ?? this.batchSize, job_ids: input.job_ids });
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch(() => undefined);
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
