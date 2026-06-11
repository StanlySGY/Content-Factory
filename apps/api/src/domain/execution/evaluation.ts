import {
  EXECUTION_RESULT_EVALUATOR_TYPES,
  type CreateExecutionResultEvaluationBody,
  type ExecutionResultEvaluatorType,
} from "@cf/shared";
import { ValidationError } from "../errors.js";

export interface ExecutionResultEvaluationInput {
  evaluator_type: string;
  quality_score: number;
  cost_score: number;
  latency_score: number;
  notes?: string | null;
  tags?: string[];
}

export interface ExecutionResultEvaluationSummary {
  jobId: string;
  evaluationCount: number;
  averageQualityScore: number | null;
  averageCostScore: number | null;
  averageLatencyScore: number | null;
  latestEvaluatorType: ExecutionResultEvaluatorType | null;
  latestEvaluatedAt: Date | null;
}

export interface ExecutionResultEvaluationRuleInput {
  status: string;
  runtimeStatus: string;
  errorType: string | null;
  retryable: boolean;
  durationMs: number;
}

export interface ExecutionEvaluationAnalytics {
  evaluationCount: number;
  resultCount: number;
  jobCount: number;
  averageQualityScore: number | null;
  averageCostScore: number | null;
  averageLatencyScore: number | null;
  lowQualityCount: number;
  evaluatorTypeCounts: Record<string, number>;
  latestEvaluatedAt: Date | null;
}

export interface ExecutionEvaluationModelComparisonItem {
  model: string;
  evaluationCount: number;
  resultCount: number;
  jobCount: number;
  averageQualityScore: number;
  averageCostScore: number;
  averageLatencyScore: number;
  compositeScore: number;
  latestEvaluatedAt: Date;
}

export interface ExecutionEvaluationModelComparison {
  mode: "evaluation_model_comparison";
  modelTagPrefix: typeof MODEL_TAG_PREFIX;
  modelPrefix: string | null;
  comparedModelCount: number;
  unclassifiedEvaluationCount: number;
  llmCallsPerformed: false;
  writesPerformed: false;
  items: ExecutionEvaluationModelComparisonItem[];
}

export interface ExecutionEvaluationCostEstimate {
  source: string;
  amountCents: number;
  currency: string;
}

export interface ExecutionEvaluationTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ExecutionEvaluationQuotaDecision {
  status: string;
  distributed: boolean;
  usedRequests: number;
  usedCostCents: number;
}

export interface ExecutionEvaluationCostAttributionItem {
  evaluationId: string;
  executionResultId: string;
  executionJobId: string;
  evaluatorType: ExecutionResultEvaluatorType;
  costScore: number;
  attributionStatus: "attributed" | "unattributed";
  costEstimate: ExecutionEvaluationCostEstimate | null;
  tokenUsage: ExecutionEvaluationTokenUsage | null;
  quotaDecision: ExecutionEvaluationQuotaDecision | null;
}

export interface ExecutionEvaluationCostAttribution {
  mode: "evaluation_cost_attribution";
  jobId: string | null;
  evaluationCount: number;
  attributedEvaluationCount: number;
  unattributedEvaluationCount: number;
  totalEstimatedCostCents: number;
  costSourceCounts: Record<string, number>;
  tokenUsageTotals: ExecutionEvaluationTokenUsage;
  llmCallsPerformed: false;
  writesPerformed: false;
  items: ExecutionEvaluationCostAttributionItem[];
}

export interface LowQualityEvaluationItem {
  evaluationId: string;
  executionResultId: string;
  executionJobId: string;
  evaluatorType: ExecutionResultEvaluatorType;
  qualityScore: number;
  costScore: number;
  latencyScore: number;
  lowestScore: number;
  notes: string | null;
  tags: string[];
  createdAt: Date;
}

export interface LowQualityEvaluationList {
  threshold: number;
  limit: number;
  items: LowQualityEvaluationItem[];
}

const MODEL_TAG_PREFIX = "model:";

