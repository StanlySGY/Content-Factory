import { describe, expect, it } from "vitest";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";
import {
  buildRuntimeExecutionContext,
  type RuntimeCredentialRef,
  type RuntimeSafetyPolicy,
} from "../../src/domain/execution/runtime-safety.js";
import {
  LocalCliAgentRuntime,
  type LocalCliSpawn,
} from "../../src/application/runtime/local-cli-agent-runtime.js";

// Claude Code 的真实 stdout envelope（精简自实测）：result 即文本答案。
const claudeEnvelope = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "你好世界",
    session_id: "sess-1",
    num_turns: 1,
    stop_reason: "end_turn",
    total_cost_usd: 0.01,
    duration_ms: 1234,
    ...over,
  });

const policy = (over: Partial<RuntimeSafetyPolicy> = {}): RuntimeSafetyPolicy => ({
  mode: "real_enabled",
  allowRealExecution: true,
  allowNetwork: false,
  allowProcessSpawn: true,
  requireCredentialRef: false,
  redactSnapshots: true,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  ...over,
});

const credentialRef = (provider = "claude_code"): RuntimeCredentialRef => ({
  provider,
  keyRef: "env://LOCAL_CLI_PLACEHOLDER",
  scope: "system",
});

const request = (payload: Record<string, unknown> = {}): RuntimeRequest => ({
  jobId: "local-cli-unit",
  jobType: "agent",
  payload: { prompt: "用一句话打招呼", ...payload },
  attemptCount: 1,
  idempotencyKey: "local-cli-unit",
  timeoutMs: 30000,
  metadata: {},
});

const context = (over: Partial<RuntimeSafetyPolicy> = {}, ref: RuntimeCredentialRef | null = credentialRef()) =>
  buildRuntimeExecutionContext({
    jobId: "local-cli-unit",
    jobType: "agent",
    timeoutMs: 30000,
    policy: policy(over),
    credentialRef: ref,
  });

// 记录最近一次 spawn 入参，便于断言命令/参数构造正确。
function recordingSpawn(stdout: string): { spawn: LocalCliSpawn; calls: { command: string; args: string[] }[] } {
  const calls: { command: string; args: string[] }[] = [];
  const spawn: LocalCliSpawn = async (command, args) => {
    calls.push({ command, args });
    return { stdout, stderr: "" };
  };
  return { spawn, calls };
}

describe("LocalCliAgentRuntime", () => {
  it("以非交互参数 spawn claude 并解析 result 文本", async () => {
    const { spawn, calls } = recordingSpawn(claudeEnvelope());
    const res = await new LocalCliAgentRuntime(spawn).execute(request(), context());

    expect(res.status).toBe("success");
    expect(res.output).toMatchObject({ provider: "claude_code", localCliAgent: true, result: { text: "你好世界" } });
    expect(res.metadata).toMatchObject({ transport: "local_cli", networkUsed: false, processSpawned: true });
    // 命令与关键参数构造正确（非交互 + json 输出 + 跳过权限）
    expect(calls[0]!.command).toBe("claude");
    expect(calls[0]!.args).toEqual(
      expect.arrayContaining(["-p", "用一句话打招呼", "--output-format", "json", "--permission-mode", "bypassPermissions"]),
    );
  });

  it("透传 model 到 CLI 参数", async () => {
    const { spawn, calls } = recordingSpawn(claudeEnvelope());
    await new LocalCliAgentRuntime(spawn).execute(request({ model: "sonnet" }), context());
    expect(calls[0]!.args).toEqual(expect.arrayContaining(["--model", "sonnet"]));
  });

  it("从 messages 拼装 prompt（无 prompt 时）", async () => {
    const { spawn, calls } = recordingSpawn(claudeEnvelope());
    const res = await new LocalCliAgentRuntime(spawn).execute(
      request({ prompt: undefined, messages: [{ role: "user", content: "第一段" }, { role: "user", content: "第二段" }] }),
      context(),
    );
    expect(res.status).toBe("success");
    expect(calls[0]!.args).toContain("第一段\n\n第二段");
  });

  it("缺少进程派生闸门时拒绝（permission_denied，不可重试）", async () => {
    const { spawn, calls } = recordingSpawn(claudeEnvelope());
    const res = await new LocalCliAgentRuntime(spawn).execute(request(), context({ allowProcessSpawn: false }));
    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("permission_denied");
    expect(res.retryable).toBe(false);
    expect(calls).toHaveLength(0); // 未真正 spawn
  });

  it("未知 provider 返回 validation_error", async () => {
    const { spawn } = recordingSpawn(claudeEnvelope());
    const res = await new LocalCliAgentRuntime(spawn).execute(request(), context({}, credentialRef("unknown_cli")));
    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("validation_error");
  });

  it("命令未找到（ENOENT）映射为 external_unavailable（可重试）", async () => {
    const spawn: LocalCliSpawn = async () => {
      const err = new Error("spawn claude ENOENT") as Error & { code: string; path: string };
      err.code = "ENOENT";
      err.path = "claude";
      throw err;
    };
    const res = await new LocalCliAgentRuntime(spawn).execute(request(), context());
    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("external_unavailable");
    expect(res.retryable).toBe(true);
  });

  it("子进程被 kill（超时）映射为 timeout（可重试）", async () => {
    const spawn: LocalCliSpawn = async () => {
      const err = new Error("Command failed") as Error & { killed: boolean; signal: string };
      err.killed = true;
      err.signal = "SIGTERM";
      throw err;
    };
    const res = await new LocalCliAgentRuntime(spawn).execute(request(), context());
    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("timeout");
    expect(res.retryable).toBe(true);
  });

  it("CLI 报告 is_error 时归一化为 validation_error", async () => {
    const { spawn } = recordingSpawn(claudeEnvelope({ is_error: true, result: "boom" }));
    const res = await new LocalCliAgentRuntime(spawn).execute(request(), context());
    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("validation_error");
  });

  it("stdout 非 JSON 时归一化为 validation_error", async () => {
    const { spawn } = recordingSpawn("not json at all");
    const res = await new LocalCliAgentRuntime(spawn).execute(request(), context());
    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("validation_error");
  });

  it("不在响应中泄漏 secret 标记", async () => {
    const { spawn } = recordingSpawn(claudeEnvelope());
    const res = await new LocalCliAgentRuntime(spawn).execute(request(), context());
    expect(res.metadata).toMatchObject({ secret_material_read: false, secret_material_returned: false });
  });
});
