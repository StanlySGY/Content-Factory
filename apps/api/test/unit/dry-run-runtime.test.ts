import { describe, expect, it } from "vitest";
import { AgentDryRunRuntime } from "../../src/application/runtime/dry-run-runtimes.js";
import { buildRuntimeExecutionContext, type RuntimeSafetyPolicy } from "../../src/domain/execution/runtime-safety.js";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";

const policy = (over: Partial<RuntimeSafetyPolicy> = {}): RuntimeSafetyPolicy => ({
  mode: "real_enabled",
  allowRealExecution: true,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  allowNetwork: false,
  allowProcessSpawn: false,
  requireCredentialRef: true,
  redactSnapshots: true,
  ...over,
});

const request = (over: Partial<RuntimeRequest> = {}): RuntimeRequest => ({
  jobId: "job-1",
  jobType: "agent",
  payload: { prompt: "dry run" },
  attemptCount: 1,
  idempotencyKey: "idem-1",
  timeoutMs: 30000,
  metadata: {},
  ...over,
});

describe("Dry-run runtimes", () => {
  it("returns dryRun success with descriptor and unresolved credential reference", async () => {
    const runtime = new AgentDryRunRuntime();
    const context = buildRuntimeExecutionContext({
      jobId: "job-1",
      jobType: "agent",
      policy: policy(),
      credentialRef: { provider: "openai", keyRef: "secret://llm/openai", scope: "project" },
    });

    const response = await runtime.execute(request(), context);

    expect(response.status).toBe("success");
    expect(response.output).toMatchObject({
      dryRun: true,
      credential: { provider: "openai", keyRef: "secret://llm/openai", scope: "project", resolved: false },
      inputAccepted: true,
    });
    expect(response.metadata).toMatchObject({
      mode: "dry_run",
      safetyMode: "real_enabled",
      networkAllowed: false,
      processSpawnAllowed: false,
    });
  });

  it("fails when credential ref is required but missing", async () => {
    const runtime = new AgentDryRunRuntime();
    const context = buildRuntimeExecutionContext({ jobId: "job-1", jobType: "agent", policy: policy() });

    const response = await runtime.execute(request(), context);

    expect(response.status).toBe("failed");
    expect(response.errorType).toBe("permission_denied");
  });

  it("fails invalid credential refs and never allows network or process spawn", async () => {
    const runtime = new AgentDryRunRuntime();
    const context = buildRuntimeExecutionContext({
      jobId: "job-1",
      jobType: "agent",
      policy: policy({ requireCredentialRef: false }),
      metadata: { credentialRef: { provider: "openai", keyRef: "sk-live-secret", scope: "project" } },
    });

    const response = await runtime.execute(request(), context);

    expect(response.status).toBe("failed");
    expect(response.errorType).toBe("validation_error");
    expect(response.metadata).toMatchObject({ networkAllowed: false, processSpawnAllowed: false });
  });
});
