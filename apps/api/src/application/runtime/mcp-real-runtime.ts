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
  type RuntimeSafetyPolicy,
} from "../../domain/execution/runtime-safety.js";
import type { IMCPRuntime } from "./ports.js";
import type { AgentProviderFetch } from "./agent-provider-real-http-client.js";

export type MCPTransportMode = "streamable_http";

export interface McpEndpointRegistryEntry {
  serverRef: string;
  endpoint: string;
}

export interface McpToolAllowlistEntry {
  serverRef: string;
  toolName: string;
}

export interface McpRealRuntimeReadiness {
  mode: "mcp_real_runtime_readiness";
  ready: boolean;
  status: "ready" | "blocked";
  enabled: boolean;
  transport_mode: MCPTransportMode;
  endpoint_registry_count: number;
  tool_allowlist_count: number;
  allow_network: boolean;
  allow_real_runtime: boolean;
  redact_snapshots: boolean;
  network_allowlist: string[];
  missing_requirements: string[];
  warnings: string[];
}

export interface MCPRealRuntimeOptions {
  endpointRegistry: McpEndpointRegistryEntry[];
  toolAllowlist: McpToolAllowlistEntry[];
  networkAllowlist: string[];
  transportMode?: MCPTransportMode;
}

export interface MCPJsonRpcHttpResult {
  statusCode: number;
  body: Record<string, unknown>;
  durationMs: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ValidationError(`${label} is required`);
  return value.trim();
}

function parseUrl(endpoint: string): URL {
  try {
    return new URL(endpoint);
  } catch {
    throw new ValidationError(`invalid MCP endpoint: ${endpoint}`);
  }
}

function isHighRiskTool(payload: Record<string, unknown>, toolName: string): boolean {
  return payload.riskLevel === "high" || /delete|write|publish|deploy|shell|exec/i.test(toolName);
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

function messageFromJsonRpcBody(body: Record<string, unknown>, fallback: string): string {
  const error = body.error;
  if (isPlainObject(error) && typeof error.message === "string" && error.message.trim().length > 0)
    return error.message;
  if (typeof body.message === "string" && body.message.trim().length > 0) return body.message;
  return fallback;
}

export function parseMcpEndpointRegistry(entries: string[]): McpEndpointRegistryEntry[] {
  return entries.map((entry) => {
    const sep = entry.indexOf("=");
    if (sep <= 0 || sep === entry.length - 1) throw new ValidationError(`invalid MCP endpoint registry entry: ${entry}`);
    const serverRef = entry.slice(0, sep).trim();
    const endpoint = entry.slice(sep + 1).trim();
    if (!serverRef.startsWith("mcp://")) throw new ValidationError(`invalid MCP serverRef: ${serverRef}`);
    parseUrl(endpoint);
    return { serverRef, endpoint };
  });
}

export function parseMcpToolAllowlist(entries: string[]): McpToolAllowlistEntry[] {
  return entries.map((entry) => {
    const sep = entry.lastIndexOf("#");
    if (sep <= 0 || sep === entry.length - 1) throw new ValidationError(`invalid MCP tool allowlist entry: ${entry}`);
    const serverRef = entry.slice(0, sep).trim();
    const toolName = entry.slice(sep + 1).trim();
    if (!serverRef.startsWith("mcp://")) throw new ValidationError(`invalid MCP serverRef: ${serverRef}`);
    if (toolName.length === 0) throw new ValidationError("MCP toolName is required");
    return { serverRef, toolName };
  });
}

export function buildMcpRealRuntimeReadiness(input: {
  enabled: boolean;
  transportMode: MCPTransportMode;
  endpointRegistry: string[];
  toolAllowlist: string[];
  runtimeSafetyPolicy: RuntimeSafetyPolicy;
  networkAllowlist: string[];
}): McpRealRuntimeReadiness {
  const missingRequirements: string[] = [];
  const warnings: string[] = [];
  let endpointRegistryCount = 0;
  let toolAllowlistCount = 0;

  if (!input.enabled) missingRequirements.push("MCP real runtime must be explicitly enabled");
  if (input.transportMode !== "streamable_http") missingRequirements.push("MCP transport mode must be streamable_http");
  if (input.runtimeSafetyPolicy.mode !== "real_enabled") missingRequirements.push("runtime mode must be real_enabled");
  if (!input.runtimeSafetyPolicy.allowRealExecution) missingRequirements.push("real runtime must be allowed");
  if (!input.runtimeSafetyPolicy.allowNetwork) missingRequirements.push("network must be allowed");
  if (!input.runtimeSafetyPolicy.redactSnapshots) missingRequirements.push("runtime snapshots must be redacted");
  if (input.networkAllowlist.length === 0) missingRequirements.push("execution network allowlist must contain MCP endpoint hosts");

  try {
    endpointRegistryCount = parseMcpEndpointRegistry(input.endpointRegistry).length;
  } catch {
    missingRequirements.push("MCP endpoint registry must be valid");
  }
  try {
    toolAllowlistCount = parseMcpToolAllowlist(input.toolAllowlist).length;
  } catch {
    missingRequirements.push("MCP tool allowlist must be valid");
  }
  if (endpointRegistryCount === 0) missingRequirements.push("MCP endpoint registry must contain at least one endpoint");
  if (toolAllowlistCount === 0) missingRequirements.push("MCP tool allowlist must contain at least one tool");
  if (input.runtimeSafetyPolicy.allowProcessSpawn) warnings.push("process spawn is allowed but MCP real HTTP runtime does not use it");

  const ready = missingRequirements.length === 0;
  return {
    mode: "mcp_real_runtime_readiness",
    ready,
    status: ready ? "ready" : "blocked",
    enabled: input.enabled,
    transport_mode: input.transportMode,
    endpoint_registry_count: endpointRegistryCount,
    tool_allowlist_count: toolAllowlistCount,
    allow_network: input.runtimeSafetyPolicy.allowNetwork,
    allow_real_runtime: input.runtimeSafetyPolicy.allowRealExecution,
    redact_snapshots: input.runtimeSafetyPolicy.redactSnapshots,
    network_allowlist: [...input.networkAllowlist],
    missing_requirements: missingRequirements,
    warnings,
  };
}

export class MCPJsonRpcHttpClient {
  constructor(private readonly fetchFn: AgentProviderFetch = globalThis.fetch.bind(globalThis)) {}

  async callTool(input: {
    endpoint: string;
    jobId: string;
    toolName: string;
    args: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<MCPJsonRpcHttpResult> {
    const started = Date.now();
    const response = await this.fetchFn(input.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: input.jobId,
        method: "tools/call",
        params: { name: input.toolName, arguments: input.args },
      }),
      signal: input.signal,
    });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    if (raw.trim().length > 0) {
      const parsed = JSON.parse(raw) as unknown;
      body = isPlainObject(parsed) ? parsed : { value: parsed };
    }
    return { statusCode: response.status, body, durationMs: Math.max(0, Date.now() - started) };
  }
}

