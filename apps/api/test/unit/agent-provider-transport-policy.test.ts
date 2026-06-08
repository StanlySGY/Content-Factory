import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  assertTransportAllowed,
  resolveProviderTimeoutMs,
  validateTransportPolicy,
} from "../../src/application/runtime/agent-provider-transport-policy.js";

describe("Agent provider transport policy", () => {
  it("validates transport policy and blocks network/process by default", () => {
    const policy = { allowNetwork: false, allowProcessSpawn: false, timeoutMs: 30000, maxTimeoutMs: 300000 };

    expect(() => validateTransportPolicy(policy)).not.toThrow();
    expect(() => assertTransportAllowed(policy)).not.toThrow();
    expect(() => assertTransportAllowed({ ...policy, allowNetwork: true })).toThrow(ValidationError);
    expect(() => assertTransportAllowed({ ...policy, allowProcessSpawn: true })).toThrow(ValidationError);
  });

  it("resolves timeout within policy bounds", () => {
    const policy = { allowNetwork: false, allowProcessSpawn: false, timeoutMs: 30000, maxTimeoutMs: 60000 };

    expect(resolveProviderTimeoutMs(undefined, policy)).toBe(30000);
    expect(resolveProviderTimeoutMs(1000, policy)).toBe(1000);
    expect(() => resolveProviderTimeoutMs(10, policy)).toThrow(ValidationError);
    expect(() => resolveProviderTimeoutMs(70000, policy)).toThrow(ValidationError);
  });
});
