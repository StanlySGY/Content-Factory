import {
  type AgentProviderHttpClientContext,
  type AgentProviderHttpError,
  type AgentProviderHttpRequest,
  type AgentProviderHttpResponse,
  type IAgentProviderHttpClient,
  validateAgentProviderHttpRequest,
  validateAgentProviderHttpResponse,
} from "./agent-provider-http-boundary.js";

export interface AgentProviderHttpNetworkPolicy {
  realHttpEnabled: boolean;
  allowNetwork: boolean;
  allowedHosts: string[];
  endpointMap: Record<string, string>;
}

export interface AgentProviderHttpTransportRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs: number;
  signal: AbortSignal;
  requestId: string;
}

export interface IAgentProviderHttpTransport {
  send(request: AgentProviderHttpTransportRequest): Promise<AgentProviderHttpResponse>;
}

export class DisabledAgentProviderHttpTransport implements IAgentProviderHttpTransport {
  async send(): Promise<AgentProviderHttpResponse> {
    throw httpError({ type: "connection_failed", retryable: false, message: "no real HTTP transport registered" });
  }
}

function httpError(input: AgentProviderHttpError): AgentProviderHttpError {
  return input;
}

function messageFromBody(body: Record<string, unknown>, fallback: string): string {
  const message = body.message;
  return typeof message === "string" && message.trim().length > 0 ? message : fallback;
}

function errorFromStatus(response: AgentProviderHttpResponse): AgentProviderHttpError | null {
  if (response.statusCode < 400) return null;
  const type =
    response.statusCode === 429 ? "rate_limited" :
    response.statusCode === 401 || response.statusCode === 403 ? "auth_failed" :
    response.statusCode >= 400 && response.statusCode < 500 ? "bad_request" :
    "provider_error";
  return httpError({
    type,
    retryable: type === "rate_limited" || type === "provider_error",
    statusCode: response.statusCode,
    providerRequestId: response.providerRequestId,
    message: messageFromBody(response.bodySnapshot, `provider HTTP status ${response.statusCode}`),
  });
}

function resolveEndpoint(urlRef: string, policy: AgentProviderHttpNetworkPolicy): string {
  const endpoint = policy.endpointMap[urlRef];
  if (!endpoint)
    throw httpError({ type: "connection_failed", retryable: false, message: `no endpoint mapped for ${urlRef}` });
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw httpError({ type: "connection_failed", retryable: false, message: `invalid endpoint for ${urlRef}` });
  }
  if (!policy.allowedHosts.includes(url.hostname))
    throw httpError({ type: "network_disabled", retryable: false, message: `host not allowlisted: ${url.hostname}` });
  return url.toString();
}

export class RealAgentProviderHttpClient implements IAgentProviderHttpClient {
  constructor(
    private readonly policy: AgentProviderHttpNetworkPolicy,
    private readonly transport: IAgentProviderHttpTransport = new DisabledAgentProviderHttpTransport(),
  ) {}

  async send(
    request: AgentProviderHttpRequest,
    context: AgentProviderHttpClientContext,
  ): Promise<AgentProviderHttpResponse> {
    validateAgentProviderHttpRequest(request);
    if (context.signal.aborted)
      throw httpError({ type: "aborted", retryable: true, statusCode: 408, message: "request aborted" });
    if (!this.policy.realHttpEnabled || !this.policy.allowNetwork)
      throw httpError({ type: "network_disabled", retryable: false, message: "real HTTP network execution is disabled" });

    const url = resolveEndpoint(request.urlRef, this.policy);
    const response = await this.transport.send({
      url,
      method: request.method,
      headers: { ...request.headersRef },
      body: request.body,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
      requestId: request.requestId,
    });
    validateAgentProviderHttpResponse(response);
    const statusError = errorFromStatus(response);
    if (statusError) throw statusError;
    return response;
  }
}
