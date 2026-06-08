import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  classifyQuotaDecision,
  shouldThrottleProviderRequest,
  validateQuotaPolicy,
} from "../../src/application/runtime/agent-provider-quota-policy.js";

describe("Agent provider quota policy", () => {
  it("allows requests below quota and throttles at limit", () => {
    const base = { provider: "fake", scope: "project", maxRequestsPerWindow: 2, windowMs: 60000 };

    expect(classifyQuotaDecision({ ...base, currentCount: 1 })).toEqual({ status: "allow", retryAfterMs: 0 });
    expect(classifyQuotaDecision({ ...base, currentCount: 2 })).toEqual({ status: "throttle", retryAfterMs: 60000 });
    expect(shouldThrottleProviderRequest({ ...base, currentCount: 2 })).toBe(true);
  });

  it("validates quota policy shape", () => {
    expect(() => validateQuotaPolicy({
      provider: "fake",
      scope: "project",
      maxRequestsPerWindow: 0,
      windowMs: 60000,
      currentCount: 0,
    })).toThrow(ValidationError);
  });
});
