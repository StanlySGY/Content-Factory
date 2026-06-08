import type { ExecutionJobType } from "@cf/shared";
import { ValidationError } from "../../domain/errors.js";
import {
  assertRealExecutionAllowed,
  DEFAULT_RUNTIME_SAFETY_POLICY,
  validateRuntimeSafetyPolicy,
  type RuntimeExecutionContext,
  type RuntimeSafetyPolicy,
} from "../../domain/execution/runtime-safety.js";
import {
  AgentDryRunRuntime,
  MCPDryRunRuntime,
  PublisherDryRunRuntime,
} from "./dry-run-runtimes.js";
import { AgentProviderRuntime } from "./agent-provider-runtime.js";
import type { RuntimeAdapterMode } from "./adapter-registry.js";
import {
  AgentMockRuntime,
  MCPMockRuntime,
  PublisherMockRuntime,
} from "./mock-runtimes.js";
import type { IAgentRuntime, IMCPRuntime, IPublisherRuntime } from "./ports.js";

// RuntimeAdapterFactory：按 job 类型解析 Runtime 适配器。Phase 1.7 仅 Mock；Phase 2 在此替换为 Real Adapter（预留接缝）。

export type AnyRuntime = IAgentRuntime | IMCPRuntime | IPublisherRuntime;

export interface RuntimeAdapterFactory {
  getRuntime(type: ExecutionJobType, context?: RuntimeExecutionContext): AnyRuntime;
}

export interface RuntimeAdapterFactoryOptions extends Partial<RuntimeSafetyPolicy> {
  adapterMode?: RuntimeAdapterMode;
}

export class MockRuntimeAdapterFactory implements RuntimeAdapterFactory {
  private readonly policy: RuntimeSafetyPolicy;
  private readonly adapterMode: RuntimeAdapterMode;

  private readonly mockRuntimes: Record<ExecutionJobType, AnyRuntime> = {
    agent: new AgentMockRuntime(),
    mcp: new MCPMockRuntime(),
    publisher: new PublisherMockRuntime(),
  };

  private readonly dryRunRuntimes: Record<ExecutionJobType, AnyRuntime> = {
    agent: new AgentDryRunRuntime(),
    mcp: new MCPDryRunRuntime(),
    publisher: new PublisherDryRunRuntime(),
  };

  private readonly agentProviderRuntime = new AgentProviderRuntime();

  constructor(policy: RuntimeAdapterFactoryOptions = {}) {
    const { adapterMode = "mock", ...safetyPolicy } = policy;
    this.adapterMode = adapterMode;
    this.policy = { ...DEFAULT_RUNTIME_SAFETY_POLICY, ...safetyPolicy };
    validateRuntimeSafetyPolicy(this.policy);
  }

  getRuntime(type: ExecutionJobType, context?: RuntimeExecutionContext): AnyRuntime {
    const policy = context?.policy ?? this.policy;
    if (this.adapterMode === "real") throw new ValidationError("no real adapter registered");
    if (this.adapterMode === "fake_provider") {
      if (policy.mode !== "real_enabled" || !policy.allowRealExecution)
        throw new ValidationError("fake provider adapter requires real_enabled mode and allowRealExecution=true");
      if (type !== "agent") throw new ValidationError("fake provider only supports agent");
      return this.agentProviderRuntime;
    }
    if (this.adapterMode === "dry_run") {
      if (policy.mode !== "real_enabled" || !policy.allowRealExecution)
        throw new ValidationError("dry-run adapter requires real_enabled mode and allowRealExecution=true");
      return this.dryRunRuntimes[type];
    }
    if (policy.mode !== "mock") {
      assertRealExecutionAllowed(policy);
      throw new ValidationError("no real runtime adapter registered");
    }
    return this.mockRuntimes[type];
  }
}
