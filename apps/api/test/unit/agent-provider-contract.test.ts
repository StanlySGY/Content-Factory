import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildAgentProviderRequestFromRuntime,
  mapAgentProviderErrorToRuntimeError,
  validateAgentProviderRequest,
  validateAgentProviderResponse,
  type AgentProviderErrorType,
} from "../../src/application/runtime/agent-provider-contract.js";
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

const runtimeRequest = (over: Partial<RuntimeRequest> = {}): RuntimeRequest => ({
  jobId: "job-1",
  jobType: "agent",
  payload: { prompt: "fake" },
  attemptCount: 1,
  idempotencyKey: "idem-1",
  timeoutMs: 30000,
  metadata: {},
  ...over,
});

describe("Agent provider contract", () => {
  it("validates provider request and response", () => {
    const req = {
      jobId: "job-1",
      input: { prompt: "fake" },
      credentialRef: { provider: "openai", keyRef: "secret://llm/openai", scope: "project" as const },
      timeoutMs: 30000,
      metadata: {},
    };
    const res = {
      status: "success" as const,
      output: { result: "ok" },
      durationMs: 10,
      rawMetadata: { provider: "fake" },
    };

    expect(() => validateAgentProviderRequest(req)).not.toThrow();
    expect(() => validateAgentProviderResponse(res)).not.toThrow();
  });

  it("rejects invalid or inline credential refs", () => {
    expect(() =>
      validateAgentProviderRequest({
        jobId: "job-1",
        input: {},
        credentialRef: { provider: "openai", keyRef: "sk-live-secret", scope: "project" },
        timeoutMs: 30000,
        metadata: {},
      }),
    ).toThrow(ValidationError);
  });

  it("maps provider error types to runtime error types", () => {
    const cases: Array<[AgentProviderErrorType, string]> = [
      ["timeout", "timeout"],
      ["rate_limited", "rate_limited"],
      ["permission_denied", "permission_denied"],
      ["validation_error", "validation_error"],
      ["content_blocked", "blocked"],
      ["external_unavailable", "external_unavailable"],
      ["unknown", "unknown"],
    ];
    for (const [provider, runtime] of cases) {
      expect(mapAgentProviderErrorToRuntimeError(provider)).toBe(runtime);
    }
  });

  it("builds provider request from runtime request and context", () => {
    const context = buildRuntimeExecutionContext({
      jobId: "job-1",
      jobType: "agent",
      policy: policy(),
      credentialRef: { provider: "openai", keyRef: "secret://llm/openai", scope: "project" },
    });

    const req = buildAgentProviderRequestFromRuntime(runtimeRequest(), context);

    expect(req).toMatchObject({
      jobId: "job-1",
      input: { prompt: "fake" },
      credentialRef: { keyRef: "secret://llm/openai" },
      timeoutMs: 30000,
    });
  });
});
