import type { RuntimeSafetyPolicy } from "../../domain/execution/runtime-safety.js";
import type { RuntimeAdapterMode, RuntimeAdapterStatus } from "./adapter-registry.js";
import { AGENT_REAL_ADAPTER_DISABLED_FIXTURE } from "./agent-real-adapter-disabled-fixture.js";

export const AGENT_REAL_ADAPTER_MISSING_REQUIREMENTS = [
  "agent real adapter executable implementation",
  "real agent adapter implementation",
  "real provider http transport",
  "secret store connection",
  "secret material injection",
  "distributed provider quota enforcement",
  "real provider billing calculation",
] as const;

export interface AgentRealAdapterRegistrationGuard {
  mode: "agent_real_adapter_registration_guard";
  registrationReady: false;
  realAdapterRegistered: false;
  realAdapterWorkerEnabled: false;
  disabledFixtureReady: true;
  disabledFixtureExecutable: false;
  disabledFixture: {
    name: typeof AGENT_REAL_ADAPTER_DISABLED_FIXTURE.name;
    version: typeof AGENT_REAL_ADAPTER_DISABLED_FIXTURE.version;
    status: Extract<RuntimeAdapterStatus, "blocked">;
  };
  descriptorStatus: Extract<RuntimeAdapterStatus, "blocked">;
  blockedRealAdapterReason: typeof AGENT_REAL_ADAPTER_DISABLED_FIXTURE.blockedReason;
  requiredAdapterType: "agent";
  requiredAdapterMode: Extract<RuntimeAdapterMode, "real">;
  configGates: {
    runtimeMode: RuntimeSafetyPolicy["mode"];
    allowRealRuntime: boolean;
    activeAdapterMode: RuntimeAdapterMode;
    allowNetwork: boolean;
    allowProcessSpawn: boolean;
    requireCredentialRef: boolean;
    redactSnapshots: boolean;
  };
  readinessGates: {
    networkAllowlistReady: boolean;
    secretStoreReady: boolean;
    secretInjectionReady: boolean;
    realTransportReady: false;
    timeoutAbortReady: true;
    quotaPreflightReady: true;
    costPreflightReady: true;
  };
  missingRequirements: typeof AGENT_REAL_ADAPTER_MISSING_REQUIREMENTS[number][];
  failClosedError: {
    message: typeof AGENT_REAL_ADAPTER_DISABLED_FIXTURE.blockedReason;
    retryable: false;
  };
}

export function buildAgentRealAdapterRegistrationGuard(input: {
  activeAdapterMode: RuntimeAdapterMode;
  runtimeSafetyPolicy: RuntimeSafetyPolicy;
  networkAllowlist: string[];
  secretStoreEnabled: boolean;
  secretInjectionEnabled: boolean;
}): AgentRealAdapterRegistrationGuard {
  return {
    mode: "agent_real_adapter_registration_guard",
    registrationReady: false,
    realAdapterRegistered: false,
    realAdapterWorkerEnabled: false,
    disabledFixtureReady: true,
    disabledFixtureExecutable: false,
    disabledFixture: {
      name: AGENT_REAL_ADAPTER_DISABLED_FIXTURE.name,
      version: AGENT_REAL_ADAPTER_DISABLED_FIXTURE.version,
      status: "blocked",
    },
    descriptorStatus: "blocked",
    blockedRealAdapterReason: AGENT_REAL_ADAPTER_DISABLED_FIXTURE.blockedReason,
    requiredAdapterType: "agent",
    requiredAdapterMode: "real",
    configGates: {
      runtimeMode: input.runtimeSafetyPolicy.mode,
      allowRealRuntime: input.runtimeSafetyPolicy.allowRealExecution,
      activeAdapterMode: input.activeAdapterMode,
      allowNetwork: input.runtimeSafetyPolicy.allowNetwork,
      allowProcessSpawn: input.runtimeSafetyPolicy.allowProcessSpawn,
      requireCredentialRef: input.runtimeSafetyPolicy.requireCredentialRef,
      redactSnapshots: input.runtimeSafetyPolicy.redactSnapshots,
    },
    readinessGates: {
      networkAllowlistReady: input.networkAllowlist.length > 0,
      secretStoreReady: input.secretStoreEnabled,
      secretInjectionReady: input.secretInjectionEnabled,
      realTransportReady: false,
      timeoutAbortReady: true,
      quotaPreflightReady: true,
      costPreflightReady: true,
    },
    missingRequirements: [...AGENT_REAL_ADAPTER_MISSING_REQUIREMENTS],
    failClosedError: {
      message: AGENT_REAL_ADAPTER_DISABLED_FIXTURE.blockedReason,
      retryable: false,
    },
  };
}
