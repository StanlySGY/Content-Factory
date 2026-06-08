import {
  type AgentProviderHttpClientContext,
  type AgentProviderHttpError,
  type AgentProviderHttpRequest,
  type AgentProviderHttpResponse,
  type IAgentProviderHttpClient,
  validateAgentProviderHttpRequest,
  validateAgentProviderHttpResponse,
} from "./agent-provider-http-boundary.js";
import {
  assertAgentRealProductionTransportGate,
  buildAgentRealProductionTransportGateSnapshot,
  type AgentRealProductionTransportGateSnapshot,
} from "./agent-real-production-transport-gate.js";
import type { IRuntimeCredentialResolver } from "./credential-resolver.js";

export interface AgentProviderHttpNetworkPolicy {
  realHttpEnabled: boolean;
  allowNetwork: boolean;
  allowedHosts: string[];
  endpointMap: Record<string, string>;
  requireCredentialResolver?: boolean;
  allowInsecureCredentialRefPassthrough?: boolean;
  quotaPolicyReady?: boolean;
  costMetricsReady?: boolean;
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

export type AgentProviderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function providerRequestIdFromHeaders(headers: Headers): string | undefined {
  return headers.get("x-request-id") ?? headers.get("x-provider-request-id") ?? headers.get("openai-request-id") ?? undefined;
}

function safeResponseHeaders(headers: Headers): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of headers.entries()) {
    if (/authorization|api[-_]?key|token|secret|credential/i.test(key)) continue;
    snapshot[key] = value;
  }
  return snapshot;
}

export class FetchAgentProviderHttpTransport implements IAgentProviderHttpTransport {
  constructor(private readonly fetchFn: AgentProviderFetch = globalThis.fetch.bind(globalThis)) {}

  async send(request: AgentProviderHttpTransportRequest): Promise<AgentProviderHttpResponse> {
    const started = Date.now();
    try {
      const response = await this.fetchFn(request.url, {
        method: request.method,
        headers: {
          "content-type": "application/json",
          ...request.headers,
        },
        body: JSON.stringify(request.body),
        signal: request.signal,
      });
      const rawBody = await response.text();
      let bodySnapshot: Record<string, unknown> = {};
      if (rawBody.trim().length > 0) {
        const parsed = JSON.parse(rawBody) as unknown;
        bodySnapshot = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ?
          parsed as Record<string, unknown> :
          { value: parsed };
      }
      return {
        statusCode: response.status,
        headersSnapshot: safeResponseHeaders(response.headers),
        bodySnapshot,
        providerRequestId: providerRequestIdFromHeaders(response.headers) ?? request.requestId,
        durationMs: Math.max(0, Date.now() - started),
      };
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw httpError({
          type: "malformed_response",
          retryable: false,
          message: e.message,
          providerRequestId: request.requestId,
        });
      }
      if (request.signal.aborted) {
        throw abortedError();
      }
      throw httpError({
        type: "connection_failed",
        retryable: true,
        message: e instanceof Error ? e.message : String(e),
        providerRequestId: request.requestId,
      });
    }
  }
}

export class DisabledAgentProviderHttpTransport implements IAgentProviderHttpTransport {
  async send(): Promise<AgentProviderHttpResponse> {
    throw httpError({ type: "connection_failed", retryable: false, message: "no real HTTP transport registered" });
  }
}

function httpError(input: AgentProviderHttpError): AgentProviderHttpError {
  return input;
}

function timeoutError(timeoutMs: number): AgentProviderHttpError {
  return httpError({
    type: "timeout",
    retryable: true,
    statusCode: 408,
    message: `request timed out after ${timeoutMs}ms`,
  });
}

