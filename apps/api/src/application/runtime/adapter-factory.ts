import type { ExecutionJobType } from "@cf/shared";
import {
  AgentMockRuntime,
  MCPMockRuntime,
  PublisherMockRuntime,
} from "./mock-runtimes.js";
import type { IAgentRuntime, IMCPRuntime, IPublisherRuntime } from "./ports.js";

// RuntimeAdapterFactory：按 job 类型解析 Runtime 适配器。Phase 1.7 仅 Mock；Phase 2 在此替换为 Real Adapter（预留接缝）。

export type AnyRuntime = IAgentRuntime | IMCPRuntime | IPublisherRuntime;

export interface RuntimeAdapterFactory {
  getRuntime(type: ExecutionJobType): AnyRuntime;
}

export class MockRuntimeAdapterFactory implements RuntimeAdapterFactory {
  private readonly runtimes: Record<ExecutionJobType, AnyRuntime> = {
    agent: new AgentMockRuntime(),
    mcp: new MCPMockRuntime(),
    publisher: new PublisherMockRuntime(),
  };

  getRuntime(type: ExecutionJobType): AnyRuntime {
    return this.runtimes[type];
  }
}
