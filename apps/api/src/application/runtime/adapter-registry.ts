import type { ExecutionJobType } from "@cf/shared";
import { ValidationError } from "../../domain/errors.js";
import type { RuntimeSafetyPolicy } from "../../domain/execution/runtime-safety.js";

export const RUNTIME_ADAPTER_MODES = ["mock", "dry_run", "fake_provider", "real"] as const;
export type RuntimeAdapterMode = (typeof RUNTIME_ADAPTER_MODES)[number];

export type RuntimeAdapterStatus = "available" | "disabled" | "blocked";

export interface RuntimeAdapterDescriptor {
  type: ExecutionJobType;
  mode: RuntimeAdapterMode;
  name: string;
  version: string;
  capabilities: string[];
  requiresCredentialRef: boolean;
  allowNetwork: boolean;
  allowProcessSpawn: boolean;
  status: RuntimeAdapterStatus;
  blockedReason?: string;
}

function key(type: ExecutionJobType, mode: RuntimeAdapterMode): string {
  return `${type}:${mode}`;
}

export function assertAdapterAllowedBySafetyPolicy(
  descriptor: RuntimeAdapterDescriptor,
  policy: RuntimeSafetyPolicy,
): void {
  if (descriptor.status !== "available")
    throw new ValidationError(descriptor.blockedReason ?? `runtime adapter ${descriptor.name} is not available`);
  if (descriptor.mode === "real")
    throw new ValidationError("no real adapter registered");
  if (descriptor.allowNetwork && !policy.allowNetwork)
    throw new ValidationError(`runtime adapter ${descriptor.name} requires network but policy blocks it`);
  if (descriptor.allowProcessSpawn && !policy.allowProcessSpawn)
    throw new ValidationError(`runtime adapter ${descriptor.name} requires process spawn but policy blocks it`);
}

export class RuntimeAdapterRegistry {
  private readonly adapters = new Map<string, RuntimeAdapterDescriptor>();

  registerAdapter(descriptor: RuntimeAdapterDescriptor): void {
    const id = key(descriptor.type, descriptor.mode);
    if (this.adapters.has(id)) throw new ValidationError(`runtime adapter already registered: ${id}`);
    this.adapters.set(id, { ...descriptor, capabilities: [...descriptor.capabilities] });
  }

  getAdapterDescriptor(type: ExecutionJobType, mode: RuntimeAdapterMode): RuntimeAdapterDescriptor {
    const descriptor = this.adapters.get(key(type, mode));
    if (!descriptor) throw new ValidationError(`runtime adapter not registered: ${type}:${mode}`);
    return { ...descriptor, capabilities: [...descriptor.capabilities] };
  }

  listAdapterDescriptors(): RuntimeAdapterDescriptor[] {
    return [...this.adapters.values()].map((d) => ({ ...d, capabilities: [...d.capabilities] }));
  }
}

export function createDefaultRuntimeAdapterRegistry(): RuntimeAdapterRegistry {
  const registry = new RuntimeAdapterRegistry();
  for (const type of ["agent", "mcp", "publisher"] as const) {
    registry.registerAdapter({
      type,
      mode: "mock",
      name: `${type}-mock-runtime`,
      version: "2.1.0",
      capabilities: ["mock_execute"],
      requiresCredentialRef: false,
      allowNetwork: false,
      allowProcessSpawn: false,
      status: "available",
    });
    registry.registerAdapter({
      type,
      mode: "dry_run",
      name: `${type}-dry-run-runtime`,
      version: "2.1.0",
      capabilities: ["validate_request", "validate_context", "validate_credential_ref"],
      requiresCredentialRef: true,
      allowNetwork: false,
      allowProcessSpawn: false,
      status: "available",
    });
    registry.registerAdapter({
      type,
      mode: "fake_provider",
      name: type === "agent" ? "agent-fake-provider-runtime" : `${type}-fake-provider-runtime`,
      version: "2.2.0",
      capabilities: type === "agent" ? ["fake_provider_execute", "validate_credential_ref"] : [],
      requiresCredentialRef: true,
      allowNetwork: false,
      allowProcessSpawn: false,
      status: type === "agent" ? "available" : "blocked",
      ...(type === "agent" ? {} : { blockedReason: "fake provider only supports agent" }),
    });
    registry.registerAdapter({
      type,
      mode: "real",
      name: `${type}-real-runtime`,
      version: "0.0.0",
      capabilities: [],
      requiresCredentialRef: true,
      allowNetwork: true,
      allowProcessSpawn: type === "mcp",
      status: "blocked",
      blockedReason: "no real adapter registered",
    });
  }
  return registry;
}
