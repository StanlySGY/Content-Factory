# Sprint-6 Agent Real Runtime MVP — Application Wiring Closed Loop（审计）

> 范围：在 Sprint-5 Phase 2.29 收口后，进入 Sprint-6 第一条真实能力路线。
> 一句话目标：**不再新增 Phase 2.x disabled harness；在显式测试装配中让 `agent:real` 通过应用 API 完成一次 closed-loop invocation，并仍只写 `execution_results` 与 `outbox_events`。**

---

## 1. 阶段定位

| 项目 | 结论 |
|---|---|
| Sprint-5 Phase 2 | 已停止于 Phase 2.29 |
| 本阶段名称 | Sprint-6 Agent Real Runtime MVP |
| 是否新增 Phase 2.30 | 否 |
| 真实能力路线 | Agent Real Runtime MVP |
| 默认生产行为 | 仍 fail-closed |
| 显式测试装配 | 可注入 `AgentRealRuntime(FakeAgentProviderHttpClient)` |

本阶段不是继续做 readiness / disabled harness，而是把已有底层 real runtime skeleton 接到 `buildApp` 的可控依赖注入入口，用 API 级测试证明闭环。

---

## 2. 架构图（文字）

```text
Test-only explicit app wiring
  buildApp(env real_enabled + allowNetwork, {
    runtimeAdapterFactory:
      MockRuntimeAdapterFactory({
        adapterMode: real,
        realAgentRuntime: AgentRealRuntime(FakeAgentProviderHttpClient)
      })
  })

POST /api/execution/jobs
  -> execution_jobs pending

POST /api/execution/jobs/:id/tick
  -> ExecutionWorker.tickJob()
     -> RuntimeRequest
     -> RuntimeAdapterFactory.getRuntime(agent, real)
     -> AgentRealRuntime.execute()
     -> FakeAgentProviderHttpClient.send()
     -> RuntimeResponse success
     -> same transaction:
        - execution_jobs success
        - execution_results append-only insert
        - outbox_events insert execution_job.success

No stage_runs write
No assets/reviews write
No audit_events write
No real secret material read
No external network I/O
```

---

## 3. 实现内容

| 文件 | 变更 |
|---|---|
| `apps/api/src/app.ts` | `BuildOptions` 新增 `runtimeAdapterFactory?: RuntimeAdapterFactory`；未提供时仍使用原 `MockRuntimeAdapterFactory` 默认装配 |
| `apps/api/test/integration/sprint6-agent-real-runtime-mvp-api.test.ts` | 新增 API 级 closed-loop 测试，覆盖 job 创建、manual tick、result ledger、outbox、secret non-persistence、Sprint-4 表不变 |

实现策略：

- 只加应用装配 DI seam。
- 不新增环境变量。
- 不新增 DB migration。
- 不注册生产 real adapter。
- 不改变 runtime safety policy。
- 不改变 execution job 状态机或 retry policy。

---

## 4. 默认 Fail-Closed 边界

| 边界 | 当前结果 |
|---|---|
| 未传 `runtimeAdapterFactory` | 默认行为不变 |
| `EXECUTION_RUNTIME_ADAPTER_MODE=real` 且无 real runtime 注入 | 仍由 disabled fixture / factory gate 阻断 |
| 生产 secret material | 不读取、不注入、不落库 |
| 外部网络 | 测试闭环使用 fake/local HTTP client，不发生外部 I/O |
| MCP / Publisher real adapter | 未启用 |
| Control Plane | 不读写 `stage_runs` / `content_assets` / `review_records` / `audit_events` |

---

## 5. TDD 记录

| 步骤 | 结果 |
|---|---|
| RED | 新增 `sprint6-agent-real-runtime-mvp-api.test.ts`，期望 app 层 `agent:real` tick 成功 |
| RED 失败 | `/tick` 返回 job `status=failed`，证明当前 `buildApp` 未使用注入 real runtime factory |
| GREEN | `BuildOptions` 增加 `runtimeAdapterFactory`，`ExecutionWorker` 装配优先使用注入 factory |
| GREEN 验证 | 定向测试通过：1 file / 1 test |

RED 失败摘要：

```text
expected status success
received status failed
```

---

## 6. 验证范围

定向验证：

```bash
pnpm --dir apps/api exec vitest run test/integration/sprint6-agent-real-runtime-mvp-api.test.ts
```

已覆盖：

| 验证项 | 证据 |
|---|---|
| app wiring 可显式注入 real runtime | 测试经 `buildApp(... runtimeAdapterFactory ...)` 完成 |
| API closed-loop | `POST /jobs` + `POST /jobs/:id/tick` |
| ledger 写入 | `GET /jobs/:id/results` 返回 1 条 success |
| outbox 写入 | `GET /jobs/:id/events` 包含 `execution_job.success` |
| secret 不持久化 | 当前 job 的 DB result/outbox 快照不包含 plain secret 或 credential ref |
| Sprint-4 表不变 | `stage_runs` 行数前后相同 |

---

## 7. 非目标

- 不新增 Phase 2.30。
- 不做生产级真实 LLM 调用。
- 不接生产 secret store。
- 不读取 env/plain secret material。
- 不实现真实 provider credential injection。
- 不新增真实 network transport。
- 不启用 MCP real adapter。
- 不启用 Publisher real adapter。
- 不写 `stage_runs` / `content_assets` / `review_records`。
- 不写 `audit_events`。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不改 append-only / 权限模型。
- 不做 UI。

---

## 8. 后续路线

Sprint-6 后续不应回到 Phase 2.x。建议下一步在以下两条中择一：

| 路线 | 建议顺序 | 说明 |
|---|---:|---|
| Agent Real Runtime Provider Credential MVP | 1 | 在不落库 secret 的前提下实现 transport-boundary credential injection 测试实现 |
| Workflow Stage Writeback MVP | 2 | 首次打开受控 Control Plane 写入，风险更高，需 audit 同事务证明 |

