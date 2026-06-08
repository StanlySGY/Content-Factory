import { describe, expect, it } from "vitest";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";
import { buildRuntimeExecutionContext, type RuntimeSafetyPolicy } from "../../src/domain/execution/runtime-safety.js";
import {
  FakeLocalMcpHarness,
  MCPSafetyRuntime,
} from "../../src/application/runtime/mcp-safety-runtime.js";

const policy = (over: Partial<RuntimeSafetyPolicy> = {}): RuntimeSafetyPolicy => ({
  mode: "real_enabled",
  allowRealExecution: true,
  allowNetwork: false,
  allowProcessSpawn: false,
  requireCredentialRef: false,
  redactSnapshots: true,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  ...over,
});

const request = (payload: Record<string, unknown> = {}): RuntimeRequest => ({
  jobId: "mcp-safety-unit",
  jobType: "mcp",
  payload: {
    serverRef: "mcp://local/test",
    toolName: "safe_read",
    input: { path: "/tmp/readme.md" },
    ...payload,
  },
  attemptCount: 1,
  idempotencyKey: "mcp-safety-unit",
  timeoutMs: 30000,
  metadata: {},
});

const context = (over: Partial<RuntimeSafetyPolicy> = {}) =>
  buildRuntimeExecutionContext({
    jobId: "mcp-safety-unit",
    jobType: "mcp",
    timeoutMs: 30000,
    policy: policy(over),
  });

describe("MCPSafetyRuntime", () => {
  it("fails closed when process spawn is disabled", async () => {
    const res = await new MCPSafetyRuntime(new FakeLocalMcpHarness()).execute(request(), context());

    expect(res).toMatchObject({
      status: "failed",
      errorType: "permission_denied",
      retryable: false,
      metadata: {
        adapterMode: "mcp_safety",
        sandboxPolicy: { processSpawnAllowed: false },
        processSpawned: false,
      },
    });
  });

  it("requires a sandbox policy before local MCP execution", async () => {
    const res = await new MCPSafetyRuntime(new FakeLocalMcpHarness()).execute(
      request({ sandbox: null }),
      context({ allowProcessSpawn: true }),
    );

    expect(res).toMatchObject({
      status: "failed",
      errorType: "permission_denied",
      retryable: false,
      metadata: {
        adapterMode: "mcp_safety",
        processSpawned: false,
      },
    });
  });

  it("executes a safe fake/local MCP tool with redacted stdout and stderr snapshots", async () => {
    const res = await new MCPSafetyRuntime(new FakeLocalMcpHarness()).execute(
      request({
        sandbox: { profile: "local-test", allowProcessSpawn: true },
        fakeStdout: "ok token=secret-value",
        fakeStderr: "Bearer sk-test-secret",
      }),
      context({ allowProcessSpawn: true }),
    );

    expect(res).toMatchObject({
      status: "success",
      output: {
        result: { text: "mcp-ok" },
      },
      metadata: {
        adapterMode: "mcp_safety",
        processSpawned: true,
        mcpHarness: "fake_local",
        snapshots: {
          stdout: "[REDACTED]",
          stderr: "[REDACTED]",
        },
      },
    });
    expect(JSON.stringify(res)).not.toContain("sk-test-secret");
  });

  it("returns blocked awaiting confirmation for high-risk tools without executing", async () => {
    const res = await new MCPSafetyRuntime(new FakeLocalMcpHarness()).execute(
      request({
        toolName: "delete_file",
        riskLevel: "high",
        sandbox: { profile: "local-test", allowProcessSpawn: true },
      }),
      context({ allowProcessSpawn: true }),
    );

    expect(res).toMatchObject({
      status: "failed",
      errorType: "blocked",
      retryable: false,
      output: {
        blocked: true,
        awaitingConfirmation: true,
      },
      metadata: {
        processSpawned: false,
        confirmationRequired: true,
      },
    });
  });

  it("maps timeout and abort to retryable timeout without leaking process output", async () => {
    await expect(new MCPSafetyRuntime(new FakeLocalMcpHarness()).execute(
      request({ sandbox: { profile: "local-test", allowProcessSpawn: true }, fakeDelayMs: 40000 }),
      context({ allowProcessSpawn: true }),
    )).resolves.toMatchObject({
      status: "failed",
      errorType: "timeout",
      retryable: true,
      metadata: { processKilled: true },
    });

    const controller = new AbortController();
    controller.abort();
    const abortedContext = {
      ...context({ allowProcessSpawn: true }),
      abortSignal: controller.signal,
    };

    await expect(new MCPSafetyRuntime(new FakeLocalMcpHarness()).execute(
      request({ sandbox: { profile: "local-test", allowProcessSpawn: true } }),
      abortedContext,
    )).resolves.toMatchObject({
      status: "failed",
      errorType: "timeout",
      retryable: true,
      metadata: { cancelled: true, processKilled: true },
    });
  });
});
