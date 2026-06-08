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
import {
  buildAgentProviderRequestFromRuntime,
  validateAgentProviderResponse,
} from "./agent-provider-contract.js";
import { mapNormalizedProviderErrorToRuntimeError } from "./agent-provider-response-normalizer.js";
import { FakeAgentProvider } from "./fake-agent-provider.js";
import type { IAgentRuntime } from "./ports.js";

export class AgentProviderRuntime implements IAgentRuntime {
  constructor(private readonly provider = new FakeAgentProvider()) {}

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    const started = Date.now();
    try {
      validateRuntimeRequest(request);
      if (!context) return this.failure(request.jobId, "validation_error", "runtime execution context is required", started);
      assertRealExecutionAllowed(context.policy);
      if (!context.policy.allowRealExecution)
        return this.failure(request.jobId, "permission_denied", "real execution is not allowed by runtime safety policy", started);
      if (!context.credentialRef)
        return this.failure(request.jobId, "permission_denied", "runtime credential ref is required", started);

      const providerRequest = buildAgentProviderRequestFromRuntime(request, context);
      const providerResponse = await this.provider.execute(providerRequest, context.abortSignal);
      validateAgentProviderResponse(providerResponse);

      if (providerResponse.status === "success") {
        return {
          jobId: request.jobId,
          status: "success",
          output: {
            provider: "fake",
            fakeProvider: true,
            result: providerResponse.output,
          },
          error: null,
          errorType: null,
          retryable: false,
          durationMs: providerResponse.durationMs,
          metadata: {
            adapterMode: "fake_provider",
            provider: "fake",
            credentialResolved: false,
            networkUsed: false,
            processSpawned: false,
          },
        };
      }

      const errorType = mapNormalizedProviderErrorToRuntimeError(providerResponse.providerErrorType ?? "unknown");
      return {
        jobId: request.jobId,
        status: "failed",
        output: {},
        error: providerResponse.error ?? `fake provider ${providerResponse.providerErrorType ?? "unknown"}`,
        errorType,
        retryable: isRetryableRuntimeError(errorType),
        durationMs: providerResponse.durationMs,
        metadata: {
          adapterMode: "fake_provider",
          provider: "fake",
          providerErrorType: providerResponse.providerErrorType ?? "unknown",
          credentialResolved: false,
          networkUsed: false,
          processSpawned: false,
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
        adapterMode: "fake_provider",
        provider: "fake",
        credentialResolved: false,
        networkUsed: false,
        processSpawned: false,
      },
    };
  }
}
