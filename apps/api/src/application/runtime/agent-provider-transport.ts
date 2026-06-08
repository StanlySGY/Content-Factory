import type { AgentProviderRequest } from "./agent-provider-contract.js";
import type { AgentProviderRawError, AgentProviderRawResponse } from "./agent-provider-response-normalizer.js";

export interface AgentProviderTransportContext {
  signal: AbortSignal;
  timeoutMs: number;
}

export interface IAgentProviderTransport {
  send(request: AgentProviderRequest, context: AgentProviderTransportContext): Promise<AgentProviderRawResponse>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function output(input: Record<string, unknown>): Record<string, unknown> {
  return isPlainObject(input.fakeProviderOutput) ? input.fakeProviderOutput : { text: "fake provider output" };
}

function rawError(status: unknown): AgentProviderRawError {
  if (status === "rate_limited") return { type: "rate_limited", statusCode: 429, message: "fake provider rate_limited" };
  if (status === "permission_denied") return { type: "permission_denied", statusCode: 403, message: "fake provider permission_denied" };
  if (status === "content_blocked") return { type: "content_blocked", statusCode: 400, message: "fake provider content_blocked" };
  if (status === "external_unavailable") return { type: "external_unavailable", code: "ECONNRESET", message: "fake provider external_unavailable" };
  if (status === "validation_error") return { type: "validation_error", statusCode: 400, message: "fake provider validation_error" };
  if (status === "timeout") return { type: "timeout", message: "fake provider timeout" };
  return { type: "unknown", message: "fake provider unknown" };
}

export class FakeAgentProviderTransport implements IAgentProviderTransport {
  async send(request: AgentProviderRequest, context: AgentProviderTransportContext): Promise<AgentProviderRawResponse> {
    const started = Date.now();
    const delay = typeof request.input.fakeProviderDelayMs === "number" ? request.input.fakeProviderDelayMs : 0;
    if (context.signal.aborted || delay > context.timeoutMs) return this.failed(rawError("timeout"), started);

    const status = request.input.fakeProviderStatus;
    if (typeof status === "string" && status !== "success") return this.failed(rawError(status), started);

    return {
      status: "success",
      provider: "fake",
      body: { output: output(request.input) },
      headers: {},
      durationMs: Math.max(0, Date.now() - started),
    };
  }

  private failed(error: AgentProviderRawError, started: number): AgentProviderRawResponse {
    return {
      status: "failed",
      provider: "fake",
      body: {},
      headers: {},
      durationMs: Math.max(0, Date.now() - started),
      error,
    };
  }
}
