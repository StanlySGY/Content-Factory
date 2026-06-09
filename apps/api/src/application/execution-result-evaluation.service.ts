import type { CreateExecutionResultEvaluationBody } from "@cf/shared";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import {
  buildRuleEvaluation,
  listLowQualityEvaluations,
  normalizeEvaluationTags,
  summarizeEvaluationAnalytics,
  summarizeEvaluations,
  type ExecutionEvaluationAnalytics,
  validateExecutionResultEvaluation,
  type ExecutionResultEvaluationSummary,
  type LowQualityEvaluationList,
} from "../domain/execution/evaluation.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionResultEvaluationRow } from "../infrastructure/db/schema.js";
import * as evaluationRepo from "../infrastructure/repositories/execution-result-evaluation.repository.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";
import type { RequestContext } from "./task.service.js";

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === "23505";

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

  async summaryByJob(jobId: string): Promise<ExecutionResultEvaluationSummary> {
    return summarizeEvaluations(jobId, await evaluationRepo.listEvaluationsByJob(this.db, jobId));
  }

  async analytics(): Promise<ExecutionEvaluationAnalytics> {
    return summarizeEvaluationAnalytics(await evaluationRepo.listAllEvaluations(this.db));
  }

  async listLowQuality(threshold = 60, limit = 20): Promise<LowQualityEvaluationList> {
    return listLowQualityEvaluations(await evaluationRepo.listAllEvaluations(this.db), threshold, limit);
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("execution result evaluation requires an actor");
    return ctx.actorId;
  }
}