export class MCPRealRuntime implements IMCPRuntime {
  private readonly endpointRegistry: McpEndpointRegistryEntry[];
  private readonly toolAllowlist: McpToolAllowlistEntry[];
  private readonly networkAllowlist: string[];
  private readonly transportMode: MCPTransportMode;

  constructor(
    private readonly client: MCPJsonRpcHttpClient,
    options: MCPRealRuntimeOptions,
  ) {
    this.endpointRegistry = [...options.endpointRegistry];
    this.toolAllowlist = [...options.toolAllowlist];
    this.networkAllowlist = [...options.networkAllowlist];
    this.transportMode = options.transportMode ?? "streamable_http";
  }

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    const started = Date.now();
    validateRuntimeRequest(request);
    const metadata: Record<string, unknown> = {
      adapterMode: "mcp_real",
      transport: this.transportMode,
      networkUsed: false,
      processSpawned: false,
      secret_material_read: false,
      secret_material_returned: false,
    };

    try {
      if (!context) throw new ValidationError("runtime execution context is required");
      if (request.jobType !== "mcp") throw new ValidationError("MCP real runtime only supports mcp jobs");
      assertRealExecutionAllowed(context.policy);
      if (!context.policy.allowNetwork)
        return failed(request, "permission_denied", "MCP real runtime requires network allowance", 0, metadata);
      if (this.transportMode !== "streamable_http")
        return failed(request, "validation_error", "MCP transport mode must be streamable_http", 0, metadata);

      const serverRef = requiredString(request.payload.serverRef, "mcp serverRef");
      const toolName = requiredString(request.payload.toolName, "mcp toolName");
      const args = isPlainObject(request.payload.input) ? request.payload.input : {};
      const endpointEntry = this.endpointRegistry.find((entry) => entry.serverRef === serverRef);
      const endpoint = endpointEntry?.endpoint;
      if (!endpoint) {
        return failed(request, "permission_denied", "MCP serverRef is not registered", 0, {
          ...metadata,
          serverRef,
          toolName,
        });
      }
      const endpointHost = parseUrl(endpoint).hostname;
      const baseMetadata = { ...metadata, serverRef, toolName, endpointHost };

      if (isHighRiskTool(request.payload, toolName)) {
        return failed(request, "blocked", "MCP high-risk tool is blocked before network execution", 0, baseMetadata);
      }
      if (!this.toolAllowlist.some((entry) => entry.serverRef === serverRef && entry.toolName === toolName)) {
        return failed(request, "permission_denied", "MCP tool is not allowlisted", 0, baseMetadata);
      }
      if (!this.networkAllowlist.includes(endpointHost)) {
        return failed(request, "permission_denied", `MCP endpoint host is not allowlisted: ${endpointHost}`, 0, baseMetadata);
      }

      const response = await this.client.callTool({
        endpoint,
        jobId: request.jobId,
        toolName,
        args,
        signal: context.abortSignal,
      });
      const durationMs = response.durationMs;
      if (response.statusCode >= 400) {
        const errorType = normalizeHttpErrorType(response.statusCode);
        return failed(request, errorType, messageFromJsonRpcBody(response.body, `MCP HTTP status ${response.statusCode}`), durationMs, {
          ...baseMetadata,
          networkUsed: true,
          httpStatusCode: response.statusCode,
          responseSnapshot: redactRuntimeSnapshot(response.body),
        });
      }
      if (!Object.prototype.hasOwnProperty.call(response.body, "result")) {
        return failed(request, "validation_error", "MCP JSON-RPC response is missing result", durationMs, {
          ...baseMetadata,
          networkUsed: true,
          httpStatusCode: response.statusCode,
          responseSnapshot: redactRuntimeSnapshot(response.body),
        });
      }
      return {
        jobId: request.jobId,
        status: "success",
        output: {
          provider: "mcp",
          realAdapter: true,
          result: redactRuntimeSnapshot(response.body.result),
        },
        error: null,
        errorType: null,
        retryable: false,
        durationMs,
        metadata: {
          ...baseMetadata,
          networkUsed: true,
          httpStatusCode: response.statusCode,
          responseSnapshot: redactRuntimeSnapshot(response.body),
        },
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
