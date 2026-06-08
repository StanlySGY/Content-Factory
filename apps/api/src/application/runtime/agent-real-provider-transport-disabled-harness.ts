import { ValidationError } from "../../domain/errors.js";
import { redactRuntimeSnapshot } from "../../domain/execution/runtime-safety.js";
import {
  type AgentProviderHttpNetworkPolicy,
  RealAgentProviderHttpClient,
} from "./agent-provider-real-http-client.js";
import {
  type AgentProviderHttpError,
  isAgentProviderHttpError,
  type AgentProviderHttpRequest,
} from "./agent-provider-http-boundary.js";
import {
  validateAgentRealProviderConfig,
  type AgentRealProviderConfig,
  type AgentRealProviderKind,
} from "./agent-real-provider-config-preflight.js";

export interface AgentRealProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AgentRealProviderTransportDisabledHarness {
  mode: "agent_real_provider_transport_disabled_harness";
  requestShapeReady: true;
  providerKind: AgentRealProviderKind;
  requestMethod: "POST";
  urlRef: string;
  timeoutMs: number;
  disabledTransportReady: true;
  transportExecutable: false;
  networkAttempted: false;
  endpointResolved: true;
  secretMaterialRead: false;
  secretMaterialReturned: false;
  failClosed: true;
  failClosedErrorType: AgentProviderHttpError["type"];
  failClosedRetryable: boolean;
  realAdapterWorkerEnabled: false;
  redactedRequest: AgentProviderHttpRequest;
}

function validateMessages(messages: AgentRealProviderMessage[]): AgentRealProviderMessage[] {
  if (!Array.isArray(messages) || messages.length === 0)
    throw new ValidationError("agent real provider transport messages are required");
  return messages.map((m) => {
    if (!m || typeof m !== "object" || !["system", "user", "assistant"].includes(m.role))
      throw new ValidationError("agent real provider transport message role is invalid");
    if (typeof m.content !== "string" || m.content.trim().length === 0)
      throw new ValidationError("agent real provider transport message content is required");
    return { role: m.role, content: m.content };
  });
}

export function buildAgentRealProviderTransportRequest(input: {
  config: AgentRealProviderConfig;
  messages: AgentRealProviderMessage[];
  requestId: string;
}): AgentProviderHttpRequest {
  const config = validateAgentRealProviderConfig(input.config, input.config.timeoutMs);
  if (!config.endpointRef.startsWith("provider://"))
    throw new ValidationError("agent real provider transport request requires provider:// endpointRef");
  return {
    method: "POST",
    urlRef: config.endpointRef,
    headersRef: {
      Authorization: config.credentialRef.keyRef,
    },
    body: {
      model: config.model,
      messages: validateMessages(input.messages),
    },
    timeoutMs: config.timeoutMs,
    requestId: input.requestId,
  };
}

function redactedRequest(request: AgentProviderHttpRequest): AgentProviderHttpRequest {
  return redactRuntimeSnapshot(request) as AgentProviderHttpRequest;
}

export async function buildAgentRealProviderTransportDisabledHarness(input: {
  config: AgentRealProviderConfig;
  messages: AgentRealProviderMessage[];
  requestId: string;
  policy: AgentProviderHttpNetworkPolicy;
  contextTimeoutMs: number;
}): Promise<AgentRealProviderTransportDisabledHarness> {
  const request = buildAgentRealProviderTransportRequest({
    config: input.config,
    messages: input.messages,
    requestId: input.requestId,
  });
  const controller = new AbortController();
  const client = new RealAgentProviderHttpClient(input.policy);
  let error: AgentProviderHttpError | null = null;
  try {
    await client.send(request, { signal: controller.signal, timeoutMs: input.contextTimeoutMs });
  } catch (e) {
    if (!isAgentProviderHttpError(e)) throw e;
    error = e;
  }
  if (!error) throw new ValidationError("disabled transport harness expected fail-closed error");
  return {
    mode: "agent_real_provider_transport_disabled_harness",
    requestShapeReady: true,
    providerKind: input.config.providerKind,
    requestMethod: request.method,
    urlRef: request.urlRef,
    timeoutMs: request.timeoutMs,
    disabledTransportReady: true,
    transportExecutable: false,
    networkAttempted: false,
    endpointResolved: true,
    secretMaterialRead: false,
    secretMaterialReturned: false,
    failClosed: true,
    failClosedErrorType: error.type,
    failClosedRetryable: error.retryable,
    realAdapterWorkerEnabled: false,
    redactedRequest: redactedRequest(request),
  };
}
