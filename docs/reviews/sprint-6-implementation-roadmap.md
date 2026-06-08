# Sprint-6 Implementation Roadmap

> Sprint-6 不再以 readiness / disabled harness 为主。
> 目标：从 Sprint-5 Phase 2 的安全准入基础上，选择一条真实能力路线进入最小可验证实现。

---

## 1. 总原则

| 原则 | 要求 |
|---|---|
| 不再继续 Phase 2 harness | Phase 2 停止于 Phase 2.29 |
| 一次只选一条真实路线 | 避免 Real Agent、Writeback、MCP、Publisher 混做 |
| 保持 Control Plane 边界 | 除非路线明确需要，否则不写 workflow/review/asset/audit |
| 真实能力必须可回滚 | feature flag / kill switch 默认关闭 |
| 测试先行 | 新行为、公共 contract、持久化、并发、状态机必须 TDD |
| 每条路线独立提交 | 继续保持小步 commit + push |

---

## 2. 推荐优先级

| 优先级 | 路线 | 推荐判断 |
|---|---|---|
| 1 | Agent Real Runtime MVP | 最低控制面写入风险，优先 |
| 2 | Workflow Stage Writeback MVP | 高一致性风险，第二 |
| 3 | MCP Runtime Safety MVP | 高沙箱/进程风险，第三 |
| 4 | Publisher MVP | 产品线独立，暂缓 |

---

## 3. 路线 A：Agent Real Runtime MVP

### 目标

让 `agent:real` 在显式 feature flag、runtime mode、network allowlist、secret resolver 测试实现均满足时，完成一次最小真实/准真实 provider 调用闭环，并把结果写入 `execution_results` 与 outbox。

### 非目标

- 不修改 `stage_runs`。
- 不自动写回 workflow/review/asset。
- 不引入 MCP tool-calling。
- 不做多轮 agent memory。
- 不接生产 secret store。

### 需要改动的模块

- `apps/api/src/application/runtime/agent-real-runtime.ts`
- `apps/api/src/application/runtime/agent-provider-real-http-client.ts`
- runtime secret resolver / credential resolver 测试实现
- runtime adapter registry / factory 的 `agent:real` enable path
- worker runtime mode gate
- ops readiness / runbook 文档

### 必须新增测试

- real runtime disabled by default
- feature flag false blocks `agent:real`
- network allowlist rejects unknown host
- secret resolver returns material only inside transport boundary
- secret material never persists in snapshots
- timeout / abort still maps to stable runtime error
- successful fake/local real transport writes `execution_results`

### 必须保持的边界

- 不读写 Sprint-4 Control Plane。
- 不落库 secret material。
- 不绕过 runtime safety policy。
- 不把 MCP/Publisher real adapter 一起打开。

### 完成定义

- `agent:real` 默认仍 blocked。
- 显式测试配置下可完成一次 closed-loop invocation。
- ledger/outbox 可观测。
- 全量 API / typecheck / lint 通过。

---

## 4. 路线 B：Workflow Stage Writeback MVP

### 目标

在 writeback ledger、outbox lease、apply guard、transaction port、state transition policy、subject snapshot 和 registration contract 基础上，实现 `workflow_stage_run` 单 subject 的真实幂等回写。

### 非目标

- 不支持 content_assets / review_records 多 subject。
- 不做 UI。
- 不接真实 LLM。
- 不改变 execution job 状态机。

### 需要改动的模块

- writeback relay handler
- execution writeback service / repository
- control-plane transaction port 实现
- stage_run repository adapter
- audit append integration
- ADR-006 state transition invocation

### 必须新增测试

- success result: `running -> waiting_review`
- failed result: `running -> failed`
- non-running subject blocks writeback
- duplicate terminal outbox event is idempotent
- audit append and stage update same transaction
- audit failure rolls back control-plane update
- writeback ledger marks applied exactly once

### 必须保持的边界

- 只支持 `workflow_stage_run`。
- 必须经 ADR-006 状态边。
- control-plane update 与 audit append 必须同事务。
- 不 bypass audit hash chain。

### 完成定义

- 单 subject 真实回写闭环可验证。
- duplicate relay processing 不重复写控制面。
- rollback 测试证明原子性。
- 全量 API / 覆盖率 / typecheck / lint 通过。

---

## 5. 路线 C：MCP Runtime Safety MVP

### 目标

先实现 MCP runtime 的安全执行边界，再考虑真实 transport。重点是 process sandbox、resource limit、cancel propagation 和 high-risk tool confirmation。

### 非目标

- 不直接接生产 MCP server。
- 不允许默认 process spawn。
- 不把 high-risk tool 自动执行。
- 不做 Publisher。

### 需要改动的模块

- `IMCPRuntime` real/sandbox skeleton
- process supervisor / sandbox policy
- resource limit policy
- cancellation propagation
- MCP risk confirmation gate
- ops readiness

### 必须新增测试

- process spawn disabled by default
- sandbox policy required before real MCP
- timeout kills child process
- abort signal cancels MCP invocation
- high-risk tool returns awaiting/blocked confirmation
- stdout/stderr snapshot redaction

### 必须保持的边界

- 不默认开启 process spawn。
- 不执行 high-risk tool without approval。
- 不持久化 secret material。
- 不绕过 MCP server/tool status model。

### 完成定义

- MCP real transport 仍默认 blocked。
- sandbox skeleton 可在测试环境验证 cancel / timeout。
- high-risk confirmation contract 明确。
- 全量 API / typecheck / lint 通过。

---

## 6. 路线 D：Publisher MVP

### 目标

建立 Publisher 产品线的真实发布前置模型：`publish_records`、preview、approval、external credential policy 与 rollback/unpublish strategy。

### 非目标

- 不混入 Agent Real Runtime。
- 不混入 Workflow Stage Writeback。
- 不直接调用外部平台。

### 需要改动的模块

- DB migration: `publish_records`
- publisher runtime service
- publisher credential policy
- preview / approval API
- audit integration

### 必须新增测试

- publish record append-only semantics
- preview before publish
- approval required before external publish
- duplicate publish idempotency
- rollback/unpublish plan exists

### 必须保持的边界

- 未审批不得发布。
- 外部平台 credential 不落库。
- publish history append-only。

### 完成定义

- Publisher MVP 仍可先停在 preview/approval，不真实发布。
- 数据模型和审批语义冻结。
- 全量 API / migration roundtrip / typecheck / lint 通过。

---

## 7. 推荐下一步提示词

建议 Sprint-6 从 **Agent Real Runtime MVP** 开始：

```text
实现 Sprint-6 Agent Real Runtime MVP。

目标：在不写 Sprint-4 Control Plane 的前提下，让 agent:real 在显式测试配置中完成一次 provider HTTP closed-loop，并继续把输出限制在 execution_results/outbox。

边界：默认仍 blocked；不读生产 secret；不写 stage_runs/assets/reviews/audit_events；不启用 MCP/Publisher real adapter。

要求：TDD；新增安全 gate 测试、secret non-persistence 测试、network allowlist 测试、timeout/abort 测试、worker ledger/outbox closed-loop 测试；更新审计文档；全量验证；独立提交并推送。
```

