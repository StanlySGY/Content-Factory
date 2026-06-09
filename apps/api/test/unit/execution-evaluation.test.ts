import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  normalizeEvaluationTags,
  summarizeEvaluations,
  validateExecutionResultEvaluation,
} from "../../src/domain/execution/evaluation.js";

describe("Execution result evaluation domain", () => {
  it("validates evaluator type, integer scores, notes length, and nonblank tags", () => {
    expect(() =>
      validateExecutionResultEvaluation({
        evaluator_type: "human",
        quality_score: 90,
        cost_score: 80,
        latency_score: 70,
        notes: "ok",
        tags: ["release"],
      }),
    ).not.toThrow();
    expect(() =>
      validateExecutionResultEvaluation({
        evaluator_type: "llm",
        quality_score: 90,
        cost_score: 80,
        latency_score: 70,
        tags: [],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionResultEvaluation({
        evaluator_type: "rule",
        quality_score: 101,
        cost_score: 80,
        latency_score: 70,
        tags: [],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionResultEvaluation({
        evaluator_type: "rule",
        quality_score: 99.5,
        cost_score: 80,
        latency_score: 70,
        tags: [],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionResultEvaluation({
        evaluator_type: "rule",
        quality_score: 90,
        cost_score: 80,
        latency_score: 70,
        notes: "x".repeat(4001),
        tags: [],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionResultEvaluation({
        evaluator_type: "rule",
        quality_score: 90,
        cost_score: 80,
        latency_score: 70,
        tags: [" "],
      }),
    ).toThrow(ValidationError);
  });

  it("normalizes tags deterministically", () => {
    expect(normalizeEvaluationTags([" useful ", "release", "useful", ""])).toEqual(["useful", "release"]);
  });

  it("summarizes empty and populated evaluation rows", () => {
    expect(summarizeEvaluations("job-1", [])).toEqual({
      jobId: "job-1",
      evaluationCount: 0,
      averageQualityScore: null,
      averageCostScore: null,
      averageLatencyScore: null,
      latestEvaluatorType: null,
      latestEvaluatedAt: null,
    });

    const first = new Date("2026-01-01T00:00:00.000Z");
    const latest = new Date("2026-01-02T00:00:00.000Z");
    expect(
      summarizeEvaluations("job-1", [
        { evaluatorType: "human", qualityScore: 91, costScore: 80, latencyScore: 71, createdAt: first },
        { evaluatorType: "rule", qualityScore: 92, costScore: 90, latencyScore: 73, createdAt: latest },
      ]),
    ).toEqual({
      jobId: "job-1",
      evaluationCount: 2,
      averageQualityScore: 91.5,
      averageCostScore: 85,
      averageLatencyScore: 72,
      latestEvaluatorType: "rule",
      latestEvaluatedAt: latest,
    });
  });
});
