import { describe, expect, it } from "vitest";
import {
  buildAgentRealProductionTransportGateSnapshot,
  assertAgentRealProductionTransportGate,
} from "../../src/application/runtime/agent-real-production-transport-gate.js";

describe("Agent real production transport gate", () => {
  it("fails closed until every production transport requirement is explicit", () => {
    const snapshot = buildAgentRealProductionTransportGateSnapshot({
      realHttpEnabled: true,
      allowNetwork: true,
      allowedHosts: ["api.openai.test"],
      endpointMapped: true,
      credentialRefPresent: true,
      credentialResolverPresent: false,
      quotaPolicyReady: true,
      costMetricsReady: true,
    });

    expect(snapshot).toMatchObject({
      ready: false,
      missingRequirements: ["credential_resolver"],
      checks: {
        realHttpEnabled: true,
        allowNetwork: true,
        networkAllowlistReady: true,
        endpointMapped: true,
        credentialRefPresent: true,
        credentialResolverPresent: false,
        quotaPolicyReady: true,
        costMetricsReady: true,
      },
    });
    expect(() => assertAgentRealProductionTransportGate(snapshot)).toThrow(/credential_resolver/);
  });

  it("allows production transport only when allowlist, credential resolver, quota and cost are ready", () => {
    const snapshot = buildAgentRealProductionTransportGateSnapshot({
      realHttpEnabled: true,
      allowNetwork: true,
      allowedHosts: ["api.openai.test"],
      endpointMapped: true,
      credentialRefPresent: true,
      credentialResolverPresent: true,
      quotaPolicyReady: true,
      costMetricsReady: true,
    });

    expect(snapshot).toMatchObject({
      ready: true,
      missingRequirements: [],
      checks: {
        networkAllowlistReady: true,
        credentialResolverPresent: true,
        quotaPolicyReady: true,
        costMetricsReady: true,
      },
    });
    expect(() => assertAgentRealProductionTransportGate(snapshot)).not.toThrow();
  });
});
