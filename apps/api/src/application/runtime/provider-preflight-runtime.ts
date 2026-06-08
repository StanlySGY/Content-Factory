import { ValidationError } from "../../domain/errors.js";
import {
  failedRuntimeResponse,
  isRetryableRuntimeError,
  validateRuntimeRequest,
  type RuntimeRequest,
  type RuntimeResponse,
} from "../../domain/execution/runtime-contract.js";
import {
  assertRealExecutionAllowed,
  type RuntimeExecutionContext,
} from "../../domain/execution/runtime-safety.js";
import type { IAgentRuntime } from "./ports.js";
import {
  buildAgentProviderMetricsEnvelope,
  validateAgentProviderMetricsEnvelope,
} from "./agent-provider-metrics.js";
import { FakeOpenAICompatibleClient } from "./fake-openai-compatible-client.js";
import {
  normalizeOpenAICompatibleRawError,
  normalizeOpenAICompatibleRawResponse,
  type OpenAICompatibleRawRequest,
  type OpenAICompatibleRawResponse,
} from "./openai-compatible-schema.js";
import {
  DEFAULT_SECRET_RESOLUTION_POLICY,
  assertSecretResolutionAllowed,
  buildSecretResolutionReadinessSnapshot,
} from "./secret-resolution-policy.js";

const DEFAULT_MODEL = "gpt-test";

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function metadataFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const key of ["fakeOutputText", "fakeProviderStatus"]) {
    if (payload[key] !== undefined) metadata[key] = payload[key];
  }
  return metadata;
}

export class AgentProviderPreflightRuntime implements IAgentRuntime {
  constructor(private readonly client = new FakeOpenAICompatibleClient()) {}

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    const started = Date.now();
    try {
      validateRuntimeRequest(request);
      if (!context) return this.failure(request.jobId, "validation_error", "runtime execution context is required", started);
      if (request.jobType !== "agent")
        return this.failure(request.jobId, "validation_error", "provider preflight only supports agent", started);
      assertRealExecutionAllowed(context.policy);
      if (!context.policy.allowRealExecution)
        return this.failure(request.jobId, "permission_denied", "real execution is not allowed by runtime safety policy", started);
      if (!context.credentialRef)
        return this.failure(request.jobId, "permission_denied", "runtime credential ref is required", started);
      if (context.credentialRef.provider !== "openai_compatible")
        return this.failure(request.jobId, "validation_error", "provider preflight only supports openai_compatible", started);

      assertSecretResolutionAllowed(DEFAULT_SECRET_RESOLUTION_POLICY);
      const secretResolution = buildSecretResolutionReadinessSnapshot(DEFAULT_SECRET_RESOLUTION_POLICY);
      const rawRequest: OpenAICompatibleRawRequest = {
        model: str(request.payload.model, DEFAULT_MODEL),
        messages: [{ role: "user", content: str(request.payload.prompt, "hello") }],
        metadata: metadataFromPayload(request.payload),
      };
      const raw = await this.client.executeRaw(rawRequest, {
        timeoutMs: request.timeoutMs,
        signal: context.abortSignal,
      });
      const durationMs = Math.max(0, Date.now() - started);

      if (raw.status === "failed") {
        const normalized = normalizeOpenAICompatibleRawError(raw.error);
        return {
          jobId: request.jobId,
          status: "failed",
          output: {},
          error: normalized.message,
          errorType: normalized.runtimeErrorType,
          retryable: isRetryableRuntimeError(normalized.runtimeErrorType),
          durationMs,
          metadata: {
            adapterMode: "provider_preflight",
            providerKind: "openai_compatible",
            providerErrorType: normalized.providerErrorType,
            providerRequestId: normalized.providerRequestId,
            networkUsed: false,
            processSpawned: false,
            secretResolution,
          },
        };
      }

      const normalized = normalizeOpenAICompatibleRawResponse(raw.body as OpenAICompatibleRawResponse);
      const metrics = buildAgentProviderMetricsEnvelope({
        provider: "openai_compatible",
        model: rawRequest.model,
        durationMs,
        tokenUsage: normalized.rawMetadata.tokenUsage,
        providerRequestId: normalized.rawMetadata.providerRequestId,
      });
      validateAgentProviderMetricsEnvelope(metrics);
      return {
        jobId: request.jobId,
        status: "success",
        output: {
          provider: "openai_compatible",
          providerPreflight: true,
          result: normalized.output,
        },
        error: null,
        errorType: null,
        retryable: false,
        durationMs,
        metadata: {
          adapterMode: "provider_preflight",
          providerKind: "openai_compatible",
          providerRequestId: metrics.providerRequestId,
          networkUsed: false,
          processSpawned: false,
          secretResolution,
          costEstimate: metrics.costEstimate,
          tokenUsage: metrics.tokenUsage,
        },
      };
    } catch (e) {
      const errorType = e instanceof ValidationError ? "validation_error" : "unknown";
      return this.failure(request.jobId, errorType, e instanceof Error ? e.message : String(e), started);
    }
  }

  private failure(
    jobId: string,
    errorType: "validation_error" | "permission_denied" | "unknown",
    error: string,
    started: number,
  ): RuntimeResponse {
    return {
      ...failedRuntimeResponse(jobId, errorType, error, Math.max(0, Date.now() - started)),
      retryable: errorType === "unknown",
      metadata: {
        adapterMode: "provider_preflight",
        providerKind: "openai_compatible",
        networkUsed: false,
        processSpawned: false,
      },
    };
  }
}
