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

export class MockRuntimeAdapterFactory implements RuntimeAdapterFactory {
  private readonly policy: RuntimeSafetyPolicy;

  private readonly runtimes: Record<ExecutionJobType, AnyRuntime> = {
    agent: new AgentMockRuntime(),
    mcp: new MCPMockRuntime(),
    publisher: new PublisherMockRuntime(),
  };

  constructor(policy: Partial<RuntimeSafetyPolicy> = {}) {
    this.policy = { ...DEFAULT_RUNTIME_SAFETY_POLICY, ...policy };
    validateRuntimeSafetyPolicy(this.policy);
  }

  getRuntime(type: ExecutionJobType, context?: RuntimeExecutionContext): AnyRuntime {
    const policy = context?.policy ?? this.policy;
    if (policy.mode !== "mock") {
      assertRealExecutionAllowed(policy);
      throw new ValidationError("no real runtime adapter registered");
    }
    return this.runtimes[type];
  }
}
