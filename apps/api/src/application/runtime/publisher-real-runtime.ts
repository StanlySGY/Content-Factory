import { ValidationError } from "../../domain/errors.js";
import {
  buildPublisherRequestId,
  validatePublisherRuntimePayload,
} from "../../domain/execution/publisher-runtime.js";
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
  type RuntimeSafetyPolicy,
} from "../../domain/execution/runtime-safety.js";
import type { IPublisherRuntime } from "./ports.js";
import type { AgentProviderFetch } from "./agent-provider-real-http-client.js";

export interface PublisherEndpointRegistryEntry {
  targetRef: string;
  endpoint: string;
}

export interface PublisherRealRuntimeReadiness {
  mode: "publisher_real_runtime_readiness";
  ready: boolean;
  status: "ready" | "blocked";
  enabled: boolean;
  endpoint_registry_count: number;
  channel_allowlist_count: number;
  allow_network: boolean;
  allow_real_runtime: boolean;
  redact_snapshots: boolean;
  network_allowlist: string[];
  missing_requirements: string[];
  warnings: string[];
}

export interface PublisherRealRuntimeOptions {
  endpointRegistry: PublisherEndpointRegistryEntry[];
  channelAllowlist: string[];
  networkAllowlist: string[];
}

export interface PublisherReleaseHttpResult {
  statusCode: number;
  body: Record<string, unknown>;
  durationMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseUrl(endpoint: string): URL {
  try {
    return new URL(endpoint);
  } catch {
    throw new ValidationError(`invalid publisher endpoint: ${endpoint}`);
  }
}

function failed(
  request: RuntimeRequest,
  errorType: NonNullable<RuntimeResponse["errorType"]>,
  error: string,
  durationMs: number,
  metadata: Record<string, unknown>,
): RuntimeResponse {
  return {
    ...failedRuntimeResponse(request.jobId, errorType, error, durationMs),
    retryable: isRetryableRuntimeError(errorType),
    metadata,
  };
}

function normalizeHttpErrorType(statusCode: number): NonNullable<RuntimeResponse["errorType"]> {
  if (statusCode === 429) return "rate_limited";
  if (statusCode === 401 || statusCode === 403) return "permission_denied";
  if (statusCode >= 500) return "external_unavailable";
  return "validation_error";
}

function messageFromBody(body: Record<string, unknown>, fallback: string): string {
  if (typeof body.message === "string" && body.message.trim().length > 0) return body.message;
  if (typeof body.error === "string" && body.error.trim().length > 0) return body.error;
  const error = body.error;
  if (isRecord(error) && typeof error.message === "string" && error.message.trim().length > 0)
    return error.message;
  return fallback;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function parsePublisherEndpointRegistry(entries: string[]): PublisherEndpointRegistryEntry[] {
  return entries.map((entry) => {
    const sep = entry.indexOf("=");
    if (sep <= 0 || sep === entry.length - 1)
      throw new ValidationError(`invalid publisher endpoint registry entry: ${entry}`);
    const targetRef = entry.slice(0, sep).trim();
    const endpoint = entry.slice(sep + 1).trim();
    if (!targetRef.startsWith("publisher://")) throw new ValidationError(`invalid publisher targetRef: ${targetRef}`);
    parseUrl(endpoint);
    return { targetRef, endpoint };
  });
}

export function buildPublisherRealRuntimeReadiness(input: {
  enabled: boolean;
  endpointRegistry: string[];
  channelAllowlist: string[];
  runtimeSafetyPolicy: RuntimeSafetyPolicy;
  networkAllowlist: string[];
}): PublisherRealRuntimeReadiness {
  const missingRequirements: string[] = [];
  const warnings: string[] = [];
  let endpointRegistryCount = 0;

  if (!input.enabled) missingRequirements.push("Publisher real runtime must be explicitly enabled");
  if (input.runtimeSafetyPolicy.mode !== "real_enabled") missingRequirements.push("runtime mode must be real_enabled");
  if (!input.runtimeSafetyPolicy.allowRealExecution) missingRequirements.push("real runtime must be allowed");
  if (!input.runtimeSafetyPolicy.allowNetwork) missingRequirements.push("network must be allowed");
  if (!input.runtimeSafetyPolicy.redactSnapshots) missingRequirements.push("runtime snapshots must be redacted");
  if (input.networkAllowlist.length === 0) missingRequirements.push("execution network allowlist must contain publisher endpoint hosts");

  try {
    endpointRegistryCount = parsePublisherEndpointRegistry(input.endpointRegistry).length;
  } catch {
    missingRequirements.push("Publisher endpoint registry must be valid");
  }
  if (endpointRegistryCount === 0) missingRequirements.push("Publisher endpoint registry must contain at least one endpoint");
  if (input.channelAllowlist.length === 0) missingRequirements.push("Publisher channel allowlist must contain at least one channel");
  if (input.runtimeSafetyPolicy.allowProcessSpawn) warnings.push("process spawn is allowed but publisher real runtime does not use it");

  const ready = missingRequirements.length === 0;
  return {
    mode: "publisher_real_runtime_readiness",
    ready,
    status: ready ? "ready" : "blocked",
    enabled: input.enabled,
    endpoint_registry_count: endpointRegistryCount,
    channel_allowlist_count: input.channelAllowlist.length,
    allow_network: input.runtimeSafetyPolicy.allowNetwork,
    allow_real_runtime: input.runtimeSafetyPolicy.allowRealExecution,
    redact_snapshots: input.runtimeSafetyPolicy.redactSnapshots,
    network_allowlist: [...input.networkAllowlist],
    missing_requirements: missingRequirements,
    warnings,
  };
}

export class PublisherReleaseHttpClient {
  constructor(private readonly fetchFn: AgentProviderFetch = globalThis.fetch.bind(globalThis)) {}

  async publish(input: {
    endpoint: string;
    body: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<PublisherReleaseHttpResult> {
    const started = Date.now();
    const response = await this.fetchFn(input.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.body),
      signal: input.signal,
    });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    if (raw.trim().length > 0) {
      const parsed = JSON.parse(raw) as unknown;
      body = isRecord(parsed) ? parsed : { value: parsed };
    }
    return { statusCode: response.status, body, durationMs: Math.max(0, Date.now() - started) };
  }
}

export class PublisherRealRuntime implements IPublisherRuntime {
  private readonly endpointRegistry: PublisherEndpointRegistryEntry[];
  private readonly channelAllowlist: string[];
  private readonly networkAllowlist: string[];

  constructor(
    private readonly client: PublisherReleaseHttpClient,
    options: PublisherRealRuntimeOptions,
  ) {
    this.endpointRegistry = [...options.endpointRegistry];
    this.channelAllowlist = [...options.channelAllowlist];
    this.networkAllowlist = [...options.networkAllowlist];
  }

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    const started = Date.now();
    validateRuntimeRequest(request);
    const metadata: Record<string, unknown> = {
      adapterMode: "publisher_real",
      networkUsed: false,
      processSpawned: false,
      secret_material_read: false,
      secret_material_returned: false,
    };

    try {
      if (!context) throw new ValidationError("runtime execution context is required");
      if (request.jobType !== "publisher") throw new ValidationError("Publisher real runtime only supports publisher jobs");
      assertRealExecutionAllowed(context.policy);
      if (!context.policy.allowNetwork)
        return failed(request, "permission_denied", "Publisher real runtime requires network allowance", 0, metadata);

      const payload = validatePublisherRuntimePayload(request.payload);
      const publishRecordId = stringField(request.payload.publishRecordId);
      const endpointEntry = this.endpointRegistry.find((entry) => entry.targetRef === payload.targetRef);
      const endpoint = endpointEntry?.endpoint;
      const endpointHost = endpoint ? parseUrl(endpoint).hostname : null;
      const baseMetadata = {
        ...metadata,
        targetRef: payload.targetRef,
        channel: payload.channel,
        ...(endpointHost ? { endpointHost } : {}),
      };

      if (payload.action !== "publish")
        return failed(request, "blocked", "Publisher real runtime only allows publish action", 0, baseMetadata);
      if (!payload.preview)
        return failed(request, "blocked", "Publisher real runtime requires a preview snapshot", 0, baseMetadata);
      if (!payload.approved || !payload.approvalRef)
        return failed(request, "blocked", "Publisher real runtime requires approval", 0, baseMetadata);
      if (!publishRecordId)
        return failed(request, "blocked", "Publisher real runtime requires publishRecordId", 0, baseMetadata);
      if (!endpoint)
        return failed(request, "permission_denied", "Publisher targetRef is not registered", 0, baseMetadata);
      if (!this.channelAllowlist.includes(payload.channel))
        return failed(request, "permission_denied", "Publisher channel is not allowlisted", 0, baseMetadata);
      if (!endpointHost || !this.networkAllowlist.includes(endpointHost))
        return failed(request, "permission_denied", `Publisher endpoint host is not allowlisted: ${endpointHost ?? ""}`, 0, baseMetadata);

      const publisherRequestId = buildPublisherRequestId({
        targetRef: payload.targetRef,
        channel: payload.channel,
        previewId: payload.preview.previewId,
        idempotencyKey: request.idempotencyKey,
      });
      const response = await this.client.publish({
        endpoint,
        signal: context.abortSignal,
        body: {
          action: payload.action,
          channel: payload.channel,
          content: payload.content,
          preview: payload.preview,
          approvalRef: payload.approvalRef,
          publishRecordId,
          publisherRequestId,
        },
      });
      const networkMetadata = {
        ...baseMetadata,
        networkUsed: true,
        httpStatusCode: response.statusCode,
        responseSnapshot: redactRuntimeSnapshot(response.body),
      };

      if (response.statusCode >= 400) {
        const errorType = normalizeHttpErrorType(response.statusCode);
        return failed(
          request,
          errorType,
          messageFromBody(response.body, `Publisher HTTP status ${response.statusCode}`),
          response.durationMs,
          networkMetadata,
        );
      }
      const externalRef = stringField(response.body.externalRef);
      if (!externalRef) {
        return failed(request, "validation_error", "Publisher response is missing externalRef", response.durationMs, networkMetadata);
      }
      return {
        jobId: request.jobId,
        status: "success",
        output: {
          provider: "publisher",
          action: "publish",
          externalPublished: true,
          externalRef,
          publisherRequestId,
        },
        error: null,
        errorType: null,
        retryable: false,
        durationMs: response.durationMs,
        metadata: networkMetadata,
      };
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "AbortError" || /timeout|aborted/i.test(e.message));
      if (aborted) {
        return failed(request, "timeout", e instanceof Error ? e.message : String(e), request.timeoutMs, {
          ...metadata,
          cancelled: context?.abortSignal.aborted === true,
        });
      }
      if (e instanceof SyntaxError) {
        return failed(request, "external_unavailable", e.message, Math.max(0, Date.now() - started), metadata);
      }
      const type = e instanceof ValidationError ? "validation_error" : "external_unavailable";
      return failed(request, type, e instanceof Error ? e.message : String(e), Math.max(0, Date.now() - started), metadata);
    }
  }
}
