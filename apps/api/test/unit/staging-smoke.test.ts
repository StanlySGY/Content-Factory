import { describe, expect, it } from "vitest";
import {
  buildStagingSmokeReadiness,
  buildStagingSmokeReport,
  validateStagingSmokeRunRequest,
} from "../../src/domain/execution/staging-smoke.js";

describe("staging smoke domain", () => {
  it("builds fail-closed readiness when disabled", () => {
    const readiness = buildStagingSmokeReadiness({
      enabled: false,
      runtimeMode: "mock_only",
      maxJobs: 1,
    });

    expect(readiness).toMatchObject({
      mode: "staging_smoke_readiness",
      ready: false,
      status: "blocked",
      externalCallPerformed: false,
      networkPushEnabled: false,
      runEndpoint: "/api/execution/ops/staging-smoke-runs",
    });
    expect(readiness.missingRequirements).toContain("staging smoke automation must be enabled");
  });

  it("rejects unsupported runtime mode and invalid max jobs", () => {
    expect(() => validateStagingSmokeRunRequest({ runtimeMode: "unsupported" as "mock_only", maxJobs: 1 }))
      .toThrow("unsupported staging smoke runtime mode");
    expect(() => validateStagingSmokeRunRequest({ runtimeMode: "mock_only", maxJobs: 0 }))
      .toThrow("staging smoke maxJobs must be an integer >= 1");
  });

  it("builds a report without runtime snapshots or payload material", () => {
    const report = buildStagingSmokeReport({
      runtimeMode: "mock_only",
      jobId: "00000000-0000-0000-0000-000000000001",
      jobType: "agent",
      jobStatus: "success",
      resultSummary: {
        attempts: 1,
        latestStatus: "success",
        latestErrorType: null,
        latestRetryable: false,
        totalDurationMs: 0,
      },
      outboxEventCount: 3,
      writebackStatusCounts: { planned: 0, applied: 0, skipped: 0, failed: 0 },
      warnings: [],
      completedAt: new Date("2026-06-09T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      mode: "staging_smoke_report",
      enabled: true,
      externalCallPerformed: false,
      runtimeMode: "mock_only",
    });
    expect(JSON.stringify(report)).not.toContain("payload");
    expect(JSON.stringify(report)).not.toContain("prompt");
  });
});
