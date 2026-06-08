import { ValidationError } from "../../domain/errors.js";

export interface AgentRealProductionTransportGateInput {
  realHttpEnabled: boolean;
  allowNetwork: boolean;
  allowedHosts: string[];
  endpointMapped: boolean;
  credentialRefPresent: boolean;
  credentialResolverPresent: boolean;
  quotaPolicyReady: boolean;
  costMetricsReady: boolean;
}

export interface AgentRealProductionTransportGateSnapshot {
  mode: "agent_real_production_transport_gate";
  ready: boolean;
  missingRequirements: string[];
  checks: {
    realHttpEnabled: boolean;
    allowNetwork: boolean;
    networkAllowlistReady: boolean;
    endpointMapped: boolean;
    credentialRefPresent: boolean;
    credentialResolverPresent: boolean;
    quotaPolicyReady: boolean;
    costMetricsReady: boolean;
  };
}

const REQUIREMENT_NAMES: Record<keyof AgentRealProductionTransportGateSnapshot["checks"], string> = {
  realHttpEnabled: "real_http_enabled",
  allowNetwork: "allow_network",
  networkAllowlistReady: "network_allowlist",
  endpointMapped: "endpoint_mapped",
  credentialRefPresent: "credential_ref",
  credentialResolverPresent: "credential_resolver",
  quotaPolicyReady: "quota_policy",
  costMetricsReady: "cost_metrics",
};

export function buildAgentRealProductionTransportGateSnapshot(
  input: AgentRealProductionTransportGateInput,
): AgentRealProductionTransportGateSnapshot {
  const checks = {
    realHttpEnabled: input.realHttpEnabled,
    allowNetwork: input.allowNetwork,
    networkAllowlistReady: input.allowedHosts.length > 0,
    endpointMapped: input.endpointMapped,
    credentialRefPresent: input.credentialRefPresent,
    credentialResolverPresent: input.credentialResolverPresent,
    quotaPolicyReady: input.quotaPolicyReady,
    costMetricsReady: input.costMetricsReady,
  };
  const missingRequirements = Object.entries(checks)
    .filter(([, ready]) => !ready)
    .map(([key]) => REQUIREMENT_NAMES[key as keyof typeof checks]);

  return {
    mode: "agent_real_production_transport_gate",
    ready: missingRequirements.length === 0,
    missingRequirements,
    checks,
  };
}

export function assertAgentRealProductionTransportGate(
  snapshot: AgentRealProductionTransportGateSnapshot,
): void {
  if (!snapshot.ready)
    throw new ValidationError(`agent real production transport gate blocked: ${snapshot.missingRequirements.join(",")}`);
}
