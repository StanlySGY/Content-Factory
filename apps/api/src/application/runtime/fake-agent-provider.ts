import type {
  AgentProviderErrorType,
  AgentProviderRequest,
  AgentProviderResponse,
} from "./agent-provider-contract.js";
import {
  validateAgentProviderRequest,
  validateAgentProviderResponse,
} from "./agent-provider-contract.js";

const FAILURE_STATUSES: ReadonlySet<string> = new Set([
  "timeout",
  "rate_limited",
  "permission_denied",
  "validation_error",
  "content_blocked",
  "external_unavailable",
  "unknown",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function providerStatus(input: Record<string, unknown>): AgentProviderErrorType | "success" {
  const status = input.fakeProviderStatus;
  if (typeof status === "string" && FAILURE_STATUSES.has(status)) return status as AgentProviderErrorType;
  return "success";
}

function providerOutput(input: Record<string, unknown>): Record<string, unknown> {
  return isPlainObject(input.fakeProviderOutput) ? input.fakeProviderOutput : { text: "fake provider output" };
}

export class FakeAgentProvider {
  async execute(request: AgentProviderRequest, signal?: AbortSignal): Promise<AgentProviderResponse> {
    const started = Date.now();
    try {
      validateAgentProviderRequest(request);
      const delay = typeof request.input.fakeProviderDelayMs === "number" ? request.input.fakeProviderDelayMs : 0;
      if (signal?.aborted || delay > request.timeoutMs) {
        return this.failure("timeout", "fake provider timeout", started);
      }

      const status = providerStatus(request.input);
      if (status !== "success") return this.failure(status, `fake provider ${status}`, started);

      const res: AgentProviderResponse = {
        status: "success",
        output: providerOutput(request.input),
        durationMs: Math.max(0, Date.now() - started),
        rawMetadata: {
          provider: "fake",
          networkUsed: false,
          processSpawned: false,
        },
      };
      validateAgentProviderResponse(res);
      return res;
    } catch (e) {
      return this.failure("validation_error", e instanceof Error ? e.message : String(e), started);
    }
  }

  private failure(type: AgentProviderErrorType, error: string, started: number): AgentProviderResponse {
    const res: AgentProviderResponse = {
      status: "failed",
      output: {},
      error,
      providerErrorType: type,
      durationMs: Math.max(0, Date.now() - started),
      rawMetadata: {
        provider: "fake",
        networkUsed: false,
        processSpawned: false,
      },
    };
    validateAgentProviderResponse(res);
    return res;
  }
}
