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

export function normalizeEvaluationTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
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

function scoreLatency(durationMs: number): number {
  if (durationMs <= 1000) return 100;
  if (durationMs <= 5000) return 80;
  if (durationMs <= 15000) return 60;
  return 40;
}
