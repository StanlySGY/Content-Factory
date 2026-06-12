import { ValidationError } from "../../domain/errors.js";

// 本地 CLI Agent 注册表：声明可被发现/驱动的本地 agentic CLI（Claude Code 等）。
// 仅描述"怎么以非交互方式喂 prompt、从 stdout 取结果"，不含任何密钥/网络逻辑。
// 调用走继承的进程环境（宿主登录态），故不需要 secret:// 引用仪式。

export interface LocalCliAgentSpec {
  /** provider 标识，写入 agent_profile.constraints.provider 与 credentialRef.provider */
  provider: string;
  /** 默认展示名（发现种子用） */
  displayName: string;
  /** 可执行命令名（按 PATH 解析） */
  command: string;
  /** 探测可用性的参数（期望 exit 0），如 ["--version"] */
  probeArgs: string[];
  /** 由 prompt 构造非交互调用参数 */
  buildArgs: (prompt: string, options: LocalCliInvokeOptions) => string[];
  /** 解析 stdout 为纯文本结果；解析失败抛 ValidationError */
  parseOutput: (stdout: string) => LocalCliParsedOutput;
}

export interface LocalCliInvokeOptions {
  model?: string;
}

export interface LocalCliParsedOutput {
  text: string;
  /** 原始可观测字段（成本/会话等），写入结果账本 metadata，已知非密钥 */
  raw: Record<string, unknown>;
}

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// Claude Code：`claude -p "<prompt>" --output-format json [--model x]`，stdout 为单个 result envelope。
const CLAUDE_CODE: LocalCliAgentSpec = {
  provider: "claude_code",
  displayName: "Claude Code",
  command: "claude",
  probeArgs: ["--version"],
  buildArgs: (prompt, options) => {
    const args = ["-p", prompt, "--output-format", "json", "--permission-mode", "bypassPermissions"];
    if (options.model) args.push("--model", options.model);
    return args;
  },
  parseOutput: (stdout) => {
    let envelope: unknown;
    try {
      envelope = JSON.parse(stdout);
    } catch {
      throw new ValidationError("claude_code output is not valid JSON");
    }
    if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope))
      throw new ValidationError("claude_code output envelope must be an object");
    const env = envelope as Record<string, unknown>;
    if (env.is_error === true)
      throw new ValidationError(`claude_code reported is_error: ${pickString(env, "result") ?? "unknown"}`);
    const text = pickString(env, "result");
    if (text === undefined) throw new ValidationError("claude_code output missing result text");
    return {
      text,
      raw: {
        session_id: pickString(env, "session_id"),
        num_turns: pickNumber(env, "num_turns"),
        stop_reason: pickString(env, "stop_reason"),
        total_cost_usd: pickNumber(env, "total_cost_usd"),
        duration_ms: pickNumber(env, "duration_ms"),
      },
    };
  },
};

const REGISTRY: readonly LocalCliAgentSpec[] = [CLAUDE_CODE];

export function listLocalCliAgentSpecs(): readonly LocalCliAgentSpec[] {
  return REGISTRY;
}

export function findLocalCliAgentSpec(provider: string): LocalCliAgentSpec | null {
  return REGISTRY.find((spec) => spec.provider === provider) ?? null;
}