export function validateExecutionResultEvaluation(input: ExecutionResultEvaluationInput): void {
  if (!EXECUTION_RESULT_EVALUATOR_TYPES.includes(input.evaluator_type as ExecutionResultEvaluatorType))
    throw new ValidationError(`execution result evaluator_type is invalid: ${input.evaluator_type}`);
  validateScore(input.quality_score, "quality_score");
  validateScore(input.cost_score, "cost_score");
  validateScore(input.latency_score, "latency_score");
  if (input.notes !== undefined && input.notes !== null && input.notes.length > 4000)
    throw new ValidationError("execution result evaluation notes is too long");
  for (const tag of input.tags ?? []) {
    if (tag.trim().length === 0) throw new ValidationError("execution result evaluation tags cannot contain blank values");
  }
}

export function buildRuleEvaluation(input: ExecutionResultEvaluationRuleInput): CreateExecutionResultEvaluationBody {
  const success = input.status === "success" && input.runtimeStatus === "success";
  const retryableFailure = input.status === "failed" && input.retryable;
  return {
    evaluator_type: "rule",
    quality_score: success ? 100 : retryableFailure ? 55 : 40,
    cost_score: input.errorType === "rate_limited" ? 30 : 100,
    latency_score: scoreLatency(input.durationMs),
    notes: `deterministic rule evaluation: status=${input.status}; runtime_status=${input.runtimeStatus}; error_type=${input.errorType ?? "none"}; duration_ms=${input.durationMs}`,
    tags: normalizeEvaluationTags([
      "rule",
      "deterministic",
      input.runtimeStatus === "success" ? "runtime-success" : `runtime-${input.runtimeStatus}`,
      input.errorType ? `error-${input.errorType}` : "",
    ]),
  };
}

export function summarizeEvaluationAnalytics(
  rows: Array<{
    executionResultId: string;
    executionJobId: string;
    evaluatorType: string;
    qualityScore: number;
    costScore: number;
    latencyScore: number;
    createdAt: Date;
  }>,
  lowQualityThreshold = 60,
): ExecutionEvaluationAnalytics {
  if (rows.length === 0) {
    return {
      evaluationCount: 0,
      resultCount: 0,
      jobCount: 0,
      averageQualityScore: null,
      averageCostScore: null,
      averageLatencyScore: null,
      lowQualityCount: 0,
      evaluatorTypeCounts: {},
      latestEvaluatedAt: null,
    };
  }
  const resultIds = new Set(rows.map((row) => row.executionResultId));
  const jobIds = new Set(rows.map((row) => row.executionJobId));
  const evaluatorTypeCounts: Record<string, number> = {};
  for (const row of rows) evaluatorTypeCounts[row.evaluatorType] = (evaluatorTypeCounts[row.evaluatorType] ?? 0) + 1;
  const latest = rows.reduce((current, row) => row.createdAt > current.createdAt ? row : current, rows[0]!);
  return {
    evaluationCount: rows.length,
    resultCount: resultIds.size,
    jobCount: jobIds.size,
    averageQualityScore: average(rows.map((row) => row.qualityScore)),
    averageCostScore: average(rows.map((row) => row.costScore)),
    averageLatencyScore: average(rows.map((row) => row.latencyScore)),
    lowQualityCount: rows.filter((row) => lowestScore(row) <= lowQualityThreshold).length,
    evaluatorTypeCounts,
    latestEvaluatedAt: latest.createdAt,
  };
}

export function compareEvaluationsByModel(
  rows: Array<{
    executionResultId: string;
    executionJobId: string;
    qualityScore: number;
    costScore: number;
    latencyScore: number;
    tags: string[];
    createdAt: Date;
  }>,
  options: { modelPrefix?: string; limit?: number } = {},
): ExecutionEvaluationModelComparison {
  const modelPrefix = normalizeModelPrefix(options.modelPrefix);
  const groups = new Map<string, typeof rows>();
  let unclassifiedEvaluationCount = 0;

  for (const row of rows) {
    const model = extractModel(row.tags);
    if (!model) {
      if (!modelPrefix) unclassifiedEvaluationCount += 1;
      continue;
    }
    if (modelPrefix && !model.startsWith(modelPrefix)) continue;
    const group = groups.get(model) ?? [];
    group.push(row);
    groups.set(model, group);
  }

  const items = [...groups.entries()]
    .map(([model, group]) => summarizeModelGroup(model, group))
    .sort((left, right) =>
      right.compositeScore - left.compositeScore ||
      right.averageQualityScore - left.averageQualityScore ||
      left.model.localeCompare(right.model),
    );

  return {
    mode: "evaluation_model_comparison",
    modelTagPrefix: MODEL_TAG_PREFIX,
    modelPrefix,
    comparedModelCount: items.length,
    unclassifiedEvaluationCount,
    llmCallsPerformed: false,
    writesPerformed: false,
    items: items.slice(0, options.limit ?? 20),
  };
}

