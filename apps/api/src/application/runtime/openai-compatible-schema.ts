import type { RuntimeErrorType } from "@cf/shared";
import { ValidationError } from "../../domain/errors.js";
import type { AgentProviderErrorType } from "./agent-provider-contract.js";

export interface OpenAICompatibleRawRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  max_tokens?: number;
  metadata?: Record<string, unknown>;
}

export interface OpenAICompatibleRawResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason?: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  created: number;
  provider_metadata?: Record<string, unknown>;
}

export interface OpenAICompatibleRawError {
  status_code: number;
  code: string;
  message: string;
  provider_request_id?: string;
}

export interface NormalizedOpenAICompatibleSuccess {
  status: "success";
  output: { text: string };
  rawMetadata: {
    provider: "openai_compatible";
    providerRequestId?: string;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

export interface NormalizedOpenAICompatibleError {
  providerErrorType: AgentProviderErrorType;
  runtimeErrorType: RuntimeErrorType;
  message: string;
  providerRequestId?: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function requireString(v: unknown, label: string): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new ValidationError(`${label} is required`);
  return v;
}

function requireNumber(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(`${label} must be a number`);
  return v;
}

export function validateOpenAICompatibleRawRequest(req: OpenAICompatibleRawRequest): void {
  if (!isPlainObject(req)) throw new ValidationError("openai compatible request must be an object");
  requireString(req.model, "openai compatible request model");
  if (!Array.isArray(req.messages) || req.messages.length === 0)
    throw new ValidationError("openai compatible request messages are required");
  for (const msg of req.messages) {
    if (!isPlainObject(msg)) throw new ValidationError("openai compatible message must be an object");
    if (!["system", "user", "assistant"].includes(String(msg.role)))
      throw new ValidationError(`invalid openai compatible message role: ${String(msg.role)}`);
    requireString(msg.content, "openai compatible message content");
  }
  if (req.temperature !== undefined) requireNumber(req.temperature, "openai compatible temperature");
  if (req.max_tokens !== undefined) requireNumber(req.max_tokens, "openai compatible max_tokens");
  if (req.metadata !== undefined && !isPlainObject(req.metadata))
    throw new ValidationError("openai compatible metadata must be an object");
}

export function validateOpenAICompatibleRawResponse(res: OpenAICompatibleRawResponse): void {
  if (!isPlainObject(res)) throw new ValidationError("openai compatible response must be an object");
  requireString(res.id, "openai compatible response id");
  requireString(res.model, "openai compatible response model");
  if (!Array.isArray(res.choices)) throw new ValidationError("openai compatible choices must be an array");
  if (!isPlainObject(res.usage)) throw new ValidationError("openai compatible usage is required");
  requireNumber(res.usage.prompt_tokens, "openai compatible prompt_tokens");
  requireNumber(res.usage.completion_tokens, "openai compatible completion_tokens");
  requireNumber(res.usage.total_tokens, "openai compatible total_tokens");
  requireNumber(res.created, "openai compatible created");
  if (res.provider_metadata !== undefined && !isPlainObject(res.provider_metadata))
    throw new ValidationError("openai compatible provider_metadata must be an object");
  for (const choice of res.choices) {
    if (!isPlainObject(choice)) throw new ValidationError("openai compatible choice must be an object");
    requireNumber(choice.index, "openai compatible choice index");
    if (!isPlainObject(choice.message)) throw new ValidationError("openai compatible choice message is required");
    if (choice.message.role !== "assistant")
      throw new ValidationError("openai compatible choice message role must be assistant");
    requireString(choice.message.content, "openai compatible assistant content");
  }
}

export function validateOpenAICompatibleRawError(error: OpenAICompatibleRawError): void {
  if (!isPlainObject(error)) throw new ValidationError("openai compatible error must be an object");
  requireNumber(error.status_code, "openai compatible error status_code");
  requireString(error.code, "openai compatible error code");
  requireString(error.message, "openai compatible error message");
  if (error.provider_request_id !== undefined) requireString(error.provider_request_id, "provider_request_id");
}

export function normalizeOpenAICompatibleRawResponse(
  raw: OpenAICompatibleRawResponse,
): NormalizedOpenAICompatibleSuccess {
  validateOpenAICompatibleRawResponse(raw);
  const firstChoice = raw.choices[0];
  if (!firstChoice) throw new ValidationError("openai compatible response choices must not be empty");
  return {
    status: "success",
    output: { text: firstChoice.message.content },
    rawMetadata: {
      provider: "openai_compatible",
      providerRequestId: raw.provider_metadata?.provider_request_id as string | undefined,
      tokenUsage: {
        promptTokens: raw.usage.prompt_tokens,
        completionTokens: raw.usage.completion_tokens,
        totalTokens: raw.usage.total_tokens,
      },
    },
  };
}

export function normalizeOpenAICompatibleRawError(
  raw: OpenAICompatibleRawError,
): NormalizedOpenAICompatibleError {
  validateOpenAICompatibleRawError(raw);
  const providerErrorType =
    raw.status_code === 429 ? "rate_limited" :
    raw.status_code === 408 || /timeout/i.test(raw.code) ? "timeout" :
    raw.status_code === 401 || raw.status_code === 403 ? "permission_denied" :
    raw.status_code >= 400 && raw.status_code < 500 ? "validation_error" :
    raw.status_code >= 500 ? "external_unavailable" :
    "unknown";
  return {
    providerErrorType,
    runtimeErrorType: providerErrorType,
    message: raw.message,
    providerRequestId: raw.provider_request_id,
  };
}
