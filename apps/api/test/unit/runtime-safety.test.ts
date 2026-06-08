import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  assertRealExecutionAllowed,
  buildRuntimeExecutionContext,
  createRuntimeAbortController,
  mapProviderErrorToRuntimeError,
  redactRuntimeSnapshot,
  resolveRuntimeMode,
  validateRuntimeCredentialRef,
  validateRuntimeSafetyPolicy,
  withRuntimeTimeout,
  type RuntimeSafetyPolicy,
} from "../../src/domain/execution/runtime-safety.js";

const policy = (over: Partial<RuntimeSafetyPolicy> = {}): RuntimeSafetyPolicy => ({
  mode: "mock",
  allowRealExecution: false,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  allowNetwork: false,
  allowProcessSpawn: false,
  requireCredentialRef: true,
  redactSnapshots: true,
  ...over,
});

describe("Runtime safety domain", () => {
  it("validates runtime safety policy and resolves safe default mode", () => {
    expect(resolveRuntimeMode({})).toBe("mock");
    expect(() => validateRuntimeSafetyPolicy(policy())).not.toThrow();
    expect(() => validateRuntimeSafetyPolicy(policy({ mode: "real_enabled", timeoutMs: 0 }))).toThrow(ValidationError);
    expect(() => validateRuntimeSafetyPolicy(policy({ maxTimeoutMs: 99 }))).toThrow(ValidationError);
    expect(() => validateRuntimeSafetyPolicy(policy({ timeoutMs: 400000 }))).toThrow(ValidationError);
  });

  it("rejects real execution unless the kill switch allows it", () => {
    expect(() => assertRealExecutionAllowed(policy({ mode: "mock" }))).not.toThrow();
    expect(() => assertRealExecutionAllowed(policy({ mode: "real_disabled" }))).toThrow(ValidationError);
    expect(() => assertRealExecutionAllowed(policy({ mode: "real_enabled", allowRealExecution: false }))).toThrow(ValidationError);
    expect(() => assertRealExecutionAllowed(policy({ mode: "real_enabled", allowRealExecution: true }))).not.toThrow();
  });

  it("validates credential refs as references and rejects inline secret-like values", () => {
    expect(() => validateRuntimeCredentialRef({ provider: "openai", keyRef: "secret://llm/openai", scope: "project" })).not.toThrow();
    expect(() => validateRuntimeCredentialRef({ provider: "openai", keyRef: "sk-live-secret", scope: "project" })).toThrow(ValidationError);
    expect(() => validateRuntimeCredentialRef({ provider: " ", keyRef: "secret://x", scope: "project" })).toThrow(ValidationError);
  });

  it("recursively redacts secret-like keys without mutating the original snapshot", () => {
    const original = {
      token: "abc",
      nested: { api_key: "key", safe: "ok" },
      list: [{ password: "pw" }, { value: "visible" }],
      authorization: "Bearer x",
    };
    const redacted = redactRuntimeSnapshot(original);

    expect(redacted).toEqual({
      token: "[REDACTED]",
      nested: { api_key: "[REDACTED]", safe: "ok" },
      list: [{ password: "[REDACTED]" }, { value: "visible" }],
      authorization: "[REDACTED]",
    });
    expect(original.nested.api_key).toBe("key");
  });

  it("maps provider-like errors to runtime error types", () => {
    expect(mapProviderErrorToRuntimeError(Object.assign(new Error("rate limit"), { status: 429 })).errorType).toBe("rate_limited");
    expect(mapProviderErrorToRuntimeError(Object.assign(new Error("aborted"), { name: "AbortError" })).errorType).toBe("timeout");
    expect(mapProviderErrorToRuntimeError(Object.assign(new Error("forbidden"), { status: 403 })).errorType).toBe("permission_denied");
    expect(mapProviderErrorToRuntimeError(Object.assign(new Error("offline"), { code: "ECONNREFUSED" })).errorType).toBe("external_unavailable");
    expect(mapProviderErrorToRuntimeError(Object.assign(new Error("bad request"), { status: 400 })).errorType).toBe("validation_error");
    expect(mapProviderErrorToRuntimeError(new Error("weird")).errorType).toBe("unknown");
  });

  it("creates abortable runtime context and timeout wrapper", async () => {
    const controller = createRuntimeAbortController(10);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(controller.signal.aborted).toBe(true);
    expect(await withRuntimeTimeout(async (signal) => signal.aborted ? "aborted" : "ok", 100)).toBe("ok");

    const context = buildRuntimeExecutionContext({
      jobId: "job-1",
      jobType: "agent",
      timeoutMs: 1000,
      policy: policy(),
      metadata: { subject: { type: "agent_profile", id: "a1" } },
    });
    expect(context.mode).toBe("mock");
    expect(context.abortSignal.aborted).toBe(false);
  });
});
