import type { RuntimeErrorType } from "@cf/shared";
import {
  isRetryableRuntimeError,
  type RuntimeRequest,
  type RuntimeResponse,
} from "../../domain/execution/runtime-contract.js";
import type { RuntimeExecutionContext } from "../../domain/execution/runtime-safety.js";
import type { IAgentRuntime, IMCPRuntime, IPublisherRuntime } from "./ports.js";

// Mock Runtime 适配器：100% 本地模拟，无网络 / LLM / MCP / 外部调用。
// 按 payload 控制：mockStatus / mockErrorType / mockRetryable / mockDelayMs（模拟耗时，不真正 sleep/中断）。

interface MockPayload {
  mockStatus?: "success" | "failed" | "blocked";
  mockErrorType?: RuntimeErrorType;
  mockRetryable?: boolean;
  mockDelayMs?: number;
  responseSecret?: string;
}

function mockResponse(request: RuntimeRequest, kind: string): RuntimeResponse {
  const p = request.payload as MockPayload;
  const delayMs = typeof p.mockDelayMs === "number" ? p.mockDelayMs : 0;
  const meta = { kind, attempt: request.attemptCount };

  // 模拟超时：耗时超过 timeoutMs（不引入 AbortController / 真实中断），返回可重试 timeout
  if (delayMs > request.timeoutMs)
    return {
      jobId: request.jobId,
      status: "failed",
      output: { kind },
      error: `runtime timed out after ${request.timeoutMs}ms`,
      errorType: "timeout",
      retryable: true,
      durationMs: request.timeoutMs,
      metadata: meta,
    };

  const status = p.mockStatus ?? "success";
  if (status === "success")
    return {
      jobId: request.jobId,
      status: "success",
      output: { kind, result: "mock", ...(p.responseSecret ? { responseSecret: p.responseSecret } : {}) },
      error: null,
      errorType: null,
      retryable: false,
      durationMs: delayMs,
      metadata: meta,
    };

  if (status === "blocked")
    return {
      jobId: request.jobId,
      status: "failed",
      output: { kind, blocked: true },
      error: "mock blocked",
      errorType: "blocked",
      retryable: false,
      durationMs: delayMs,
      metadata: meta,
    };

  // failed：errorType 默认 unknown；blocked 不可被覆盖为可重试，其余 mockRetryable 可覆盖默认
  const errorType: RuntimeErrorType = p.mockErrorType ?? "unknown";
  const retryable =
    errorType === "blocked"
      ? false
      : typeof p.mockRetryable === "boolean"
        ? p.mockRetryable
        : isRetryableRuntimeError(errorType);
  return {
    jobId: request.jobId,
    status: "failed",
    output: { kind },
    error: "mock failure",
    errorType,
    retryable,
    durationMs: delayMs,
    metadata: meta,
  };
}

export class AgentMockRuntime implements IAgentRuntime {
  async execute(request: RuntimeRequest, _context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    return mockResponse(request, "agent");
  }
}
export class MCPMockRuntime implements IMCPRuntime {
  async execute(request: RuntimeRequest, _context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    return mockResponse(request, "mcp");
  }
}
export class PublisherMockRuntime implements IPublisherRuntime {
  async execute(request: RuntimeRequest, _context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    return mockResponse(request, "publisher");
  }
}
