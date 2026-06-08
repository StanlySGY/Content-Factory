import {
  type AgentProviderRequest,
  type AgentProviderResponse,
  validateAgentProviderRequest,
  validateAgentProviderResponse,
} from "./agent-provider-contract.js";
import { buildCredentialResolutionSnapshot } from "./agent-provider-credential-policy.js";
import {
  mapNormalizedProviderErrorToRuntimeError,
  normalizeAgentProviderRawResponse,
} from "./agent-provider-response-normalizer.js";
import { FakeAgentProviderTransport, type IAgentProviderTransport } from "./agent-provider-transport.js";
import {
  assertTransportAllowed,
  resolveProviderTimeoutMs,
} from "./agent-provider-transport-policy.js";

export class FakeAgentProvider {
  constructor(private readonly transport: IAgentProviderTransport = new FakeAgentProviderTransport()) {}

  async execute(request: AgentProviderRequest, signal?: AbortSignal): Promise<AgentProviderResponse> {
    try {
      validateAgentProviderRequest(request);
      const transportPolicy = {
        allowNetwork: false,
        allowProcessSpawn: false,
        timeoutMs: request.timeoutMs,
        maxTimeoutMs: request.timeoutMs,
      };
      assertTransportAllowed(transportPolicy);
      buildCredentialResolutionSnapshot(request.credentialRef);
      const timeoutMs = resolveProviderTimeoutMs(request.timeoutMs, transportPolicy);
      const raw = await this.transport.send(request, { signal: signal ?? new AbortController().signal, timeoutMs });
      const res = normalizeAgentProviderRawResponse(raw);
      validateAgentProviderResponse(res);
      return res;
    } catch (e) {
      const res: AgentProviderResponse = {
        status: "failed",
        output: {},
        error: e instanceof Error ? e.message : String(e),
        providerErrorType: "validation_error",
        durationMs: 0,
        rawMetadata: {
          provider: "fake",
          runtimeErrorType: mapNormalizedProviderErrorToRuntimeError("validation_error"),
          networkUsed: false,
          processSpawned: false,
        },
      };
      validateAgentProviderResponse(res);
      return res;
    }
  }
}
