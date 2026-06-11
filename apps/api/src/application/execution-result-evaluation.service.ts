import { randomUUID } from "node:crypto";
import type {
  CreateExecutionResultEvaluationBody,
  CrossModelRegressionRunBody,
  EvaluationCostSettlementRunBody,
  EvaluationCostAttributionQuery,
  EvaluationModelComparisonQuery,
  LlmJudgeEvaluationBody,
  RegressionEvaluationRunBody,
} from "@cf/shared";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import {
  attributeEvaluationCosts,
  buildCostSettlementFromResult,
  buildLlmJudgeEvaluation,
  buildRuleEvaluation,
  compareEvaluationsByModel,
  listLowQualityEvaluations,
  normalizeCostSettlementRateCard,
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
import type {
  ExecutionCostSettlementRow,
  ExecutionJobRow,
  ExecutionResultEvaluationRow,
  ExecutionResultRow,
} from "../infrastructure/db/schema.js";
import * as costSettlementRepo from "../infrastructure/repositories/execution-cost-settlement.repository.js";
import * as jobRepo from "../infrastructure/repositories/execution-job.repository.js";
import * as evaluationRepo from "../infrastructure/repositories/execution-result-evaluation.repository.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";
import type { ExecutionJobService } from "./execution-job.service.js";
import type { ExecutionWorker } from "./execution-worker.js";
import type { RequestContext } from "./task.service.js";

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === "23505";
const DEFAULT_REGRESSION_EVALUATION_LIMIT = 50;
const DEFAULT_COST_ATTRIBUTION_LIMIT = 100;
const DEFAULT_COST_SETTLEMENT_LIMIT = 1000;

export interface RegressionEvaluationBatch {
  limit: number;
  created: ExecutionResultEvaluationRow[];
  skippedResultIds: string[];
}

export interface LlmJudgeEvaluationRun {
  judgeJobId: string;
  judgeResultId: string;
  evaluation: ExecutionResultEvaluationRow;
  llmCallsPerformed: true;
  writesPerformed: true;
}

export interface EvaluationCostSettlementRun {
  mode: "evaluation_cost_settlement";
  jobId: string;
  rateCardVersion: string;
  currency: string;
  settlementCount: number;
  skippedCount: number;
  totalAmountMicroCents: number;
  totalAmountCents: number;
  llmCallsPerformed: false;
  writesPerformed: boolean;
  skippedResultIds: string[];
  settlements: ExecutionCostSettlementRow[];
}

export interface CrossModelRegressionRunItem {
  model: string;
  job: ExecutionJobRow;
  result: ExecutionResultRow;
  evaluation: ExecutionResultEvaluationRow;
}

export interface CrossModelRegressionRun {
  mode: "cross_model_regression_run";
  runId: string;
  modelCount: number;
  jobCount: number;
  evaluationCount: number;
  runtimeJobsExecuted: true;
  writesPerformed: true;
  items: CrossModelRegressionRunItem[];
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

  async evaluateResultWithLlmJudge(
    ctx: RequestContext,
    resultId: string,
    input: LlmJudgeEvaluationBody,
    deps: { executionJobService: ExecutionJobService; executionWorker: ExecutionWorker },
  ): Promise<LlmJudgeEvaluationRun> {
    const result = await resultRepo.getExecutionResult(this.db, resultId);
    if (!result) throw new NotFoundError(`execution_result ${resultId} not found`);
    const existing = await evaluationRepo.getEvaluationByResultAndType(this.db, resultId, "llm");
    if (existing) throw new ConflictError(`execution_result ${resultId} already has llm evaluation`);

    const model = input.model?.trim();
    const judgeJob = await deps.executionJobService.createJob({
      type: "agent",
      payload: {
        prompt: buildLlmJudgePrompt(result, input.prompt),
        ...(model ? { model } : {}),
        credential_ref: input.credential_ref,
      },
      idempotency_key: `llm-judge-${resultId}-${randomUUID()}`,
      max_attempts: 1,
    });
    const completed = await deps.executionWorker.tickJob(judgeJob.id);
    if (completed.status !== "success")
      throw new ValidationError(`llm judge execution failed: ${completed.lastError ?? completed.status}`);

    const judgeResult = (await resultRepo.listResultsByJob(this.db, judgeJob.id)).at(-1);
    if (!judgeResult) throw new ValidationError("llm judge execution did not persist a result");
    if (judgeResult.status !== "success")
      throw new ValidationError(`llm judge result failed: ${judgeResult.errorType ?? judgeResult.status}`);

    const evaluationInput = buildLlmJudgeEvaluation({
      responseText: judgeTextFromSnapshot(judgeResult.responseSnapshot),
      model,
      tags: input.tags,
    });
    const evaluation = await this.createEvaluation(ctx, resultId, evaluationInput);
    return {
      judgeJobId: judgeJob.id,
      judgeResultId: judgeResult.id,
      evaluation,
      llmCallsPerformed: true,
      writesPerformed: true,
    };
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

  async settleEvaluationCosts(input: EvaluationCostSettlementRunBody): Promise<EvaluationCostSettlementRun> {
    const job = await jobRepo.getJob(this.db, input.job_id);
    if (!job) throw new NotFoundError(`execution_job ${input.job_id} not found`);
    const rateCard = normalizeCostSettlementRateCard({
      version: input.rate_card.version,
      currency: input.rate_card.currency,
      promptMicroCentsPerToken: input.rate_card.prompt_micro_cents_per_token,
      completionMicroCentsPerToken: input.rate_card.completion_micro_cents_per_token,
    });
    const rows = await evaluationRepo.listEvaluationsWithResults(this.db, {
      jobId: input.job_id,
      limit: DEFAULT_COST_SETTLEMENT_LIMIT,
    });
    const seenResultIds = new Set<string>();
    const settlements: ExecutionCostSettlementRow[] = [];
    const skippedResultIds: string[] = [];

    for (const { result } of rows) {
      if (seenResultIds.has(result.id)) continue;
      seenResultIds.add(result.id);
      const settlement = buildCostSettlementFromResult({
        executionResultId: result.id,
        executionJobId: result.executionJobId,
        responseSnapshot: result.responseSnapshot,
      }, rateCard);
      if (!settlement) {
        skippedResultIds.push(result.id);
        continue;
      }
      const created = await costSettlementRepo.createSettlementIfAbsent(this.db, settlement);
      if (created) settlements.push(created);
      else skippedResultIds.push(result.id);
    }

    return {
      mode: "evaluation_cost_settlement",
      jobId: input.job_id,
      rateCardVersion: rateCard.version,
      currency: rateCard.currency,
      settlementCount: settlements.length,
      skippedCount: skippedResultIds.length,
      totalAmountMicroCents: settlements.reduce((sum, item) => sum + item.amountMicroCents, 0),
      totalAmountCents: settlements.reduce((sum, item) => sum + item.amountCents, 0),
      llmCallsPerformed: false,
      writesPerformed: settlements.length > 0,
      skippedResultIds,
      settlements,
    };
  }

  async runCrossModelRegression(
    ctx: RequestContext,
    input: CrossModelRegressionRunBody,
    deps: { executionJobService: ExecutionJobService; executionWorker: ExecutionWorker },
  ): Promise<CrossModelRegressionRun> {
    const prompt = input.prompt.trim();
    if (!prompt) throw new ValidationError("cross-model regression prompt is required");
    const models = normalizeCrossModelRegressionModels(input.models);
    const runId = input.idempotency_key.trim();
    const items: CrossModelRegressionRunItem[] = [];

    for (const [index, model] of models.entries()) {
      const job = await deps.executionJobService.createJob({
        type: "agent",
        payload: {
          prompt,
          model,
          ...(input.credential_ref ? { credential_ref: input.credential_ref } : {}),
          regression: {
            mode: "cross_model_regression",
            run_id: runId,
            model_index: index,
            model_count: models.length,
          },
        },
        idempotency_key: `cross-model-${runId}-${index}`,
        max_attempts: input.max_attempts ?? 1,
      });
      const completed = await deps.executionWorker.tickJob(job.id);
      const result = (await resultRepo.listResultsByJob(this.db, job.id)).at(-1);
      if (!result) throw new ValidationError(`cross-model regression job ${job.id} did not persist a result`);
      const ruleEvaluation = buildRuleEvaluation({
        status: result.status,
        runtimeStatus: result.runtimeStatus,
        errorType: result.errorType,
        retryable: result.retryable,
        durationMs: result.durationMs,
      });
      const evaluation = await this.createEvaluation(ctx, result.id, {
        ...ruleEvaluation,
        tags: normalizeEvaluationTags([
          ...(ruleEvaluation.tags ?? []),
          "cross-model-regression",
          ...(input.tags ?? []),
          `model:${model}`,
          `regression:${runId}`,
        ]),
      });
      items.push({ model, job: completed, result, evaluation });
    }

    return {
      mode: "cross_model_regression_run",
      runId,
      modelCount: models.length,
      jobCount: items.length,
      evaluationCount: items.length,
      runtimeJobsExecuted: true,
      writesPerformed: true,
      items,
    };
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

function normalizeCrossModelRegressionModels(models: string[]): string[] {
  const normalized = models.map((model) => model.trim()).filter(Boolean);
  const unique = [...new Set(normalized)];
  if (unique.length < 2) throw new ValidationError("cross-model regression requires at least two unique models");
  if (unique.length !== normalized.length) throw new ValidationError("cross-model regression models must be unique");
  return unique;
}

function buildLlmJudgePrompt(result: ExecutionResultRow, prompt?: string): string {
  const defaultInstruction =
    "Evaluate this execution result. Return strict JSON with quality_score, cost_score, latency_score, notes, and tags.";
  const instruction = sanitizeJudgePromptText(prompt?.trim() || defaultInstruction);
  return `${instruction}

Return strict JSON only. Scores must be integers from 0 to 100.
Execution result summary:
${JSON.stringify(buildLlmJudgeResultSummary(result))}`;
}

function buildLlmJudgeResultSummary(result: ExecutionResultRow): Record<string, unknown> {
  const metadata = record(result.responseSnapshot.metadata);
  const output = record(result.responseSnapshot.output);
  const providerContract = record(metadata?.providerResponseContract);
  return {
    id: result.id,
    execution_job_id: result.executionJobId,
    status: result.status,
    runtime_status: result.runtimeStatus,
    error_type: result.errorType,
    duration_ms: result.durationMs,
    provider_kind: safeString(metadata?.providerKind),
    model: safeString(providerContract?.model),
    output_text: safeString(textFromOutput(output)),
    cost_estimate: safeCostEstimate(metadata?.costEstimate),
    quota: safeQuotaDecision(metadata?.quotaDecision),
  };
}

function judgeTextFromSnapshot(snapshot: Record<string, unknown>): string {
  const output = record(snapshot.output);
  const result = record(output?.result);
  const text = result?.text ?? output?.text;
  if (typeof text !== "string" || text.trim().length === 0)
    throw new ValidationError("llm judge response text is missing");
  return text;
}

function textFromOutput(output: Record<string, unknown> | null): unknown {
  const result = record(output?.result);
  return result?.text ?? output?.text;
}

function safeCostEstimate(value: unknown): Record<string, unknown> | null {
  const cost = record(value);
  if (!cost) return null;
  return {
    source: safeString(cost.source),
    amount_cents: typeof cost.amountCents === "number" ? cost.amountCents : null,
    currency: safeString(cost.currency),
  };
}

function safeQuotaDecision(value: unknown): Record<string, unknown> | null {
  const quota = record(value);
  if (!quota) return null;
  const usedRequests = quota.usedRequests ?? quota.used_requests;
  const usedCostCents = quota.usedCostCents ?? quota.used_cost_cents;
  return {
    status: safeString(quota.status),
    distributed: typeof quota.distributed === "boolean" ? quota.distributed : null,
    used_requests: typeof usedRequests === "number" ? usedRequests : null,
    used_cost_cents: typeof usedCostCents === "number" ? usedCostCents : null,
  };
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return sanitizeJudgePromptText(value.trim()).slice(0, 8000);
}

function sanitizeJudgePromptText(value: string): string {
  return value.replace(
    /(sk-[A-Za-z0-9_-]+|Bearer\s+[^\s"']+|secret|api[_-]?key|password|authorization|credential|token)/gi,
    "[redacted]",
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
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
