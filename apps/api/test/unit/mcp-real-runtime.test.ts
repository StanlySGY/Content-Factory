import { describe, expect, it } from "vitest";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";
import { buildRuntimeExecutionContext, type RuntimeSafetyPolicy } from "../../src/domain/execution/runtime-safety.js";
import {
  MCPJsonRpcHttpClient,
  MCPRealRuntime,
  buildMcpRealRuntimeReadiness,
  parseMcpEndpointRegistry,
  parseMcpToolAllowlist,
} from "../../src/application/runtime/mcp-real-runtime.js";

const policy = (over: Partial<RuntimeSafetyPolicy> = {}): RuntimeSafetyPolicy => ({
  mode: "real_enabled",
  allowRealExecution: true,
  allowNetwork: true,
  allowProcessSpawn: false,
  requireCredentialRef: false,
  redactSnapshots: true,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  ...over,
});

const request = (payload: Record<string, unknown> = {}): RuntimeRequest => ({
  jobId: "mcp-real-unit",
  jobType: "mcp",
  payload: {
    serverRef: "mcp://content-tools",
    toolName: "safe_lookup",
    input: { query: "hello" },
    ...payload,
  },
  attemptCount: 1,
  idempotencyKey: "mcp-real-unit",
  timeoutMs: 30000,
  metadata: {},
});

const context = (over: Partial<RuntimeSafetyPolicy> = {}) =>
  buildRuntimeExecutionContext({
    jobId: "mcp-real-unit",
    jobType: "mcp",
    timeoutMs: 30000,
    policy: policy(over),
  });

describe("MCP real runtime", () => {
  it("builds readiness from endpoint registry, tool allowlist and runtime gates", () => {
    expect(buildMcpRealRuntimeReadiness({
      enabled: false,
      transportMode: "streamable_http",
      endpointRegistry: [],
      toolAllowlist: [],
      runtimeSafetyPolicy: policy({ allowNetwork: false, allowRealExecution: false }),
      networkAllowlist: [],
    })).toMatchObject({
      mode: "mcp_real_runtime_readiness",
      ready: false,
      status: "blocked",
      enabled: false,
      transport_mode: "streamable_http",
    });

    expect(buildMcpRealRuntimeReadiness({
      enabled: true,
      transportMode: "streamable_http",
      endpointRegistry: ["mcp://content-tools=https://mcp.example.test/rpc"],
      toolAllowlist: ["mcp://content-tools#safe_lookup"],
      runtimeSafetyPolicy: policy(),
      networkAllowlist: ["mcp.example.test"],
    })).toMatchObject({
      ready: true,
      status: "ready",
      endpoint_registry_count: 1,
      tool_allowlist_count: 1,
    });
  });

  it("parses endpoint registry and tool allowlist deterministically", () => {
    expect(parseMcpEndpointRegistry(["mcp://content-tools=https://mcp.example.test/rpc"])).toEqual([
      { serverRef: "mcp://content-tools", endpoint: "https://mcp.example.test/rpc" },
    ]);
    expect(parseMcpToolAllowlist(["mcp://content-tools#safe_lookup"])).toEqual([
      { serverRef: "mcp://content-tools", toolName: "safe_lookup" },
    ]);
  });

  it("calls MCP tools/call over JSON-RPC HTTP and redacts snapshots", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: "mcp-real-unit",
        result: { content: [{ type: "text", text: "lookup ok Bearer sk-secret" }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const runtime = new MCPRealRuntime(new MCPJsonRpcHttpClient(fetchImpl), {
      endpointRegistry: parseMcpEndpointRegistry(["mcp://content-tools=https://mcp.example.test/rpc"]),
      toolAllowlist: parseMcpToolAllowlist(["mcp://content-tools#safe_lookup"]),
      networkAllowlist: ["mcp.example.test"],
    });

    const res = await runtime.execute(request({ input: { query: "hello", api_key: "sk-input" } }), context());

    expect(res).toMatchObject({
      status: "success",
      output: {
        provider: "mcp",
        realAdapter: true,
      },
      metadata: {
        adapterMode: "mcp_real",
        transport: "streamable_http",
        networkUsed: true,
        processSpawned: false,
        serverRef: "mcp://content-tools",
        toolName: "safe_lookup",
        endpointHost: "mcp.example.test",
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "safe_lookup", arguments: { query: "hello", api_key: "sk-input" } },
    });
    expect(JSON.stringify(res)).not.toContain("sk-secret");
    expect(JSON.stringify(res)).not.toContain("sk-input");
  });

  it("blocks non-allowlisted, high-risk and non-allowlisted-host calls before network", async () => {
    let called = false;
    const runtime = new MCPRealRuntime(
      new MCPJsonRpcHttpClient(async () => {
        called = true;
        return new Response("{}", { status: 200 });
      }),
      {
        endpointRegistry: parseMcpEndpointRegistry(["mcp://content-tools=https://mcp.example.test/rpc"]),
        toolAllowlist: parseMcpToolAllowlist(["mcp://content-tools#safe_lookup"]),
        networkAllowlist: ["mcp.example.test"],
      },
    );

    await expect(runtime.execute(request({ toolName: "delete_file" }), context())).resolves.toMatchObject({
      status: "failed",
      errorType: "blocked",
      retryable: false,
      metadata: { networkUsed: false },
    });
    await expect(runtime.execute(request({ toolName: "not_allowed" }), context())).resolves.toMatchObject({
      status: "failed",
      errorType: "permission_denied",
      retryable: false,
      metadata: { networkUsed: false },
    });

    const hostBlocked = new MCPRealRuntime(new MCPJsonRpcHttpClient(async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }), {
      endpointRegistry: parseMcpEndpointRegistry(["mcp://content-tools=https://mcp.example.test/rpc"]),
      toolAllowlist: parseMcpToolAllowlist(["mcp://content-tools#safe_lookup"]),
      networkAllowlist: ["other.example.test"],
    });
    await expect(hostBlocked.execute(request(), context())).resolves.toMatchObject({
      status: "failed",
      errorType: "permission_denied",
      metadata: { networkUsed: false },
    });
    expect(called).toBe(false);
  });
});
