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
  redactRuntimeSnapshot,
  type RuntimeExecutionContext,
} from "../../domain/execution/runtime-safety.js";
import {
  isAgentProviderHttpError,
  mapAgentProviderHttpErrorToRuntimeErrorType,
  type IAgentProviderHttpClient,
} from "./agent-provider-http-boundary.js";
import { RealAgentProviderHttpClient } from "./agent-provider-real-http-client.js";
import {
  buildAgentRealProviderTransportRequest,
  type AgentRealProviderMessage,
} from "./agent-real-provider-transport-disabled-harness.js";
import { buildDefaultAgentRealProviderConfig } from "./agent-real-provider-config-preflight.js";
import { buildAgentRealProductionTransportGateSnapshot } from "./agent-real-production-transport-gate.js";
import type { ProviderQuotaEnforcer, ProviderQuotaDecision } from "./provider-quota-enforcer.js";
import {
  buildMalformedOpenAICompatibleResponseEnvelope,
  normalizeOpenAICompatibleRawResponse,
  type OpenAICompatibleRawResponse,
} from "./openai-compatible-schema.js";
import type { IAgentRuntime } from "./ports.js";

const DEFAULT_MODEL = "gpt-4.1-mini";

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function messagesFromPayload(payload: Record<string, unknown>): AgentRealProviderMessage[] {
  const messages = payload.messages;
  if (Array.isArray(messages))
    return messages.map((m) => {
      if (!m || typeof m !== "object" || Array.isArray(m))
        throw new ValidationError("agent real runtime message must be an object");
      const role = (m as { role?: unknown }).role;
      const content = (m as { content?: unknown }).content;
      if (!["system", "user", "assistant"].includes(String(role)))
        throw new ValidationError(`invalid agent real runtime message role: ${String(role)}`);
      if (typeof content !== "string" || content.trim().length === 0)
        throw new ValidationError("agent real runtime message content is required");
      return { role: role as AgentRealProviderMessage["role"], content };
    });
  return [{ role: "user", content: str(payload.prompt, "hello") }];
}

function metadataFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const key of ["fakeOutputText", "fakeProviderStatus"]) {
    if (payload[key] !== undefined) metadata[key] = payload[key];
  }
  return metadata;
}

