import { describe, expect, it } from "vitest";
import {
  buildExecutionMonitoringMetrics,
  buildExecutionMonitoringReadiness,
  serializePrometheusTextMetrics,
} from "../../src/domain/execution/monitoring.js";

describe("execution monitoring contract", () => {
  it("serializes prometheus text metrics with escaped labels", () => {
    const metrics = buildExecutionMonitoringMetrics({
      pendingJobs: 2,
      runningJobs: 1,
      failedJobs: 3,
      staleRunningJobs: 4,
      unprocessedOutboxEvents: 5,
      failedOutboxEvents: 6,
      failedOrSkippedWritebacks: 7,
      rateLimitedResults: 8,
      latestResultAt: new Date("2026-06-09T00:00:00.000Z"),
    });
    metrics.push({
      name: "content_factory_execution_test_metric",
      type: "gauge",
      value: 1,
      labels: { reason: "quote\"slash\\newline\n" },
      help: "Escaping check",
    });

    const text = serializePrometheusTextMetrics(metrics);

    expect(text).toContain("# HELP content_factory_execution_jobs_pending Pending execution jobs.");
    expect(text).toContain("# TYPE content_factory_execution_jobs_pending gauge");
    expect(text).toContain("content_factory_execution_jobs_pending 2");
    expect(text).toContain("content_factory_execution_latest_result_timestamp_seconds 1780963200");
    expect(text).toContain('content_factory_execution_test_metric{reason="quote\\"slash\\\\newline\\n"} 1');
    expect(text).not.toContain("Bearer");
    expect(text).not.toContain("sk-");
  });

  it("reports monitoring readiness as blocked by default and ready when explicitly enabled", () => {
    const disabled = buildExecutionMonitoringReadiness({
      monitoringEnabled: false,
      exporterFormat: "prometheus_text",
      thresholds: {
        failedJobs: 1,
        outboxBacklog: 10,
        writebackFailed: 1,
        rateLimited: 1,
      },
    });
    expect(disabled).toMatchObject({
      mode: "execution_monitoring_readiness",
      ready: false,
      status: "blocked",
      exporterEnabled: false,
      pullBased: true,
      networkPushEnabled: false,
      missingRequirements: ["execution monitoring must be enabled"],
    });

    const enabled = buildExecutionMonitoringReadiness({
      monitoringEnabled: true,
      exporterFormat: "prometheus_text",
      thresholds: {
        failedJobs: 2,
        outboxBacklog: 11,
        writebackFailed: 3,
        rateLimited: 4,
      },
    });
    expect(enabled).toMatchObject({
      ready: true,
      status: "ready",
      exporterEnabled: true,
      exporterFormat: "prometheus_text",
      rules: expect.arrayContaining([
        expect.objectContaining({
          id: "execution_jobs_failed",
          metric: "content_factory_execution_jobs_failed",
          threshold: 2,
          comparison: "gte",
          enabled: true,
        }),
      ]),
    });
  });
});
