import type { RuntimeAdapterMode, RuntimeMode } from "@cf/shared";
import type { RuntimeSafetyPolicy } from "../../domain/execution/runtime-safety.js";
import type { ProviderQuotaLimits } from "./provider-quota-enforcer.js";

export interface ProductionActivationSecretRef {
  keyRef: string;
  registered: boolean;
  materialAvailable: boolean;
}

export interface ProductionActivationPreflight {
  mode: "production_activation_preflight";
  ready: boolean;
  status: "ready" | "blocked";
  missingRequirements: string[];
  warnings: string[];
  capabilities: {
    agentRealRuntime: boolean;
    workflowStageWriteback: boolean;
    mcpRealRuntime: false;
    publisherRealRuntime: false;
  };
  runtime: {
    mode: RuntimeMode;
    adapterMode: RuntimeAdapterMode;
    allowRealRuntime: boolean;
    allowNetwork: boolean;
    redactSnapshots: boolean;
    timeoutMs: number;
  };
  network: {
    allowlist: string[];
    agentEndpointConfigured: boolean;
    agentEndpointHost: string | null;
  };
  secretRefs: ProductionActivationSecretRef[];
  quota: ProviderQuotaLimits & {
    distributed: false;
  };
  ops: {
    workerEnabled: boolean;
    relayEnabled: boolean;
    writebackExecutorEnabled: boolean;
  };
}

export interface BuildProductionActivationPreflightInput {
  runtimeSafetyPolicy: RuntimeSafetyPolicy;
  runtimeAdapterMode: RuntimeAdapterMode;
  networkAllowlist: string[];
  agentEndpoint: string | null;
  secretStoreEnabled: boolean;
  secretInjectionEnabled: boolean;
  secretRegistry: string[];
  credentialEnvSource: NodeJS.ProcessEnv | Record<string, string | undefined>;
  quotaLimits: ProviderQuotaLimits;
  workerEnabled: boolean;
  relayEnabled: boolean;
  writebackExecutorEnabled: boolean;
}

const REQUIRED_AGENT_KEY_REF = "env://CONTENT_FACTORY_OPENAI_KEY";

function envNameFromKeyRef(keyRef: string): string | null {
  if (!keyRef.startsWith("env://")) return null;
  return keyRef.slice("env://".length);
}

function endpointHost(endpoint: string | null): string | null {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).hostname;
  } catch {
    return null;
  }
}

function addMissing(missing: string[], condition: boolean, message: string): void {
  if (!condition) missing.push(message);
}

export function buildProductionActivationPreflight(
  input: BuildProductionActivationPreflightInput,
): ProductionActivationPreflight {
  const missing: string[] = [];
  const warnings: string[] = [];
  const endpointConfigured = typeof input.agentEndpoint === "string" && input.agentEndpoint.trim().length > 0;
  const host = endpointHost(input.agentEndpoint);
  const requiredSecretRegistered = input.secretRegistry.includes(REQUIRED_AGENT_KEY_REF);
  const requiredSecretEnvName = envNameFromKeyRef(REQUIRED_AGENT_KEY_REF);
  const requiredSecretAvailable = requiredSecretEnvName !== null &&
    typeof input.credentialEnvSource[requiredSecretEnvName] === "string" &&
    input.credentialEnvSource[requiredSecretEnvName]!.trim().length > 0;

  addMissing(missing, input.runtimeSafetyPolicy.mode === "real_enabled", "execution runtime mode must be real_enabled");
  addMissing(missing, input.runtimeAdapterMode === "real", "runtime adapter mode must be real");
  addMissing(missing, input.runtimeSafetyPolicy.allowRealExecution, "real runtime allowance must be enabled");
  addMissing(missing, input.runtimeSafetyPolicy.allowNetwork, "network allowance must be enabled");
  addMissing(missing, input.secretStoreEnabled, "secret store must be enabled");
  addMissing(missing, input.secretInjectionEnabled, "secret injection must be enabled");
  addMissing(missing, endpointConfigured, "agent OpenAI-compatible endpoint must be configured");
  addMissing(missing, host !== null && input.networkAllowlist.includes(host), "agent endpoint host must be allowlisted");
  addMissing(missing, input.runtimeSafetyPolicy.redactSnapshots, "snapshot redaction must be enabled");
  addMissing(missing, requiredSecretRegistered, "secret registry must include env://CONTENT_FACTORY_OPENAI_KEY");
  addMissing(missing, requiredSecretAvailable, "registered env secret material must be available");
  addMissing(missing, input.quotaLimits.dailyRequestLimit !== null, "daily provider request limit must be configured");
  addMissing(missing, input.quotaLimits.dailyCostLimitCents !== null, "daily provider cost limit must be configured");
  addMissing(missing, input.quotaLimits.estimatedCostPerRequestCents > 0, "estimated provider cost per request must be configured");

  if (!input.workerEnabled) warnings.push("execution worker is disabled; production may require a worker process");
  if (!input.relayEnabled) warnings.push("outbox relay is disabled; production may require a relay process");
  if (!input.writebackExecutorEnabled) warnings.push("workflow stage writeback is disabled");
  warnings.push("provider quota is process-local and not distributed");

  const ready = missing.length === 0;
  return {
    mode: "production_activation_preflight",
    ready,
    status: ready ? "ready" : "blocked",
    missingRequirements: missing,
    warnings,
    capabilities: {
      agentRealRuntime: ready,
      workflowStageWriteback: input.writebackExecutorEnabled && ready,
      mcpRealRuntime: false,
      publisherRealRuntime: false,
    },
    runtime: {
      mode: input.runtimeSafetyPolicy.mode,
      adapterMode: input.runtimeAdapterMode,
      allowRealRuntime: input.runtimeSafetyPolicy.allowRealExecution,
      allowNetwork: input.runtimeSafetyPolicy.allowNetwork,
      redactSnapshots: input.runtimeSafetyPolicy.redactSnapshots,
      timeoutMs: input.runtimeSafetyPolicy.timeoutMs,
    },
    network: {
      allowlist: [...input.networkAllowlist],
      agentEndpointConfigured: endpointConfigured,
      agentEndpointHost: host,
    },
    secretRefs: [
      {
        keyRef: REQUIRED_AGENT_KEY_REF,
        registered: requiredSecretRegistered,
        materialAvailable: requiredSecretAvailable,
      },
    ],
    quota: {
      ...input.quotaLimits,
      distributed: false,
    },
    ops: {
      workerEnabled: input.workerEnabled,
      relayEnabled: input.relayEnabled,
      writebackExecutorEnabled: input.writebackExecutorEnabled,
    },
  };
}
