import { AGENT_PROVIDER_KINDS, type AgentProviderKind } from "@cf/shared";
import { ValidationError } from "../errors.js";
import type { RuntimeCredentialRef } from "../execution/runtime-safety.js";

// Agent Provider 选择器：从 agent_profile.constraints 解析出执行该 profile 应使用的 provider，
// 并构造 execution 层用的 credential_ref。纯函数，无 I/O。
//
// 约定（与启动种子 seedLocalCliAgents 写入的 constraints 对齐）：
//   - constraints.provider: 本地 CLI provider 标识（如 "claude_code"）→ providerKind=local_cli
//   - 缺省 / 非 local_cli → 视为 openai_compatible（HTTP provider）
//
// 设计取舍：本地 CLI 凭继承的宿主环境登录态调用，不解析真实 keyRef，
//   故 credential_ref.keyRef 用占位引用（env://），仅满足契约的"引用而非内联密钥"约束。

export interface AgentProviderSelection {
  providerKind: AgentProviderKind;
  /** local_cli 时为具体 CLI provider（如 claude_code）；openai_compatible 时为 "openai_compatible" */
  provider: string;
  credentialRef: RuntimeCredentialRef;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// 已知的本地 CLI provider 标识（与 local-cli-agent-registry 保持一致；此处仅做归类判断，不引入运行时依赖）。
const LOCAL_CLI_PROVIDERS = new Set(["claude_code", "gemini_cli", "codex_cli", "opencode_cli", "minicode_cli"]);

/** 从 profile constraints 推断 provider 选择。constraints 非法 / provider 未知时抛 ValidationError。*/
export function selectAgentProvider(constraints: unknown): AgentProviderSelection {
  if (!isPlainObject(constraints))
    throw new ValidationError("agent profile constraints must be an object");

  const provider = constraints.provider;
  if (provider === undefined) {
    // 无 provider 标记：默认 HTTP provider（保持既有 openai_compatible 行为）
    return {
      providerKind: "openai_compatible",
      provider: "openai_compatible",
      credentialRef: { provider: "openai_compatible", keyRef: "secret://llm/openai", scope: "project" },
    };
  }

  if (typeof provider !== "string" || provider.trim().length === 0)
    throw new ValidationError("agent profile constraints.provider must be a non-empty string");

  if (LOCAL_CLI_PROVIDERS.has(provider)) {
    return {
      providerKind: "local_cli",
      provider,
      // 本地 CLI 凭宿主环境调用，不真正解析此 keyRef；用占位引用满足契约。
      credentialRef: { provider, keyRef: "env://LOCAL_CLI_PLACEHOLDER", scope: "system" },
    };
  }

  throw new ValidationError(`unknown agent provider in constraints: ${provider}`);
}

/** 供 schema/校验复用：provider kind 闭集判断 */
export function isAgentProviderKind(v: unknown): v is AgentProviderKind {
  return typeof v === "string" && (AGENT_PROVIDER_KINDS as readonly string[]).includes(v);
}
