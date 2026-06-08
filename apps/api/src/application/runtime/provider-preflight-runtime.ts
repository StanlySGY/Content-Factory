import { ValidationError } from "../../domain/errors.js";
import {
  failedRuntimeResponse,
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
import {
  normalizeOpenAICompatibleRawResponse,
  type OpenAICompatibleRawRequest,
  type OpenAICompatibleRawResponse,
} from "./openai-compatible-schema.js";
import {
  isAgentProviderHttpError,
  mapAgentProviderHttpErrorToRuntimeErrorType,
  validateAgentProviderHttpResponse,
  type AgentProviderHttpRequest,
  type IAgentProviderHttpClient,
} from "./agent-provider-http-boundary.js";
import { FakeAgentProviderHttpClient } from "./fake-agent-provider-http-client.js";
import {
  DEFAULT_SECRET_RESOLUTION_POLICY,
  assertSecretResolutionAllowed,
  buildSecretResolutionReadinessSnapshot,
} from "./secret-resolution-policy.js";
import {
  MockRuntimeSecretResolver,
  type IRuntimeSecretResolver,
  type RuntimeSecretRef,
} from "./credential-resolver.js";

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
  constructor(
    private readonly httpClient: IAgentProviderHttpClient = new FakeAgentProviderHttpClient(),
    private readonly secretResolver: IRuntimeSecretResolver = new MockRuntimeSecretResolver(),
  ) {}

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    const started = Date.now();
    let secretResolutionMetadata: unknown;
    let secretResolverAuditMetadata: unknown;
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
      secretResolutionMetadata = secretResolution;
      const subject = request.metadata.subject;
      const secretRef: RuntimeSecretRef = {
        ...context.credentialRef,
        purpose: "agent_runtime",
        ...(subject && typeof subject === "object" && !Array.isArray(subject) ? { subject: subject as Record<string, unknown> } : {}),
      };
      const secretResolutionRecord = await this.secretResolver.resolve(secretRef, {
        jobId: request.jobId,
        jobType: request.jobType,
        adapterMode: "provider_preflight",
        runtimeMode: context.mode,
        auditMetadata: request.metadata,
      });
      const secretResolverAudit = secretResolutionRecord.auditMetadata;
      secretResolverAuditMetadata = secretResolverAudit;
      const rawRequest: OpenAICompatibleRawRequest = {
        model: str(request.payload.model, DEFAULT_MODEL),
        messages: [{ role: "user", content: str(request.payload.prompt, "hello") }],
        metadata: metadataFromPayload(request.payload),
      };
      const httpBoundary = {
        httpClientKind: "fake",
        networkUsed: false,
        secretMaterialInjected: false,
      };
      const httpRequest: AgentProviderHttpRequest = {
        method: "POST",
        urlRef: "provider://openai-compatible/chat-completions",
        headersRef: { authorization_ref: context.credentialRef.keyRef },
        body: rawRequest as unknown as Record<string, unknown>,
        timeoutMs: request.timeoutMs,
        requestId: `${request.jobId}:${request.attemptCount}:provider-preflight`,
      };
      const raw = await this.httpClient.send(httpRequest, {
        timeoutMs: request.timeoutMs,
        signal: context.abortSignal,
      });
      validateAgentProviderHttpResponse(raw);
      const durationMs = Math.max(0, Date.now() - started);

      const normalized = normalizeOpenAICompatibleRawResponse(raw.bodySnapshot as unknown as OpenAICompatibleRawResponse);
      const metrics = buildAgentProviderMetricsEnvelope({
        provider: "openai_compatible",
        model: rawRequest.model,
        durationMs,
        tokenUsage: normalized.rawMetadata.tokenUsage,
        providerRequestId: raw.providerRequestId ?? normalized.rawMetadata.providerRequestId,
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
          httpStatusCode: raw.statusCode,
          httpBoundary,
          networkUsed: false,
          processSpawned: false,
          secretResolution,
          secretResolverAudit,
          costEstimate: metrics.costEstimate,
          tokenUsage: metrics.tokenUsage,
        },
      };
    } catch (e) {
      if (isAgentProviderHttpError(e)) {
        const mapped = mapAgentProviderHttpErrorToRuntimeErrorType(e);
        return {
          jobId: request.jobId,
          status: "failed",
          output: {},
          error: e.message,
          errorType: mapped.errorType,
          retryable: mapped.retryable,
          durationMs: Math.max(0, Date.now() - started),
          metadata: {
            adapterMode: "provider_preflight",
            providerKind: "openai_compatible",
            providerErrorType: e.type,
            providerRequestId: e.providerRequestId,
            httpStatusCode: e.statusCode,
            httpBoundary: {
              httpClientKind: "fake",
              networkUsed: false,
              secretMaterialInjected: false,
            },
            networkUsed: false,
            processSpawned: false,
            ...(secretResolutionMetadata ? { secretResolution: secretResolutionMetadata } : {}),
            ...(secretResolverAuditMetadata ? { secretResolverAudit: secretResolverAuditMetadata } : {}),
          },
        };
      }
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
