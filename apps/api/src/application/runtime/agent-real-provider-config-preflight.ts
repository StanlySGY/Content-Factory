import { ValidationError } from "../../domain/errors.js";
import {
  redactRuntimeSnapshot,
  validateRuntimeCredentialRef,
  type RuntimeCredentialRef,
  type RuntimeSafetyPolicy,
} from "../../domain/execution/runtime-safety.js";
import type { RuntimeAdapterMode } from "./adapter-registry.js";
import { AGENT_REAL_ADAPTER_DISABLED_FIXTURE } from "./agent-real-adapter-disabled-fixture.js";

export type AgentRealProviderKind = "openai_compatible";

export interface AgentRealProviderQuotaProfile {
  profile: string;
  maxRequestsPerWindow: number;
  windowMs: number;
}

export interface AgentRealProviderCostProfile {
  source: "not_calculated";
  currency: string | null;
}

export interface AgentRealProviderConfig {
  providerKind: AgentRealProviderKind;
  model: string;
  endpointRef: string;
  credentialRef: RuntimeCredentialRef;
  timeoutMs: number;
  quotaProfile: AgentRealProviderQuotaProfile;
  costProfile: AgentRealProviderCostProfile;
  metadata: Record<string, unknown>;
}

export interface AgentRealProviderConfigPreflight {
  mode: "agent_real_provider_config_preflight";
  configReady: true;
  providerKind: AgentRealProviderKind;
  model: string;
  endpointRef: string;
  endpointResolved: false;
  endpointNetworkChecked: false;
  credentialRefReady: true;
  secretMaterialRead: false;
  secretMaterialReturned: false;
  timeoutMs: number;
  timeoutWithinPolicy: true;
  quotaProfileReady: true;
  distributedQuotaReady: false;
  costProfileReady: true;
  costSource: "not_calculated";
  realProviderBillingEnabled: false;
  realAdapterWorkerEnabled: false;
  activeAdapterMode: RuntimeAdapterMode;
  runtimeMode: RuntimeSafetyPolicy["mode"];
  allowNetwork: boolean;
  blockedRealAdapterReason: typeof AGENT_REAL_ADAPTER_DISABLED_FIXTURE.blockedReason;
  redactedConfig: AgentRealProviderConfig;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function assertPositiveInteger(value: unknown, message: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new ValidationError(message);
}

function toRuntimeCredentialRef(value: Record<string, unknown>): RuntimeCredentialRef {
  return {
    provider: value.provider,
    keyRef: value.keyRef,
    scope: value.scope,
  } as RuntimeCredentialRef;
}

export function validateAgentRealProviderConfig(input: unknown, maxTimeoutMs: number): AgentRealProviderConfig {
  if (!isPlainObject(input)) throw new ValidationError("provider config must be a non-null object");
  if (input.providerKind !== "openai_compatible")
    throw new ValidationError("provider config providerKind must be openai_compatible");
  if (typeof input.model !== "string" || input.model.trim().length === 0)
    throw new ValidationError("provider config model is required");
  if (
    typeof input.endpointRef !== "string" ||
    !/^(provider:\/\/|https:\/\/)/.test(input.endpointRef) ||
    input.endpointRef.trim().length === 0
  )
    throw new ValidationError("provider config endpointRef must be provider:// or https:// reference");
  if (!isPlainObject(input.credentialRef))
    throw new ValidationError("provider config credentialRef is required");
  const credentialRef = toRuntimeCredentialRef(input.credentialRef);
  validateRuntimeCredentialRef(credentialRef);
  const rawTimeoutMs = input.timeoutMs;
  if (
    typeof rawTimeoutMs !== "number" ||
    !Number.isInteger(rawTimeoutMs) ||
    rawTimeoutMs < 100 ||
    rawTimeoutMs > maxTimeoutMs
  )
    throw new ValidationError(`provider config timeout must be within [100, ${maxTimeoutMs}]`);
  const timeoutMs = rawTimeoutMs;
  if (!isPlainObject(input.quotaProfile))
    throw new ValidationError("provider config quotaProfile is required");
  if (typeof input.quotaProfile.profile !== "string" || input.quotaProfile.profile.trim().length === 0)
    throw new ValidationError("provider config quotaProfile.profile is required");
  assertPositiveInteger(
    input.quotaProfile.maxRequestsPerWindow,
    "provider config quotaProfile.maxRequestsPerWindow must be positive integer",
  );
  assertPositiveInteger(input.quotaProfile.windowMs, "provider config quotaProfile.windowMs must be positive integer");
  if (!isPlainObject(input.costProfile))
    throw new ValidationError("provider config costProfile is required");
  if (input.costProfile.source !== "not_calculated")
    throw new ValidationError("provider config costProfile.source must be not_calculated");
  if (input.costProfile.currency !== null && typeof input.costProfile.currency !== "string")
    throw new ValidationError("provider config costProfile.currency must be string or null");
  if (!isPlainObject(input.metadata)) throw new ValidationError("provider config metadata must be object");

  return {
    providerKind: input.providerKind,
    model: input.model,
    endpointRef: input.endpointRef,
    credentialRef,
    timeoutMs,
    quotaProfile: {
      profile: input.quotaProfile.profile,
      maxRequestsPerWindow: input.quotaProfile.maxRequestsPerWindow,
      windowMs: input.quotaProfile.windowMs,
    },
    costProfile: {
      source: input.costProfile.source,
      currency: input.costProfile.currency,
    },
    metadata: input.metadata,
  };
}

export function buildDefaultAgentRealProviderConfig(timeoutMs: number): AgentRealProviderConfig {
  return {
    providerKind: "openai_compatible",
    model: "gpt-4.1-mini",
    endpointRef: "provider://openai-compatible/default",
    credentialRef: {
      provider: "openai",
      keyRef: "secret://llm/openai",
      scope: "project",
    },
    timeoutMs,
    quotaProfile: {
      profile: "default",
      maxRequestsPerWindow: 60,
      windowMs: 60000,
    },
    costProfile: {
      source: "not_calculated",
      currency: null,
    },
    metadata: {
      phase: "2.13",
      secretMaterialPresent: false,
    },
  };
}

function redactAgentRealProviderConfig(config: AgentRealProviderConfig): AgentRealProviderConfig {
  return {
    ...config,
    credentialRef: { ...config.credentialRef },
    quotaProfile: { ...config.quotaProfile },
    costProfile: { ...config.costProfile },
    metadata: redactRuntimeSnapshot(config.metadata),
  };
}

export function buildAgentRealProviderConfigPreflight(input: {
  config: unknown;
  activeAdapterMode: RuntimeAdapterMode;
  runtimeSafetyPolicy: RuntimeSafetyPolicy;
}): AgentRealProviderConfigPreflight {
  const config = validateAgentRealProviderConfig(input.config, input.runtimeSafetyPolicy.maxTimeoutMs);
  return {
    mode: "agent_real_provider_config_preflight",
    configReady: true,
    providerKind: config.providerKind,
    model: config.model,
    endpointRef: config.endpointRef,
    endpointResolved: false,
    endpointNetworkChecked: false,
    credentialRefReady: true,
    secretMaterialRead: false,
    secretMaterialReturned: false,
    timeoutMs: config.timeoutMs,
    timeoutWithinPolicy: true,
    quotaProfileReady: true,
    distributedQuotaReady: false,
    costProfileReady: true,
    costSource: config.costProfile.source,
    realProviderBillingEnabled: false,
    realAdapterWorkerEnabled: false,
    activeAdapterMode: input.activeAdapterMode,
    runtimeMode: input.runtimeSafetyPolicy.mode,
    allowNetwork: input.runtimeSafetyPolicy.allowNetwork,
    blockedRealAdapterReason: AGENT_REAL_ADAPTER_DISABLED_FIXTURE.blockedReason,
    redactedConfig: redactAgentRealProviderConfig(config),
  };
}
