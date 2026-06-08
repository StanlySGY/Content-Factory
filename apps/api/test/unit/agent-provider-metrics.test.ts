import { describe, expect, it } from "vitest";
import {
  buildAgentProviderMetricsEnvelope,
  validateAgentProviderMetricsEnvelope,
} from "../../src/application/runtime/agent-provider-metrics.js";

describe("Agent provider metrics envelope", () => {
  it("builds not_calculated cost envelope with token usage", () => {
    const metrics = buildAgentProviderMetricsEnvelope({
      provider: "openai_compatible",
      model: "gpt-test",
      durationMs: 12,
      tokenUsage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
      providerRequestId: "req-1",
    });

    expect(metrics.costEstimate).toEqual({ amount: null, currency: null, source: "not_calculated" });
    expect(metrics.tokenUsage?.totalTokens).toBe(3);
    expect(() => validateAgentProviderMetricsEnvelope(metrics)).not.toThrow();
  });

  it("rejects real cost amounts in the preflight envelope", () => {
    const metrics = buildAgentProviderMetricsEnvelope({
      provider: "openai_compatible",
      model: "gpt-test",
      durationMs: 12,
    });

    expect(() => validateAgentProviderMetricsEnvelope({
      ...metrics,
      costEstimate: { amount: 1, currency: "USD", source: "not_calculated" },
    })).toThrow("not_calculated");
  });
});
