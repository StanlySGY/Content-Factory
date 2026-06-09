import { ValidationError } from "../errors.js";

export type ExecutionMonitoringMetricName =
  | "content_factory_execution_jobs_pending"
  | "content_factory_execution_jobs_running"
  | "content_factory_execution_jobs_failed"
  | "content_factory_execution_jobs_stale_running"
  | "content_factory_execution_outbox_unprocessed"
  | "content_factory_execution_outbox_failed"
  | "content_factory_execution_writebacks_failed_or_skipped"
  | "content_factory_execution_results_rate_limited"
  | "content_factory_execution_latest_result_timestamp_seconds";

export interface ExecutionMonitoringMetric {
  name: ExecutionMonitoringMetricName | string;
  type: "gauge";
  value: number;
  labels: Record<string, string>;
  help: string;
}

export interface ExecutionMonitoringMetricInput {
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  staleRunningJobs: number;
  unprocessedOutboxEvents: number;
  failedOutboxEvents: number;
  failedOrSkippedWritebacks: number;
  rateLimitedResults: number;
  latestResultAt: Date | null;
}

export interface ExecutionAlertRule {
  id: string;
  metric: ExecutionMonitoringMetricName;
  severity: "warning" | "critical";
  threshold: number;
  comparison: "gt" | "gte";
  enabled: boolean;
}

export interface ExecutionMonitoringThresholds {
  failedJobs: number;
  outboxBacklog: number;
  writebackFailed: number;
  rateLimited: number;
}

export interface ExecutionMonitoringReadiness {
  mode: "execution_monitoring_readiness";
  ready: boolean;
  status: "ready" | "blocked";
  exporterEnabled: boolean;
  exporterFormat: "prometheus_text";
  pullBased: true;
  networkPushEnabled: false;
  missingRequirements: string[];
  warnings: string[];
  rules: ExecutionAlertRule[];
}

export interface ExecutionMonitoringReadinessInput {
  monitoringEnabled: boolean;
  exporterFormat: "prometheus_text";
  thresholds: ExecutionMonitoringThresholds;
}

const METRIC_HELP: Record<ExecutionMonitoringMetricName, string> = {
  content_factory_execution_jobs_pending: "Pending execution jobs.",
  content_factory_execution_jobs_running: "Running execution jobs.",
  content_factory_execution_jobs_failed: "Failed execution jobs.",
  content_factory_execution_jobs_stale_running: "Stale running execution jobs.",
  content_factory_execution_outbox_unprocessed: "Unprocessed execution outbox events.",
  content_factory_execution_outbox_failed: "Failed unprocessed execution outbox events.",
  content_factory_execution_writebacks_failed_or_skipped: "Failed or skipped execution writebacks.",
  content_factory_execution_results_rate_limited: "Execution results with rate_limited error type.",
  content_factory_execution_latest_result_timestamp_seconds: "Latest execution result timestamp in Unix seconds.",
};

function metric(name: ExecutionMonitoringMetricName, value: number): ExecutionMonitoringMetric {
  return { name, type: "gauge", value, labels: {}, help: METRIC_HELP[name] };
}

export function buildExecutionMonitoringMetrics(
  input: ExecutionMonitoringMetricInput,
): ExecutionMonitoringMetric[] {
  return [
    metric("content_factory_execution_jobs_pending", input.pendingJobs),
    metric("content_factory_execution_jobs_running", input.runningJobs),
    metric("content_factory_execution_jobs_failed", input.failedJobs),
    metric("content_factory_execution_jobs_stale_running", input.staleRunningJobs),
    metric("content_factory_execution_outbox_unprocessed", input.unprocessedOutboxEvents),
    metric("content_factory_execution_outbox_failed", input.failedOutboxEvents),
    metric("content_factory_execution_writebacks_failed_or_skipped", input.failedOrSkippedWritebacks),
    metric("content_factory_execution_results_rate_limited", input.rateLimitedResults),
    metric(
      "content_factory_execution_latest_result_timestamp_seconds",
      input.latestResultAt ? Math.floor(input.latestResultAt.getTime() / 1000) : 0,
    ),
  ];
}

export function buildExecutionAlertRules(thresholds: ExecutionMonitoringThresholds): ExecutionAlertRule[] {
  return [
    {
      id: "execution_results_rate_limited",
      metric: "content_factory_execution_results_rate_limited",
      severity: "warning",
      threshold: thresholds.rateLimited,
      comparison: "gte",
      enabled: true,
    },
    {
      id: "execution_jobs_failed",
      metric: "content_factory_execution_jobs_failed",
      severity: "critical",
      threshold: thresholds.failedJobs,
      comparison: "gte",
      enabled: true,
    },
    {
      id: "execution_outbox_unprocessed",
      metric: "content_factory_execution_outbox_unprocessed",
      severity: "warning",
      threshold: thresholds.outboxBacklog,
      comparison: "gte",
      enabled: true,
    },
    {
      id: "execution_writebacks_failed_or_skipped",
      metric: "content_factory_execution_writebacks_failed_or_skipped",
      severity: "critical",
      threshold: thresholds.writebackFailed,
      comparison: "gte",
      enabled: true,
    },
  ];
}

export function buildExecutionMonitoringReadiness(
  input: ExecutionMonitoringReadinessInput,
): ExecutionMonitoringReadiness {
  if (input.exporterFormat !== "prometheus_text")
    throw new ValidationError(`unsupported execution monitoring exporter format: ${String(input.exporterFormat)}`);
  const missingRequirements = input.monitoringEnabled ? [] : ["execution monitoring must be enabled"];
  return {
    mode: "execution_monitoring_readiness",
    ready: missingRequirements.length === 0,
    status: missingRequirements.length === 0 ? "ready" : "blocked",
    exporterEnabled: input.monitoringEnabled,
    exporterFormat: input.exporterFormat,
    pullBased: true,
    networkPushEnabled: false,
    missingRequirements,
    warnings: ["push metrics and external alert delivery are not enabled"],
    rules: buildExecutionAlertRules(input.thresholds),
  };
}

function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, "\\\"");
}

function labelsText(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(",")}}`;
}

export function serializePrometheusTextMetrics(metrics: ExecutionMonitoringMetric[]): string {
  const lines: string[] = [];
  for (const m of metrics) {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(m.name)) throw new ValidationError(`invalid metric name: ${m.name}`);
    if (!Number.isFinite(m.value)) throw new ValidationError(`invalid metric value for ${m.name}`);
    lines.push(`# HELP ${m.name} ${m.help}`);
    lines.push(`# TYPE ${m.name} ${m.type}`);
    lines.push(`${m.name}${labelsText(m.labels)} ${m.value}`);
  }
  return `${lines.join("\n")}\n`;
}
