import type { ExecutionJobStatus, ExecutionJobType } from "@cf/shared";
import { ValidationError } from "../errors.js";
import type { ExecutionResultSummary } from "./result.js";

export type StagingSmokeRuntimeMode = "mock_only";

export interface StagingSmokeRunRequest {
  runtimeMode: StagingSmokeRuntimeMode;
  maxJobs: number;
}

export interface StagingSmokeReadiness {
  mode: "staging_smoke_readiness";
  ready: boolean;
  status: "ready" | "blocked";
  enabled: boolean;
  runtimeMode: StagingSmokeRuntimeMode;
  maxJobs: number;
  externalCallPerformed: false;
  networkPushEnabled: false;
  runEndpoint: "/api/execution/ops/staging-smoke-runs";
  missingRequirements: string[];
  warnings: string[];
}

export interface StagingSmokePlan {
  mode: "staging_smoke_plan";
  externalCallPerformed: false;
  requiresManualExecution: boolean;
  steps: string[];
  rollbackFlags: string[];
}

export interface StagingSmokeReport {
  mode: "staging_smoke_report";
  enabled: true;
  externalCallPerformed: false;
  runtimeMode: StagingSmokeRuntimeMode;
  jobId: string;
  jobType: ExecutionJobType;
  jobStatus: ExecutionJobStatus;
  resultSummary: ExecutionResultSummary;
  outboxEventCount: number;
  writebackStatusCounts: {
    planned: number;
    applied: number;
    skipped: number;
    failed: number;
  };
  warnings: string[];
  completedAt: Date;
}

export function validateStagingSmokeRunRequest(req: StagingSmokeRunRequest): void {
  if (req.runtimeMode !== "mock_only")
    throw new ValidationError(`unsupported staging smoke runtime mode: ${String(req.runtimeMode)}`);
  if (!Number.isInteger(req.maxJobs) || req.maxJobs < 1)
    throw new ValidationError("staging smoke maxJobs must be an integer >= 1");
}

export function buildStagingSmokeReadiness(input: {
  enabled: boolean;
  runtimeMode: StagingSmokeRuntimeMode;
  maxJobs: number;
}): StagingSmokeReadiness {
  validateStagingSmokeRunRequest({ runtimeMode: input.runtimeMode, maxJobs: input.maxJobs });
  const missingRequirements = input.enabled ? [] : ["staging smoke automation must be enabled"];
  return {
    mode: "staging_smoke_readiness",
    ready: missingRequirements.length === 0,
    status: missingRequirements.length === 0 ? "ready" : "blocked",
    enabled: input.enabled,
    runtimeMode: input.runtimeMode,
    maxJobs: input.maxJobs,
    externalCallPerformed: false,
    networkPushEnabled: false,
    runEndpoint: "/api/execution/ops/staging-smoke-runs",
    missingRequirements,
    warnings: ["staging smoke runs are mock-only and do not call real providers"],
  };
}

export function buildStagingSmokePlan(input: { automated: boolean }): StagingSmokePlan {
  return {
    mode: "staging_smoke_plan",
    externalCallPerformed: false,
    requiresManualExecution: !input.automated,
    steps: [
      "verify production-readiness-p1 ready=true",
      "check staging-smoke-readiness ready=true",
      "POST staging-smoke-runs to create one mock-only execution job",
      "tick agent job once",
      "verify execution_results, outbox_events and execution_writebacks",
    ],
    rollbackFlags: [
      "EXECUTION_STAGING_SMOKE_ENABLED=false",
      "EXECUTION_RUNTIME_MODE=mock",
      "EXECUTION_RUNTIME_ADAPTER_MODE=mock",
      "EXECUTION_ALLOW_REAL_RUNTIME=false",
      "EXECUTION_ALLOW_NETWORK=false",
      "EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false",
    ],
  };
}

export function buildStagingSmokeReport(input: Omit<StagingSmokeReport, "mode" | "enabled" | "externalCallPerformed">): StagingSmokeReport {
  return {
    mode: "staging_smoke_report",
    enabled: true,
    externalCallPerformed: false,
    ...input,
  };
}