export function attributeEvaluationCosts(
  rows: Array<{
    evaluationId: string;
    executionResultId: string;
    executionJobId: string;
    evaluatorType: string;
    costScore: number;
    responseSnapshot: Record<string, unknown>;
  }>,
  options: { jobId?: string; limit?: number } = {},
): ExecutionEvaluationCostAttribution {
  const items = rows.slice(0, options.limit ?? rows.length).map((row) => {
    const metadata = responseMetadata(row.responseSnapshot);
    const costEstimate = parseCostEstimate(metadata?.costEstimate);
    const attributionStatus: ExecutionEvaluationCostAttributionItem["attributionStatus"] =
      costEstimate ? "attributed" : "unattributed";
    return {
      evaluationId: row.evaluationId,
      executionResultId: row.executionResultId,
      executionJobId: row.executionJobId,
      evaluatorType: row.evaluatorType as ExecutionResultEvaluatorType,
      costScore: row.costScore,
      attributionStatus,
      costEstimate,
      tokenUsage: parseTokenUsage(metadata?.tokenUsage),
      quotaDecision: parseQuotaDecision(metadata?.quotaDecision),
    };
  });
  const tokenUsageTotals = items.reduce<ExecutionEvaluationTokenUsage>(
    (totals, item) => ({
      promptTokens: totals.promptTokens + (item.tokenUsage?.promptTokens ?? 0),
      completionTokens: totals.completionTokens + (item.tokenUsage?.completionTokens ?? 0),
      totalTokens: totals.totalTokens + (item.tokenUsage?.totalTokens ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
  const costSourceCounts: Record<string, number> = {};
  for (const item of items) {
    if (!item.costEstimate) continue;
    costSourceCounts[item.costEstimate.source] = (costSourceCounts[item.costEstimate.source] ?? 0) + 1;
  }
  const attributedEvaluationCount = items.filter((item) => item.attributionStatus === "attributed").length;
  return {
    mode: "evaluation_cost_attribution",
    jobId: options.jobId ?? null,
    evaluationCount: items.length,
    attributedEvaluationCount,
    unattributedEvaluationCount: items.length - attributedEvaluationCount,
    totalEstimatedCostCents: items.reduce((sum, item) => sum + (item.costEstimate?.amountCents ?? 0), 0),
    costSourceCounts,
    tokenUsageTotals,
    llmCallsPerformed: false,
    writesPerformed: false,
    items,
  };
}

export function listLowQualityEvaluations(
  rows: Array<{
    id: string;
    executionResultId: string;
    executionJobId: string;
    evaluatorType: string;
    qualityScore: number;
    costScore: number;
    latencyScore: number;
    notes: string | null;
    tags: string[];
    createdAt: Date;
  }>,
  threshold: number,
  limit: number,
): LowQualityEvaluationList {
  return {
    threshold,
    limit,
    items: rows
      .map((row) => ({ row, score: lowestScore(row) }))
      .filter(({ score }) => score <= threshold)
      .sort((a, b) => a.score - b.score || b.row.createdAt.getTime() - a.row.createdAt.getTime())
      .slice(0, limit)
      .map(({ row, score }) => ({
        evaluationId: row.id,
        executionResultId: row.executionResultId,
        executionJobId: row.executionJobId,
        evaluatorType: row.evaluatorType as ExecutionResultEvaluatorType,
        qualityScore: row.qualityScore,
        costScore: row.costScore,
        latencyScore: row.latencyScore,
        lowestScore: score,
        notes: row.notes,
        tags: row.tags,
        createdAt: row.createdAt,
      })),
  };
}

export function normalizeEvaluationTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function normalizeModelPrefix(modelPrefix: string | undefined): string | null {
  const normalized = modelPrefix?.trim();
  return normalized ? normalized : null;
}

function extractModel(tags: string[]): string | null {
  const tag = tags.find((item) => item.startsWith(MODEL_TAG_PREFIX));
  const model = tag?.slice(MODEL_TAG_PREFIX.length).trim();
  return model ? model : null;
}

function responseMetadata(responseSnapshot: Record<string, unknown>): Record<string, unknown> | null {
  const metadata = responseSnapshot.metadata;
  return isRecord(metadata) ? metadata : null;
}

function parseCostEstimate(value: unknown): ExecutionEvaluationCostEstimate | null {
  if (!isRecord(value)) return null;
  const source = value.source;
  const amountCents = value.amountCents;
  const currency = value.currency;
  if (typeof source !== "string" || !isNonNegativeInteger(amountCents) || typeof currency !== "string") return null;
  return { source, amountCents, currency };
}

function parseTokenUsage(value: unknown): ExecutionEvaluationTokenUsage | null {
  if (!isRecord(value)) return null;
  const promptTokens = value.promptTokens;
  const completionTokens = value.completionTokens;
  const totalTokens = value.totalTokens;
  if (
    !isNonNegativeInteger(promptTokens) ||
    !isNonNegativeInteger(completionTokens) ||
    !isNonNegativeInteger(totalTokens)
  )
    return null;
  return { promptTokens, completionTokens, totalTokens };
}

function parseQuotaDecision(value: unknown): ExecutionEvaluationQuotaDecision | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  const distributed = value.distributed;
  const usedRequests = value.usedRequests;
  const usedCostCents = value.usedCostCents;
  if (
    typeof status !== "string" ||
    typeof distributed !== "boolean" ||
    !isNonNegativeInteger(usedRequests) ||
    !isNonNegativeInteger(usedCostCents)
  )
    return null;
  return { status, distributed, usedRequests, usedCostCents };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function summarizeModelGroup(
  model: string,
  rows: Array<{
    executionResultId: string;
    executionJobId: string;
    qualityScore: number;
    costScore: number;
    latencyScore: number;
    createdAt: Date;
  }>,
): ExecutionEvaluationModelComparisonItem {
  const resultIds = new Set(rows.map((row) => row.executionResultId));
  const jobIds = new Set(rows.map((row) => row.executionJobId));
  const latest = rows.reduce((current, row) => row.createdAt > current.createdAt ? row : current, rows[0]!);
  return {
    model,
    evaluationCount: rows.length,
    resultCount: resultIds.size,
    jobCount: jobIds.size,
    averageQualityScore: average(rows.map((row) => row.qualityScore)),
    averageCostScore: average(rows.map((row) => row.costScore)),
    averageLatencyScore: average(rows.map((row) => row.latencyScore)),
    compositeScore: average(rows.map((row) => (row.qualityScore + row.costScore + row.latencyScore) / 3)),
    latestEvaluatedAt: latest.createdAt,
  };
}

export function summarizeEvaluations(
  jobId: string,
  rows: Array<{
    evaluatorType: string;
    qualityScore: number;
    costScore: number;
    latencyScore: number;
    createdAt: Date;
  }>,
): ExecutionResultEvaluationSummary {
  if (rows.length === 0) {
    return {
      jobId,
      evaluationCount: 0,
      averageQualityScore: null,
      averageCostScore: null,
      averageLatencyScore: null,
      latestEvaluatorType: null,
      latestEvaluatedAt: null,
    };
  }
  const latest = rows.reduce((current, row) => row.createdAt > current.createdAt ? row : current, rows[0]!);
  return {
    jobId,
    evaluationCount: rows.length,
    averageQualityScore: average(rows.map((row) => row.qualityScore)),
    averageCostScore: average(rows.map((row) => row.costScore)),
    averageLatencyScore: average(rows.map((row) => row.latencyScore)),
    latestEvaluatorType: latest.evaluatorType as ExecutionResultEvaluatorType,
    latestEvaluatedAt: latest.createdAt,
  };
}

function validateScore(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new ValidationError(`execution result evaluation ${field} must be an integer between 0 and 100`);
}

function average(values: number[]): number {
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function lowestScore(input: { qualityScore: number; costScore: number; latencyScore: number }): number {
  return Math.min(input.qualityScore, input.costScore, input.latencyScore);
}

function scoreLatency(durationMs: number): number {
  if (durationMs <= 1000) return 100;
  if (durationMs <= 5000) return 80;
  if (durationMs <= 15000) return 60;
  return 40;
}
