import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  AGENT_REAL_ADAPTER_DISABLED_FIXTURE,
  buildAgentRealAdapterDisabledFixtureDescriptor,
  throwAgentRealAdapterDisabledFixture,
} from "../../src/application/runtime/agent-real-adapter-disabled-fixture.js";
import {
  MockRuntimeAdapterFactory,
} from "../../src/application/runtime/adapter-factory.js";
import {
  assertAdapterAllowedBySafetyPolicy,
  createDefaultRuntimeAdapterRegistry,
} from "../../src/application/runtime/adapter-registry.js";

describe("Agent real adapter disabled fixture", () => {
  it("freezes blocked agent real fixture metadata", () => {
    expect(buildAgentRealAdapterDisabledFixtureDescriptor()).toMatchObject({
      type: "agent",
      mode: "real",
      name: "agent-real-disabled-fixture",
      version: "2.12.0",
      capabilities: ["real_adapter_disabled_fixture", "fail_closed"],
      requiresCredentialRef: true,
      allowNetwork: false,
      allowProcessSpawn: false,
      status: "blocked",
      blockedReason: AGENT_REAL_ADAPTER_DISABLED_FIXTURE.blockedReason,
    });
  });

  it("registers the disabled fixture descriptor but keeps execution blocked", () => {
    const registry = createDefaultRuntimeAdapterRegistry();
    const descriptor = registry.getAdapterDescriptor("agent", "real");

    expect(descriptor).toMatchObject({
      name: "agent-real-disabled-fixture",
      version: "2.12.0",
      status: "blocked",
      blockedReason: "agent real adapter disabled fixture is not executable",
    });
    expect(() =>
      assertAdapterAllowedBySafetyPolicy(descriptor, {
        mode: "real_enabled",
        allowRealExecution: true,
        allowNetwork: true,
        allowProcessSpawn: false,
        requireCredentialRef: true,
        redactSnapshots: true,
        timeoutMs: 5000,
        maxTimeoutMs: 30000,
      }),
    ).toThrow("agent real adapter disabled fixture is not executable");
  });

  it("keeps factory real mode fail-closed even when real execution flags are enabled", () => {
    const factory = new MockRuntimeAdapterFactory({
      adapterMode: "real",
      mode: "real_enabled",
      allowRealExecution: true,
      allowNetwork: true,
    });

    expect(() => factory.getRuntime("agent")).toThrow("agent real adapter disabled fixture is not executable");
    expect(() => throwAgentRealAdapterDisabledFixture()).toThrow(ValidationError);
  });
});
