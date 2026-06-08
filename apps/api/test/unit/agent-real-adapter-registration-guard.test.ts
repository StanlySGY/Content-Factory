import { describe, expect, it } from "vitest";
import { buildAgentRealAdapterRegistrationGuard } from "../../src/application/runtime/agent-real-adapter-registration-guard.js";

describe("Agent real adapter registration guard", () => {
  it("freezes fail-closed real adapter registration requirements", () => {
    const guard = buildAgentRealAdapterRegistrationGuard({
      activeAdapterMode: "real",
      runtimeSafetyPolicy: {
        mode: "real_enabled",
        allowRealExecution: true,
        allowNetwork: true,
        allowProcessSpawn: false,
        requireCredentialRef: true,
        redactSnapshots: true,
        timeoutMs: 5000,
        maxTimeoutMs: 30000,
      },
      networkAllowlist: ["api.openai.test", "localhost"],
      secretStoreEnabled: false,
      secretInjectionEnabled: false,
    });

    expect(guard).toMatchObject({
      mode: "agent_real_adapter_registration_guard",
      registrationReady: false,
      realAdapterRegistered: false,
      realAdapterWorkerEnabled: false,
      disabledFixtureReady: true,
      disabledFixtureExecutable: false,
      disabledFixture: {
        name: "agent-real-disabled-fixture",
        version: "2.12.0",
        status: "blocked",
      },
      descriptorStatus: "blocked",
      blockedRealAdapterReason: "agent real adapter disabled fixture is not executable",
      requiredAdapterType: "agent",
      requiredAdapterMode: "real",
      configGates: {
        runtimeMode: "real_enabled",
        allowRealRuntime: true,
        activeAdapterMode: "real",
        allowNetwork: true,
        allowProcessSpawn: false,
        requireCredentialRef: true,
        redactSnapshots: true,
      },
      readinessGates: {
        networkAllowlistReady: true,
        secretStoreReady: false,
        secretInjectionReady: false,
        realTransportReady: false,
        timeoutAbortReady: true,
        quotaPreflightReady: true,
        costPreflightReady: true,
      },
      missingRequirements: [
        "agent real adapter executable implementation",
        "real agent adapter implementation",
        "real provider http transport",
        "secret store connection",
        "secret material injection",
        "distributed provider quota enforcement",
        "real provider billing calculation",
      ],
      failClosedError: {
        message: "agent real adapter disabled fixture is not executable",
        retryable: false,
      },
    });
  });
});
