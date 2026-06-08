import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  RuntimeAdapterRegistry,
  assertAdapterAllowedBySafetyPolicy,
  createDefaultRuntimeAdapterRegistry,
  type RuntimeAdapterDescriptor,
} from "../../src/application/runtime/adapter-registry.js";
import type { RuntimeSafetyPolicy } from "../../src/domain/execution/runtime-safety.js";

const policy = (over: Partial<RuntimeSafetyPolicy> = {}): RuntimeSafetyPolicy => ({
  mode: "mock",
  allowRealExecution: false,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  allowNetwork: false,
  allowProcessSpawn: false,
  requireCredentialRef: true,
  redactSnapshots: true,
  ...over,
});

const descriptor = (over: Partial<RuntimeAdapterDescriptor> = {}): RuntimeAdapterDescriptor => ({
  type: "agent",
  mode: "dry_run",
  name: "agent-dry-run",
  version: "2.1.0",
  capabilities: ["validate_request"],
  requiresCredentialRef: true,
  allowNetwork: false,
  allowProcessSpawn: false,
  status: "available",
  ...over,
});

describe("RuntimeAdapterRegistry", () => {
  it("registers, lists and gets adapter descriptors", () => {
    const registry = new RuntimeAdapterRegistry();
    registry.registerAdapter(descriptor());

    expect(registry.getAdapterDescriptor("agent", "dry_run")).toMatchObject({ name: "agent-dry-run" });
    expect(registry.listAdapterDescriptors()).toHaveLength(1);
  });

  it("rejects duplicate adapter descriptors", () => {
    const registry = new RuntimeAdapterRegistry();
    registry.registerAdapter(descriptor());

    expect(() => registry.registerAdapter(descriptor())).toThrow(ValidationError);
  });

  it("blocks unsafe adapter descriptors by safety policy", () => {
    expect(() =>
      assertAdapterAllowedBySafetyPolicy(descriptor({ allowNetwork: true }), policy({ allowNetwork: false })),
    ).toThrow(ValidationError);
    expect(() =>
      assertAdapterAllowedBySafetyPolicy(descriptor({ allowProcessSpawn: true }), policy({ allowProcessSpawn: false })),
    ).toThrow(ValidationError);
  });

  it("allows real adapter descriptors to exist but not execute", () => {
    const registry = new RuntimeAdapterRegistry();
    registry.registerAdapter(descriptor({ mode: "real", status: "blocked", blockedReason: "no real adapter registered" }));

    const real = registry.getAdapterDescriptor("agent", "real");
    expect(real.status).toBe("blocked");
    expect(() =>
      assertAdapterAllowedBySafetyPolicy(real, policy({ mode: "real_enabled", allowRealExecution: true })),
    ).toThrow(ValidationError);
  });

  it("keeps the default MCP real safety runtime blocked until an explicit harness is registered", () => {
    const registry = createDefaultRuntimeAdapterRegistry();

    const mcpReal = registry.getAdapterDescriptor("mcp", "real");

    expect(mcpReal).toMatchObject({
      type: "mcp",
      mode: "real",
      status: "blocked",
      allowProcessSpawn: true,
      blockedReason: "mcp safety runtime requires explicit local harness registration",
    });
    expect(mcpReal.capabilities).toContain("mcp_safety_boundary");
    expect(() =>
      assertAdapterAllowedBySafetyPolicy(
        mcpReal,
        policy({ mode: "real_enabled", allowRealExecution: true, allowProcessSpawn: true }),
      ),
    ).toThrow(ValidationError);
  });
});
