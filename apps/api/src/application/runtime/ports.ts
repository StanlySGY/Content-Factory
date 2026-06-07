import type { RuntimeRequest, RuntimeResponse } from "../../domain/execution/runtime-contract.js";

// Runtime 端口（Ports & Adapters）：控制平面/worker 仅依赖此抽象；Phase 2 才引入 Real 实现。
// Phase 1.7：统一签名 execute(request: RuntimeRequest) → RuntimeResponse（稳定契约边界）。

export interface IAgentRuntime {
  execute(request: RuntimeRequest): Promise<RuntimeResponse>;
}
export interface IMCPRuntime {
  execute(request: RuntimeRequest): Promise<RuntimeResponse>;
}
export interface IPublisherRuntime {
  execute(request: RuntimeRequest): Promise<RuntimeResponse>;
}
