import { execFile, type ExecFileException } from "node:child_process";
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
import { findLocalCliAgentSpec, type LocalCliAgentSpec } from "./local-cli-agent-registry.js";
import type { IAgentRuntime } from "./ports.js";

// LocalCliAgentRuntime：以子进程驱动本地 agentic CLI（Claude Code 等）。
// 与 AgentRealRuntime（OpenAI HTTP）平行的另一类 agent provider：
//   - 不发网络、不读 secret:// 引用，凭继承的进程环境（宿主登录态）调用 CLI；
//   - 安全闸门：mode=real_enabled + allowRealExecution + allowProcessSpawn；
//   - 超时经 AbortSignal 中断子进程，错误归一化到 RuntimeResponse 契约。

export interface LocalCliSpawnResult {
  stdout: string;
  stderr: string;
}

export type LocalCliSpawn = (
  command: string,
  args: string[],
  options: { timeoutMs: number; signal: AbortSignal },
) => Promise<LocalCliSpawnResult>;

// 默认 spawn：execFile + AbortSignal；不经 shell（args 数组直传，无注入面）。
const defaultSpawn: LocalCliSpawn = (command, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { signal: options.signal, timeout: options.timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (error: ExecFileException | null, stdout, stderr) => {
        if (error) {
          (error as ExecFileException & { stderr?: string }).stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });

function promptFromPayload(payload: Record<string, unknown>): string {
  const prompt = payload.prompt;
  if (typeof prompt === "string" && prompt.trim().length > 0) return prompt;
  const messages = payload.messages;
  if (Array.isArray(messages)) {
    const parts = messages.map((m) => {
      if (!m || typeof m !== "object" || Array.isArray(m))
        throw new ValidationError("local cli agent message must be an object");
      const content = (m as { content?: unknown }).content;
      if (typeof content !== "string" || content.trim().length === 0)
        throw new ValidationError("local cli agent message content is required");
      return content;
    });
    if (parts.length > 0) return parts.join("\n\n");
  }
  throw new ValidationError("local cli agent requires payload.prompt or payload.messages");
}

function modelFromPayload(payload: Record<string, unknown>): string | undefined {
  const model = payload.model;
  return typeof model === "string" && model.trim().length > 0 ? model : undefined;
}

function mapSpawnError(error: unknown): { errorType: "timeout" | "external_unavailable" | "unknown"; message: string } {
  const e = error as ExecFileException & { code?: unknown };
  if (e?.killed === true || e?.signal === "SIGTERM" || (typeof e?.message === "string" && /abort|timeout/i.test(e.message)))
    return { errorType: "timeout", message: "local cli agent timed out" };
  if (e?.code === "ENOENT")
    return { errorType: "external_unavailable", message: `local cli command not found: ${String(e?.path ?? "")}` };
  return { errorType: "unknown", message: error instanceof Error ? error.message : String(error) };
}

export class LocalCliAgentRuntime implements IAgentRuntime {
  constructor(private readonly spawn: LocalCliSpawn = defaultSpawn) {}

  async execute(request: RuntimeRequest, context?: RuntimeExecutionContext): Promise<RuntimeResponse> {
    const started = Date.now();
    try {
      validateRuntimeRequest(request);
      if (!context) return this.failure(request.jobId, "validation_error", "runtime execution context is required", started, "unknown");
      if (request.jobType !== "agent")
        return this.failure(request.jobId, "validation_error", "local cli runtime only supports agent", started, "unknown");
      assertRealExecutionAllowed(context.policy);
      if (!context.policy.allowProcessSpawn)
        return this.failure(request.jobId, "permission_denied", "local cli runtime requires allowProcessSpawn=true", started, "claude_code");
      if (!context.credentialRef)
        return this.failure(request.jobId, "permission_denied", "local cli runtime requires a credential ref (provider selector)", started, "unknown");
      const spec = findLocalCliAgentSpec(context.credentialRef.provider);
      if (!spec)
        return this.failure(request.jobId, "validation_error", `unknown local cli provider: ${context.credentialRef.provider}`, started, context.credentialRef.provider);

      const prompt = promptFromPayload(request.payload);
      const args = spec.buildArgs(prompt, { model: modelFromPayload(request.payload) });

      let result: LocalCliSpawnResult;
      try {
        result = await this.spawn(spec.command, args, {
          timeoutMs: request.timeoutMs,
          signal: context.abortSignal,
        });
      } catch (e) {
        const mapped = mapSpawnError(e);
        return this.failure(request.jobId, mapped.errorType, mapped.message, started, spec.provider);
      }

      const parsed = spec.parseOutput(result.stdout);
      const durationMs = Math.max(0, Date.now() - started);
      return {
        jobId: request.jobId,
        status: "success",
        output: { provider: spec.provider, localCliAgent: true, result: { text: parsed.text } },
        error: null,
        errorType: null,
        retryable: false,
        durationMs,
        metadata: this.baseMetadata(spec, { providerRaw: parsed.raw }),
      };
    } catch (e) {
      const errorType = e instanceof ValidationError ? "validation_error" : "unknown";
      return this.failure(request.jobId, errorType, e instanceof Error ? e.message : String(e), started, "unknown");
    }
  }

  private failure(
    jobId: string,
    errorType: "validation_error" | "permission_denied" | "timeout" | "external_unavailable" | "unknown",
    error: string,
    started: number,
    provider: string,
  ): RuntimeResponse {
    return {
      ...failedRuntimeResponse(jobId, errorType, error, Math.max(0, Date.now() - started)),
      retryable: isRetryableRuntimeError(errorType),
      metadata: this.baseMetadata(null, { providerKind: provider }),
    };
  }

  private baseMetadata(
    spec: LocalCliAgentSpec | null,
    extra: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      adapterMode: "real",
      providerKind: spec?.provider ?? extra.providerKind ?? "local_cli",
      transport: "local_cli",
      networkUsed: false,
      processSpawned: spec !== null,
      secret_material_read: false,
      secret_material_returned: false,
      ...("providerRaw" in extra ? { providerRaw: extra.providerRaw } : {}),
    };
  }
}