function abortedError(): AgentProviderHttpError {
  return httpError({ type: "aborted", retryable: true, statusCode: 408, message: "request aborted" });
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

function authFailed(message: string): AgentProviderHttpError {
  return httpError({ type: "auth_failed", retryable: false, statusCode: 403, message });
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
    private readonly credentialResolver: IRuntimeCredentialResolver | null = null,
  ) {}

  describeBoundary(): Record<string, unknown> {
    return {
      httpClientKind: "real",
      networkUsed: this.transport instanceof DisabledAgentProviderHttpTransport ? false : this.policy.allowNetwork,
      secret_material_injected: Boolean(this.credentialResolver),
    };
  }

  async send(
    request: AgentProviderHttpRequest,
    context: AgentProviderHttpClientContext,
  ): Promise<AgentProviderHttpResponse> {
    validateAgentProviderHttpRequest(request);
    if (context.signal.aborted) throw abortedError();
    if (!this.policy.realHttpEnabled || !this.policy.allowNetwork)
      throw httpError({ type: "network_disabled", retryable: false, message: "real HTTP network execution is disabled" });

    const endpointMapped = Object.prototype.hasOwnProperty.call(this.policy.endpointMap, request.urlRef);
    const gate = this.buildGateSnapshot(request, endpointMapped);
    try {
      assertAgentRealProductionTransportGate(gate);
    } catch (e) {
      if (e instanceof Error && gate.missingRequirements.includes("credential_resolver"))
        throw authFailed(e.message);
      throw httpError({
        type: gate.missingRequirements.some((req) => req.includes("network") || req.includes("host")) ?
          "network_disabled" :
          "connection_failed",
        retryable: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }

    const url = resolveEndpoint(request.urlRef, this.policy);
    const timeoutMs = Math.min(request.timeoutMs, context.timeoutMs);
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let removeParentAbortListener: (() => void) | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(timeoutError(timeoutMs));
      }, timeoutMs);
    });
    const parentAbortPromise = new Promise<never>((_, reject) => {
      const onAbort = () => {
        controller.abort();
        reject(abortedError());
      };
      context.signal.addEventListener("abort", onAbort, { once: true });
      removeParentAbortListener = () => context.signal.removeEventListener("abort", onAbort);
    });

    const maybeHeaders = this.resolveTransportHeaders(request);
    const headers = maybeHeaders instanceof Promise ? await maybeHeaders : maybeHeaders;
    const response = await Promise.race([
      this.transport.send({
        url,
        method: request.method,
        headers,
        body: request.body,
        timeoutMs,
        signal: controller.signal,
        requestId: request.requestId,
      }),
      timeoutPromise,
      parentAbortPromise,
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
      removeParentAbortListener?.();
    });
    validateAgentProviderHttpResponse(response);
    const statusError = errorFromStatus(response);
    if (statusError) throw statusError;
    return response;
  }

  private resolveTransportHeaders(
    request: AgentProviderHttpRequest,
  ): Record<string, string> | Promise<Record<string, string>> {
    const authRef = request.headersRef.authorization_ref ?? request.headersRef.Authorization;
    if (!this.credentialResolver || !authRef) return { ...request.headersRef };
    return this.credentialResolver.resolve({
      provider: "openai_compatible",
      keyRef: authRef,
      scope: "project",
    }).then((resolved) => {
      if (
        resolved.provider !== "openai_compatible" ||
        resolved.keyRef !== authRef ||
        resolved.scope !== "project" ||
        resolved.resolved !== true ||
        typeof resolved.material !== "string" ||
        resolved.material.trim().length === 0
      )
        throw authFailed("runtime credential resolution failed");
      return { Authorization: `Bearer ${resolved.material}` };
    });
  }

  private buildGateSnapshot(
    request: AgentProviderHttpRequest,
    endpointMapped: boolean,
  ): AgentRealProductionTransportGateSnapshot {
    const authRef = request.headersRef.authorization_ref ?? request.headersRef.Authorization;
    const requireCredentialResolver = this.policy.requireCredentialResolver ?? true;
    return buildAgentRealProductionTransportGateSnapshot({
      realHttpEnabled: this.policy.realHttpEnabled,
      allowNetwork: this.policy.allowNetwork,
      allowedHosts: this.policy.allowedHosts,
      endpointMapped,
      credentialRefPresent: typeof authRef === "string" && authRef.trim().length > 0,
      credentialResolverPresent: !requireCredentialResolver ||
        Boolean(this.credentialResolver) ||
        this.policy.allowInsecureCredentialRefPassthrough === true,
      quotaPolicyReady: this.policy.quotaPolicyReady ?? true,
      costMetricsReady: this.policy.costMetricsReady ?? true,
    });
  }
}
