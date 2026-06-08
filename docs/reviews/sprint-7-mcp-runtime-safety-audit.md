# Sprint-7 MCP Runtime Safety MVP（审计）

> 范围：在 Sprint-6 Agent Real Runtime 收束后，为 `mcp` execution job 建立真实 MCP transport 前的安全执行边界。
> 一句话目标：**让 MCP runtime 具备 sandbox / cancel / timeout / high-risk confirmation / snapshot redaction contract，但当前仍只使用 fake/local harness，不连接生产 MCP server。**

---

## 1. 阶段定位

| 项目 | 结论 |
|---|---|
| Sprint | Sprint-7 |
| 路线 | MCP Runtime Safety MVP |
| 是否新增 Phase 2.x | 否 |
| 真实 MCP server | 未连接 |
| 真实 process spawn | 未执行 |
| DB migration | 无 |
| Sprint-4 Control Plane 写入 | 未打开 |

---

## 2. 架构图（文字）

```text
ExecutionWorker
  -> RuntimeAdapterFactory(adapterMode=real, mcpSafetyRuntime explicitly injected)
  -> MCPSafetyRuntime
     -> validate RuntimeRequest
     -> assert real_enabled + allowRealExecution
     -> require allowProcessSpawn=true
     -> require payload.sandbox
     -> high-risk tool gate
        - blocked
        - awaitingConfirmation=true
        - processSpawned=false
     -> FakeLocalMcpHarness
        - no real MCP server
        - no network
        - no actual child process spawn
        - fake stdout/stderr
     -> redact stdout/stderr snapshot
  -> RuntimeResponse
  -> execution_results / outbox_events

No mcp_servers/tool_invocations mutation
No stage_runs/assets/reviews/audit_events write
```

---

## 3. 实现内容

| 文件 | 变更 |
|---|---|
| `apps/api/src/application/runtime/mcp-safety-runtime.ts` | 新增 `MCPSafetyRuntime`、`FakeLocalMcpHarness`、sandbox policy、timeout/abort/high-risk/redaction contract |
| `apps/api/src/application/runtime/adapter-factory.ts` | 支持显式注入 `mcpSafetyRuntime`；默认未注入仍 blocked |
| `apps/api/src/application/runtime/adapter-registry.ts` | MCP real descriptor 标记 Sprint-7 safety capabilities，但默认 `blocked` |
| `apps/api/test/unit/mcp-safety-runtime.test.ts` | 覆盖 process spawn disabled、sandbox required、safe fake/local success、高风险 blocked、timeout/abort |
| `apps/api/test/integration/sprint7-mcp-runtime-safety-worker.test.ts` | 覆盖 worker -> execution_results/outbox 闭环，且不写 MCP control-plane invocation |
| `apps/api/test/unit/runtime-adapter-registry.test.ts` | 覆盖默认 MCP real descriptor blocked until explicit harness |

---

## 4. Safety Contract

| Contract | 行为 |
|---|---|
| process spawn disabled by default | `allowProcessSpawn=false` 时返回 `permission_denied`，不执行 harness |
| sandbox required | 缺失 `payload.sandbox` 或未显式允许 process spawn 时返回 `permission_denied` |
| high-risk tool confirmation | `riskLevel=high` 或 toolName 命中 delete/write/publish/deploy/shell/exec，返回 `blocked` + `awaitingConfirmation=true` |
| timeout | fake delay 超过 timeout 映射为 `timeout` / retryable |
| abort | abort signal 已取消映射为 `timeout` / retryable，metadata 标记 `cancelled=true` |
| stdout/stderr redaction | stdout/stderr 进入 metadata snapshots 前调用 `redactRuntimeSnapshot` |
| no external side effects | fake/local harness 不连接 server、不发网络、不启动真实进程 |

---

## 5. Worker 闭环

```text
execution_jobs(type=mcp, status=pending)
  -> claim running
  -> MCPSafetyRuntime(fake/local)
  -> RuntimeResponse(success/failed)
  -> execution_results append-only
  -> outbox_events execution_job.success/failed/retry
```

验证点：

| 表 | 行为 |
|---|---|
| `execution_jobs` | 仅执行层状态流转 |
| `execution_results` | 只追加 response snapshot |
| `outbox_events` | 写 execution event |
| `tool_invocations` | 不新增 |
| `mcp_servers` / `mcp_tools` | 不读、不写 |
| `stage_runs` / `content_assets` / `review_records` / `audit_events` | 不写 |

---

## 6. TDD 记录

| 步骤 | 结果 |
|---|---|
| RED 1 | `mcp-safety-runtime.test.ts` 引用不存在模块失败 |
| RED 2 | worker integration 引用不存在 runtime/factory 注入失败 |
| GREEN 1 | 新增 `MCPSafetyRuntime` 与 `FakeLocalMcpHarness` |
| GREEN 2 | 扩展 adapter factory 显式注入 MCP safety runtime |
| GREEN 3 | registry 默认 MCP real descriptor 保持 blocked，并声明 safety capabilities |
| 相关回归 | 17 passed / 4 files |

---

## 7. 非目标

- 不新增 Phase 2.x。
- 不连接真实 MCP server。
- 不启动真实 child process。
- 不执行 high-risk tool。
- 不读取或落库 secret material。
- 不新增 DB migration。
- 不写 `mcp_servers` / `mcp_tools` / `tool_invocations`。
- 不写 `stage_runs` / `content_assets` / `review_records` / `audit_events`。
- 不修改 Sprint-4 Control Plane 状态机。
- 不做 UI。

---

## 8. 下一步

| Sprint | 建议 |
|---|---|
| Sprint-8 | Publisher Runtime MVP：preview / approval / credential boundary / no real external publish |
| Sprint-9 | Workflow Stage Writeback MVP：首次打开控制面写入，必须单独审计 |
| Sprint-10 | Production Readiness：runbook、告警、权限、回滚、生产开关 |