export class AgentRealRuntime implements IAgentRuntime {
  constructor(
    private readonly httpClient: IAgentProviderHttpClient = new RealAgentProviderHttpClient({
      realHttpEnabled: true,
      allowNetwork: true,
      allowedHosts: ["api.openai.test"],
      endpointMap: {
        "provider://openai-compatible/default": "https://api.openai.test/v1/chat/completions",
      },
    }),
    private readonly quotaEnforcer: ProviderQuotaEnforcer | null = null,
  ) {}

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    const started = Date.now();
    let requestSnapshot: unknown;
    try {
      validateRuntimeRequest(request);
      if (!context) return this.failure(request.jobId, "validation_error", "runtime execution context is required", started);
      if (request.jobType !== "agent")
        return this.failure(request.jobId, "validation_error", "agent real runtime only supports agent", started);
      assertRealExecutionAllowed(context.policy);
      if (!context.policy.allowNetwork)
        return this.failure(request.jobId, "permission_denied", "agent real runtime requires network allowance", started);
      if (!context.credentialRef)
        return this.failure(request.jobId, "permission_denied", "runtime credential ref is required", started);
      if (context.credentialRef.provider !== "openai_compatible")
        return this.failure(request.jobId, "validation_error", "agent real runtime only supports openai_compatible", started);

      const config = {
        ...buildDefaultAgentRealProviderConfig(request.timeoutMs),
        model: str(request.payload.model, DEFAULT_MODEL),
        credentialRef: context.credentialRef,
        metadata: {
          ...metadataFromPayload(request.payload),
          phase: "2.15",
          secret_material_read: false,
        },
      };
      const httpRequest = buildAgentRealProviderTransportRequest({
        config,
        messages: messagesFromPayload(request.payload),
        requestId: `${request.jobId}:${request.attemptCount}:real`,
      });
      requestSnapshot = redactRuntimeSnapshot(httpRequest);
      const quotaDecision = this.quotaEnforcer?.checkAndConsume() ?? null;
      if (quotaDecision?.status === "throttle")
        return this.quotaFailure(request.jobId, quotaDecision, started, requestSnapshot);
      const raw = await this.httpClient.send(httpRequest, {
        timeoutMs: request.timeoutMs,
        signal: context.abortSignal,
      });
      const durationMs = Math.max(0, Date.now() - started);
      const httpBoundary = this.httpBoundaryMetadata();
      let normalized: ReturnType<typeof normalizeOpenAICompatibleRawResponse>;
      try {
        normalized = normalizeOpenAICompatibleRawResponse(raw.bodySnapshot as unknown as OpenAICompatibleRawResponse);
      } catch (e) {
        if (e instanceof ValidationError) {
          return {
            jobId: request.jobId,
            status: "failed",
            output: {},
            error: e.message,
            errorType: "validation_error",
            retryable: false,
            durationMs,
            metadata: {
              adapterMode: "real",
              providerKind: "openai_compatible",
              providerRequestId: raw.providerRequestId,
              httpStatusCode: raw.statusCode,
              providerDurationMs: raw.durationMs,
              providerResponseContract: buildMalformedOpenAICompatibleResponseEnvelope({
                httpStatusCode: raw.statusCode,
                providerRequestId: raw.providerRequestId,
              }),
              httpBoundary: {
                ...httpBoundary,
              },
              networkUsed: httpBoundary.networkUsed === true,
              processSpawned: false,
              secret_material_read: false,
              secret_material_returned: false,
              realTransportInjected: this.httpClient.constructor.name !== "RealAgentProviderHttpClient",
              ...(requestSnapshot ? { request: requestSnapshot } : {}),
            },
          };
        }
        throw e;
      }
      return {
        jobId: request.jobId,
        status: "success",
        output: {
          provider: "openai_compatible",
          realAdapter: true,
          result: normalized.output,
        },
        error: null,
        errorType: null,
        retryable: false,
        durationMs,
        metadata: {
          adapterMode: "real",
          providerKind: "openai_compatible",
          providerRequestId: raw.providerRequestId ?? normalized.rawMetadata.providerRequestId,
          httpStatusCode: raw.statusCode,
          providerDurationMs: raw.durationMs,
          providerResponseContract: normalized.envelope,
          httpBoundary,
          productionTransportGate: buildAgentRealProductionTransportGateSnapshot({
            realHttpEnabled: true,
            allowNetwork: context.policy.allowNetwork,
            allowedHosts: ["injected-local-transport"],
            endpointMapped: true,
            credentialRefPresent: true,
            credentialResolverPresent: true,
            quotaPolicyReady: true,
            costMetricsReady: true,
          }),
          networkUsed: httpBoundary.networkUsed === true,
          processSpawned: false,
          secret_material_read: httpBoundary.secret_material_injected === true,
          secret_material_returned: false,
          realTransportInjected: this.httpClient.constructor.name !== "RealAgentProviderHttpClient",
          request: requestSnapshot,
          ...(quotaDecision ? { quotaDecision } : {}),
          tokenUsage: normalized.rawMetadata.tokenUsage,
          costEstimate: quotaDecision?.costEstimate ?? { source: "not_calculated", amount: null, currency: null },
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
            adapterMode: "real",
            providerKind: "openai_compatible",
            providerErrorType: e.type,
            providerRequestId: e.providerRequestId,
            httpStatusCode: e.statusCode,
            httpBoundary: {
              ...this.httpBoundaryMetadata(),
            },
            networkUsed: this.httpBoundaryMetadata().networkUsed === true,
            processSpawned: false,
            secret_material_read: this.httpBoundaryMetadata().secret_material_injected === true,
            secret_material_returned: false,
            realTransportInjected: false,
            ...(requestSnapshot ? { request: requestSnapshot } : {}),
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
      retryable: isRetryableRuntimeError(errorType),
      metadata: {
        adapterMode: "real",
        providerKind: "openai_compatible",
        networkUsed: false,
        processSpawned: false,
        secret_material_read: false,
        secret_material_returned: false,
        realTransportInjected: this.httpClient.constructor.name !== "RealAgentProviderHttpClient",
      },
    };
  }

  private quotaFailure(
    jobId: string,
    decision: ProviderQuotaDecision,
    started: number,
    requestSnapshot: unknown,
  ): RuntimeResponse {
    return {
      ...failedRuntimeResponse(
        jobId,
        "rate_limited",
        decision.reason ?? "provider quota throttled",
        Math.max(0, Date.now() - started),
      ),
      metadata: {
        adapterMode: "real",
        providerKind: "openai_compatible",
        quotaDecision: decision,
        costEstimate: decision.costEstimate,
        networkUsed: false,
        processSpawned: false,
        secret_material_read: false,
        secret_material_returned: false,
        realTransportInjected: this.httpClient.constructor.name !== "RealAgentProviderHttpClient",
        ...(requestSnapshot ? { request: requestSnapshot } : {}),
      },
    };
  }

  private httpBoundaryMetadata(): Record<string, unknown> {
    const describer = this.httpClient as IAgentProviderHttpClient & { describeBoundary?: () => Record<string, unknown> };
    return describer.describeBoundary?.() ?? {
      httpClientKind: "injected",
      networkUsed: false,
      secret_material_injected: false,
    };
  }
}
