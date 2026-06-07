import type { ExecutionResult } from "../../domain/execution/job.js";
import type { ExecutionJobRow } from "../../infrastructure/db/schema.js";

// Runtime 端口（Ports & Adapters）：控制平面/worker 仅依赖此抽象；Phase 2 才引入 Real 实现。
// 三类执行入口，统一签名 execute(job) → ExecutionResult。

export interface IAgentRuntime {
  execute(job: ExecutionJobRow): Promise<ExecutionResult>;
}
export interface IMCPRuntime {
  execute(job: ExecutionJobRow): Promise<ExecutionResult>;
}
export interface IPublisherRuntime {
  execute(job: ExecutionJobRow): Promise<ExecutionResult>;
}
