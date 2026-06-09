# Productization-P2.1 MCP Real Runtime（审计）

> 范围：在 Productization-P1.3 之后，为 execution layer 增加默认关闭、显式启用、受 allowlist 保护的 MCP Streamable HTTP / JSON-RPC runtime。
> 目标：让 `mcp` execution job 在满足 gate 时可调用真实 MCP endpoint 的 `tools/call`，结果进入 `execution_results` 与 `outbox_events`；不读、不 join、不写 Sprint-4 MCP 控制面表。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Productization-P2.1 |
| Runtime | `MCPRealRuntime` |
| 默认状态 | 关闭，fail-closed |
| Transport | `streamable_http` |
| Protocol | HTTP POST JSON-RPC `tools/call` |
| MCP SDK | 未引入 |
| SSE / stdio | 未实现 |
| Control Plane | 不读、不 join、不回写 |

---

## 2. 架构图

```text
execution_jobs(type=mcp, payload.input)
  -> ExecutionWorker.tickJob()
     -> RuntimeRequest(jobType=mcp)
     -> MockRuntimeAdapterFactory(adapterMode=real)
        -> MCPRealRuntime
           -> env endpoint registry
           -> env tool allowlist
           -> EXECUTION_NETWORK_ALLOWLIST host check
           -> high-risk pre-network block
           -> MCPJsonRpcHttpClient POST JSON-RPC
     -> execution_results append-only ledger
     -> outbox_events execution_job.success/failed
```

P2.1 只闭环 execution plane：`execution_jobs`、`execution_results`、`outbox_events`。它不读取 `mcp_servers`、`mcp_tools`、`tool_invocations`，也不写 `tool_invocations`。

---

## 3. Safety Gates

全部 gate 满足才会在 app 装配中注入 `MCPRealRuntime`：

```text
EXECUTION_RUNTIME_MODE=real_enabled
EXECUTION_RUNTIME_ADAPTER_MODE=real
EXECUTION_ALLOW_REAL_RUNTIME=true
EXECUTION_ALLOW_NETWORK=true
EXECUTION_REDACT_SNAPSHOTS=true
EXECUTION_NETWORK_ALLOWLIST=<endpoint-host>
EXECUTION_MCP_REAL_RUNTIME_ENABLED=true
EXECUTION_MCP_TRANSPORT_MODE=streamable_http
EXECUTION_MCP_ENDPOINT_REGISTRY=mcp://content-tools=https://mcp.example.test/rpc
EXECUTION_MCP_TOOL_ALLOWLIST=mcp://content-tools#safe_lookup
```

Readiness API：

```text
GET /api/execution/ops/mcp-real-runtime-readiness
```

返回 `ready/status/missing_requirements/warnings`，只读 env-derived 配置，不发网络。

---

## 4. Endpoint Registry / Tool Allowlist

Endpoint registry 使用逗号分隔：

```text
mcp://server-ref=https://host/path,mcp://other=https://host2/rpc
```

Tool allowlist 使用 `serverRef#toolName`：

```text
mcp://server-ref#safe_lookup,mcp://server-ref#summarize
```

Runtime 执行前必须同时满足：

| 检查 | 不满足时 |
|---|---|
| `serverRef` 在 registry 内 | `permission_denied`, `networkUsed=false` |
| `toolName` 在 allowlist 内 | `permission_denied`, `networkUsed=false` |
| endpoint host 在 `EXECUTION_NETWORK_ALLOWLIST` 内 | `permission_denied`, `networkUsed=false` |
| `payload.riskLevel !== high` 且 toolName 非高风险模式 | 否则 `blocked`, `networkUsed=false` |

---

## 5. JSON-RPC Request

P2.1 只发送 JSON：

```json
{
  "jsonrpc": "2.0",
  "id": "<jobId>",
  "method": "tools/call",
  "params": {
    "name": "<toolName>",
    "arguments": "<input>"
  }
}
```

不实现 SSE streaming，不实现 stdio transport，不做 MCP SDK client。

---

## 6. 错误映射

| 外部结果 | Runtime errorType | retryable |
|---|---|---|
| `2xx` 且存在 `result` | success | false |
| `429` | `rate_limited` | true |
| `401/403` | `permission_denied` | false |
| `5xx` / 网络异常 | `external_unavailable` | true |
| Abort / timeout | `timeout` | true |
| 高风险工具 | `blocked` | false |

Runtime metadata 包含：

```text
adapterMode=mcp_real
transport=streamable_http
networkUsed
processSpawned=false
serverRef
toolName
endpointHost
```

快照经 `redactRuntimeSnapshot()` 脱敏；测试覆盖 `Bearer`、`sk-*`、`api_key` 不进入 result ledger/outbox。

---

## 7. 与 Sprint-4 MCP 控制面的边界

| 表 / 状态机 | P2.1 行为 |
|---|---|
| `mcp_servers` | 不读 |
| `mcp_tools` | 不读 |
| `tool_invocations` | 不写 |
| Agent/MCP/Workflow/Review/Publisher 状态机 | 不改 |
| `audit_events` | 不读、不替代 hash chain |

原因：P2.1 是 execution runtime 产品化入口，不是 Sprint-4 MCP 壳层的控制面改造。真实 MCP 调用证据以 `execution_results` append-only ledger 为准。

---

## 8. 非目标

- 不接 MCP SDK。
- 不做 SSE streaming。
- 不做 stdio MCP。
- 不读 / join / 写 `mcp_servers`、`mcp_tools`、`tool_invocations`。
- 不改 Workflow / Review / Agent / MCP / Publisher 状态机。
- 不读 `audit_events`。
- 不默认开启真实网络。
- 不做 Publisher 实际发布。
- 不做 UI 改造。

---

## 9. 验证

新增测试：

```text
apps/api/test/unit/mcp-real-runtime.test.ts
apps/api/test/integration/productization-p2-1-mcp-real-runtime-api.test.ts
```

覆盖：

- readiness 默认 blocked，显式 gate 满足后 ready。
- endpoint registry / tool allowlist 解析。
- HTTP JSON-RPC `tools/call` 请求体。
- response snapshot redaction。
- 未 allowlist、高风险、host 未 allowlist 均在网络前阻断。
- `mcp` job 经 worker 写入 `execution_results` / `outbox_events`。
- 不写 `tool_invocations`。

---

## 10. P2.2 进入条件

| 项 | 要求 |
|---|---|
| Publisher 控制面 | `publish_records`、发布目标、审批、预览、回滚策略明确 |
| Publisher runtime | 默认关闭、幂等、失败重试、外部平台错误映射 |
| 凭证边界 | 发布平台 credential ref、secret injection、脱敏快照 |
| 运维 | release readiness、runbook、告警与 rollback flags |
