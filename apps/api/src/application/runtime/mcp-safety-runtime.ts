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
import type { IMCPRuntime } from "./ports.js";

export interface MCPSandboxPolicy {
  profile: string;
  allowProcessSpawn: boolean;
  resourceLimits?: {
    maxRuntimeMs?: number;
    maxStdoutBytes?: number;
    maxStderrBytes?: number;
  };
}

export interface MCPHarnessRequest {
  jobId: string;
  serverRef: string;
  toolName: string;
  input: Record<string, unknown>;
  timeoutMs: number;
  sandbox: MCPSandboxPolicy;
  fakeStdout?: string;
  fakeStderr?: string;
  fakeDelayMs?: number;
}

export interface MCPHarnessResult {
  status: "success" | "failed";
  outputText?: string;
  error?: string;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface IMCPLocalHarness {
  readonly kind: "fake_local";
  invoke(request: MCPHarnessRequest, signal: AbortSignal): Promise<MCPHarnessResult>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function str(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ValidationError(`${label} is required`);
  return value;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sandboxFromPayload(payload: Record<string, unknown>): MCPSandboxPolicy {
  const sandbox = payload.sandbox;
  if (!isPlainObject(sandbox)) throw new ValidationError("mcp sandbox policy is required");
  const policy = {
    profile: str(sandbox.profile, "mcp sandbox profile"),
    allowProcessSpawn: sandbox.allowProcessSpawn === true,
    resourceLimits: isPlainObject(sandbox.resourceLimits)
      ? {
          maxRuntimeMs: numberOrUndefined(sandbox.resourceLimits.maxRuntimeMs),
          maxStdoutBytes: numberOrUndefined(sandbox.resourceLimits.maxStdoutBytes),
          maxStderrBytes: numberOrUndefined(sandbox.resourceLimits.maxStderrBytes),
        }
      : undefined,
  };
  if (!policy.allowProcessSpawn) throw new ValidationError("mcp sandbox policy must explicitly allow process spawn");
  return policy;
}

function isHighRisk(payload: Record<string, unknown>, toolName: string): boolean {
  return payload.riskLevel === "high" || /delete|write|publish|deploy|shell|exec/i.test(toolName);
}

function baseMetadata(context: RuntimeExecutionContext | undefined, harnessKind: string | null): Record<string, unknown> {
  return {
    adapterMode: "mcp_safety",
    runtimeMode: context?.mode ?? null,
    sandboxPolicy: {
      processSpawnAllowed: context?.policy.allowProcessSpawn ?? false,
    },
    mcpHarness: harnessKind,
    networkUsed: false,
    processSpawned: false,
    secret_material_read: false,
    secret_material_returned: false,
  };
}

function failed(
  request: RuntimeRequest,
  errorType: NonNullable<RuntimeResponse["errorType"]>,
  error: string,
  durationMs: number,
  metadata: Record<string, unknown>,
  output: Record<string, unknown> = {},
): RuntimeResponse {
  return {
    ...failedRuntimeResponse(request.jobId, errorType, error, durationMs),
    output,
    retryable: isRetryableRuntimeError(errorType),
    metadata,
  };
}

export class FakeLocalMcpHarness implements IMCPLocalHarness {
  readonly kind = "fake_local" as const;

  async invoke(request: MCPHarnessRequest, signal: AbortSignal): Promise<MCPHarnessResult> {
    if (signal.aborted) throw Object.assign(new Error("mcp invocation aborted"), { name: "AbortError" });
    const durationMs = request.fakeDelayMs ?? 0;
    if (durationMs > request.timeoutMs) throw Object.assign(new Error("mcp invocation timed out"), { name: "AbortError" });
    return {
      status: "success",
      outputText: "mcp-ok",
      stdout: request.fakeStdout ?? "mcp-ok",
      stderr: request.fakeStderr ?? "",
      durationMs,
    };
  }
}

export class MCPSafetyRuntime implements IMCPRuntime {
  constructor(private readonly harness: IMCPLocalHarness | null = null) {}

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    const started = Date.now();
    validateRuntimeRequest(request);
    const metadata = baseMetadata(context, this.harness?.kind ?? null);

    try {
      if (!context) throw new ValidationError("runtime execution context is required");
      if (request.jobType !== "mcp") throw new ValidationError("mcp safety runtime only supports mcp jobs");
      assertRealExecutionAllowed(context.policy);
      if (!context.policy.allowProcessSpawn)
        return failed(request, "permission_denied", "mcp safety runtime requires process spawn allowance", 0, metadata);
      if (!this.harness)
        return failed(request, "permission_denied", "mcp local harness is not registered", 0, metadata);

      const serverRef = str(request.payload.serverRef, "mcp serverRef");
      const toolName = str(request.payload.toolName, "mcp toolName");
      const input = isPlainObject(request.payload.input) ? request.payload.input : {};

      if (isHighRisk(request.payload, toolName)) {
        return failed(request, "blocked", "mcp high-risk tool requires confirmation", 0, {
          ...metadata,
          confirmationRequired: true,
          riskLevel: "high",
          toolName,
        }, { blocked: true, awaitingConfirmation: true });
      }

      let sandbox: MCPSandboxPolicy;
      try {
        sandbox = sandboxFromPayload(request.payload);
      } catch (e) {
        return failed(request, "permission_denied", e instanceof Error ? e.message : String(e), 0, metadata);
      }

      const harnessRequest: MCPHarnessRequest = {
        jobId: request.jobId,
        serverRef,
        toolName,
        input,
        timeoutMs: request.timeoutMs,
        sandbox,
        fakeStdout: typeof request.payload.fakeStdout === "string" ? request.payload.fakeStdout : undefined,
        fakeStderr: typeof request.payload.fakeStderr === "string" ? request.payload.fakeStderr : undefined,
        fakeDelayMs: numberOrUndefined(request.payload.fakeDelayMs),
      };
      const result = await this.harness.invoke(harnessRequest, context.abortSignal);
      const snapshots = redactRuntimeSnapshot({
        stdout: result.stdout,
        stderr: result.stderr,
      });
      return {
        jobId: request.jobId,
        status: "success",
        output: {
          provider: "mcp",
          realAdapter: true,
          result: { text: result.outputText ?? "" },
        },
        error: null,
        errorType: null,
        retryable: false,
        durationMs: result.durationMs,
        metadata: {
          ...metadata,
          processSpawned: true,
          sandboxPolicy: {
            processSpawnAllowed: true,
            profile: sandbox.profile,
            resourceLimits: sandbox.resourceLimits ?? null,
          },
          toolName,
          serverRef,
          snapshots,
        },
      };
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "AbortError" || /aborted|timeout/i.test(e.message));
      if (aborted) {
        return failed(request, "timeout", e instanceof Error ? e.message : String(e), request.timeoutMs, {
          ...metadata,
          cancelled: context?.abortSignal.aborted === true,
          processKilled: true,
        });
      }
      const errorType = e instanceof ValidationError ? "validation_error" : "unknown";
      return failed(request, errorType, e instanceof Error ? e.message : String(e), Math.max(0, Date.now() - started), metadata);
    }
  }
}
