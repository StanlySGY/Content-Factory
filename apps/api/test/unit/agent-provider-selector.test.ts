import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  isAgentProviderKind,
  selectAgentProvider,
} from "../../src/domain/agent/agent-provider-selector.js";

// Agent Provider 选择器：从 agent_profile.constraints 推断 provider 并构造 credential_ref。
// 与启动种子 seedLocalCliAgents 写入的 constraints（provider: "claude_code"）对齐。

describe("selectAgentProvider", () => {
  it("constraints.provider=claude_code → local_cli + 占位 env:// 引用", () => {
    const sel = selectAgentProvider({ provider: "claude_code", transport: "local_cli", command: "claude" });
    expect(sel.providerKind).toBe("local_cli");
    expect(sel.provider).toBe("claude_code");
    expect(sel.credentialRef).toEqual({
      provider: "claude_code",
      keyRef: "env://LOCAL_CLI_PLACEHOLDER",
      scope: "system",
    });
  });

  it("无 provider 标记 → 默认 openai_compatible（保持既有行为）", () => {
    const sel = selectAgentProvider({});
    expect(sel.providerKind).toBe("openai_compatible");
    expect(sel.provider).toBe("openai_compatible");
    expect(sel.credentialRef).toEqual({
      provider: "openai_compatible",
      keyRef: "secret://llm/openai",
      scope: "project",
    });
  });

  it("credentialRef.keyRef 始终是引用形态（非内联密钥）", () => {
    for (const c of [{ provider: "claude_code" }, {}]) {
      const { keyRef } = selectAgentProvider(c).credentialRef;
      expect(/^(secret|vault|env):\/\//.test(keyRef)).toBe(true);
    }
  });

  it("constraints 非对象 → ValidationError", () => {
    for (const bad of [null, undefined, "x", 42, [1, 2]]) {
      expect(() => selectAgentProvider(bad)).toThrow(ValidationError);
    }
  });

  it("provider 为空串 / 非字符串 → ValidationError", () => {
    expect(() => selectAgentProvider({ provider: "" })).toThrow(ValidationError);
    expect(() => selectAgentProvider({ provider: "   " })).toThrow(ValidationError);
    expect(() => selectAgentProvider({ provider: 123 })).toThrow(ValidationError);
  });

  it("未知 provider → ValidationError", () => {
    expect(() => selectAgentProvider({ provider: "some_unknown_cli" })).toThrow(ValidationError);
  });
});

describe("isAgentProviderKind", () => {
  it("仅接受闭集内的 provider kind", () => {
    expect(isAgentProviderKind("openai_compatible")).toBe(true);
    expect(isAgentProviderKind("local_cli")).toBe(true);
    expect(isAgentProviderKind("claude_code")).toBe(false);
    expect(isAgentProviderKind(undefined)).toBe(false);
    expect(isAgentProviderKind(42)).toBe(false);
  });
});
