import type { ExecutionResult } from "../../domain/execution/job.js";
import type { ExecutionJobRow } from "../../infrastructure/db/schema.js";
import type { IAgentRuntime, IMCPRuntime, IPublisherRuntime } from "./ports.js";

// Mock Runtime 适配器：100% 模拟，无网络 / LLM / MCP / 外部调用。
// 仅按 payload.mockStatus 产出固定结果（success / failed / blocked）+ 小延迟模拟异步。
// 注：execution_job 状态仅 success/failed；blocked 映射为 failed + output.blocked 标记。

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function mockResult(job: ExecutionJobRow, kind: string): ExecutionResult {
  const desired = (job.payload as { mockStatus?: string }).mockStatus;
  if (desired === "failed")
    return { jobId: job.id, status: "failed", output: { kind }, error: "mock failure" };
  if (desired === "blocked")
    return { jobId: job.id, status: "failed", output: { kind, blocked: true }, error: "mock blocked" };
  return { jobId: job.id, status: "success", output: { kind, result: "mock" } };
}

export class AgentMockRuntime implements IAgentRuntime {
  async execute(job: ExecutionJobRow): Promise<ExecutionResult> {
    await delay(5);
    return mockResult(job, "agent");
  }
}
export class MCPMockRuntime implements IMCPRuntime {
  async execute(job: ExecutionJobRow): Promise<ExecutionResult> {
    await delay(5);
    return mockResult(job, "mcp");
  }
}
export class PublisherMockRuntime implements IPublisherRuntime {
  async execute(job: ExecutionJobRow): Promise<ExecutionResult> {
    await delay(5);
    return mockResult(job, "publisher");
  }
}
