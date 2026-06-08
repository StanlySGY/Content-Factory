import { ValidationError } from "../../domain/errors.js";
import type { RuntimeAdapterDescriptor } from "./adapter-registry.js";

export const AGENT_REAL_ADAPTER_DISABLED_FIXTURE = {
  name: "agent-real-disabled-fixture",
  version: "2.12.0",
  blockedReason: "agent real adapter disabled fixture is not executable",
} as const;

export function buildAgentRealAdapterDisabledFixtureDescriptor(): RuntimeAdapterDescriptor {
  return {
    type: "agent",
    mode: "real",
    name: AGENT_REAL_ADAPTER_DISABLED_FIXTURE.name,
    version: AGENT_REAL_ADAPTER_DISABLED_FIXTURE.version,
    capabilities: ["real_adapter_disabled_fixture", "fail_closed"],
    requiresCredentialRef: true,
    allowNetwork: false,
    allowProcessSpawn: false,
    status: "blocked",
    blockedReason: AGENT_REAL_ADAPTER_DISABLED_FIXTURE.blockedReason,
  };
}

export function throwAgentRealAdapterDisabledFixture(): never {
  throw new ValidationError(AGENT_REAL_ADAPTER_DISABLED_FIXTURE.blockedReason);
}
