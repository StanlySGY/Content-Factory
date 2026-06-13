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

// Claude Code：`claude -p "<prompt>" --output-format json [--model x]`
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

// Gemini CLI：`gemini -p "<prompt>" --output-format json`，stdout 为单个 JSON 对象
const GEMINI_CLI: LocalCliAgentSpec = {
  provider: "gemini_cli",
  displayName: "Gemini CLI",
  command: "gemini",
  probeArgs: ["--version"],
  buildArgs: (prompt, options) => {
    const args = ["-p", prompt, "--output-format", "json", "--sandbox"];
    if (options.model) args.push("-m", options.model);
    return args;
  },
  parseOutput: (stdout) => {
    let envelope: unknown;
    try {
      envelope = JSON.parse(stdout);
    } catch {
      throw new ValidationError("gemini_cli output is not valid JSON");
    }
    if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope))
      throw new ValidationError("gemini_cli output envelope must be an object");
    const env = envelope as Record<string, unknown>;
    const text = pickString(env, "response");
    if (text === undefined) throw new ValidationError("gemini_cli output missing response text");
    return {
      text,
      raw: {
        session_id: pickString(env, "session_id"),
        stats: env.stats ?? null,
      },
    };
  },
};

// Codex CLI：`codex exec --json "<prompt>"`，stdout 为 JSONL 流
const CODEX_CLI: LocalCliAgentSpec = {
  provider: "codex_cli",
  displayName: "Codex CLI",
  command: "codex",
  probeArgs: ["--version"],
  buildArgs: (prompt, options) => {
    const args = ["exec", "--json"];
    if (options.model) args.push("-m", options.model);
    args.push(prompt);
    return args;
  },
  parseOutput: (stdout) => {
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    const textParts: string[] = [];
    let usage: Record<string, unknown> | null = null;
    for (const line of lines) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (event.type === "item.completed") {
        const item = event.item as Record<string, unknown> | undefined;
        if (item?.type === "agent_message" && typeof item.text === "string") {
          textParts.push(item.text);
        }
      }
      if (event.type === "turn.completed" && event.usage) {
        usage = event.usage as Record<string, unknown>;
      }
    }
    if (textParts.length === 0) throw new ValidationError("codex_cli output contains no agent_message");
    return { text: textParts.join("\n"), raw: { usage } };
  },
};

// OpenCode：`opencode run --format json "<prompt>"`，stdout 为 JSONL 流
const OPENCODE_CLI: LocalCliAgentSpec = {
  provider: "opencode_cli",
  displayName: "OpenCode",
  command: "opencode",
  probeArgs: ["--version"],
  buildArgs: (prompt, options) => {
    const args = ["run", "--format", "json"];
    if (options.model) args.push("-m", options.model);
    args.push(prompt);
    return args;
  },
  parseOutput: (stdout) => {
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    const textParts: string[] = [];
    let sessionID: string | undefined;
    let cost = 0;
    for (const line of lines) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (!sessionID && typeof event.sessionID === "string") sessionID = event.sessionID;
      if (event.type === "text") {
        const part = event.part as Record<string, unknown> | undefined;
        if (part && typeof part.text === "string") textParts.push(part.text);
      }
      if (event.type === "step_finish") {
        const part = event.part as Record<string, unknown> | undefined;
        if (part && typeof part.cost === "number") cost += part.cost;
      }
    }
    if (textParts.length === 0) throw new ValidationError("opencode_cli output contains no text events");
    return { text: textParts.join("\n"), raw: { session_id: sessionID, cost } };
  },
};

// MimoCode：`mimo run --format json "<prompt>"`（规格同 OpenCode 兼容）
const MIMOCODE_CLI: LocalCliAgentSpec = {
  provider: "mimocode_cli",
  displayName: "MimoCode",
  command: "mimo",
  probeArgs: ["--version"],
  buildArgs: (prompt, options) => {
    const args = ["run", "--format", "json"];
    if (options.model) args.push("-m", options.model);
    args.push(prompt);
    return args;
  },
  parseOutput: OPENCODE_CLI.parseOutput,
};

const REGISTRY: readonly LocalCliAgentSpec[] = [CLAUDE_CODE, GEMINI_CLI, CODEX_CLI, OPENCODE_CLI, MIMOCODE_CLI];

export function listLocalCliAgentSpecs(): readonly LocalCliAgentSpec[] {
  return REGISTRY;
}

export function findLocalCliAgentSpec(provider: string): LocalCliAgentSpec | null {
  return REGISTRY.find((spec) => spec.provider === provider) ?? null;
}
