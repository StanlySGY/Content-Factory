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

### 当前进度

| 项目 | 状态 |
|---|---|
| Sprint-6 Agent Real Runtime MVP 应用级闭环 | 已完成 |
| Sprint-6 Agent Real Runtime Provider Credential MVP | 已完成 |
| Sprint-6 Agent Real Runtime Production Transport Gate | 已完成 |
| Sprint-6 Agent Real Runtime Provider Response Contract Hardening | 已完成 |
| 默认 `agent:real` fail-closed | 保持 |
| 显式测试装配 closed-loop | 已完成 |
| transport-boundary credential injection | 已验证 |
| production transport gate metadata | 已验证 |
| provider response envelope / retry 分类 | 已验证 |
| 输出限制在 `execution_results` / `outbox` | 已验证 |
| Sprint-4 Control Plane 写入 | 未打开 |
| 审计文档 | `docs/reviews/sprint-6-agent-real-runtime-mvp-audit.md`；`docs/reviews/sprint-6-agent-real-runtime-credential-audit.md`；`docs/reviews/sprint-6-agent-real-runtime-production-transport-gate-audit.md`；`docs/reviews/sprint-6-agent-real-runtime-provider-response-contract-audit.md` |

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
- production transport gate blocks missing resolver/allowlist/readiness before transport
- production transport gate metadata persists without secret material
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

### 当前进度

| 项目 | 状态 |
|---|---|
| Sprint-9 Workflow Stage Writeback MVP | 已完成 |
| `workflow_stage_run` 单 subject 回写 | 已验证 |
| success result: `running -> waiting_review` | 已验证 |
| failed result: `running -> failed` | 已验证 |
| 非 running subject 跳过 | 已验证 |
| duplicate terminal event 幂等 | 已验证 |
| audit append 失败回滚 stage update | 已验证 |
| 默认 relay 自动回写控制面 | 未打开 |
| 审计文档 | `docs/reviews/sprint-9-workflow-stage-writeback-audit.md` |

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

### 当前进度

| 项目 | 状态 |
|---|---|
| Sprint-7 MCP Runtime Safety MVP | 已完成 |
| MCP real transport 默认 blocked | 保持 |
| fake/local harness | 已完成 |
| process spawn disabled by default | 已验证 |
| sandbox policy required | 已验证 |
| timeout / abort contract | 已验证 |
| high-risk confirmation contract | 已验证 |
| stdout/stderr snapshot redaction | 已验证 |
| 输出限制在 `execution_results` / `outbox` | 已验证 |
| MCP Control Plane 写入 | 未打开 |
| 审计文档 | `docs/reviews/sprint-7-mcp-runtime-safety-audit.md` |

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

### 当前进度

| 项目 | 状态 |
|---|---|
| Sprint-8 Publisher Runtime Safety MVP | 已完成 |
| fake/local publisher harness | 已完成 |
| preview required before publish | 已验证 |
| approval required before publish | 已验证 |
| credentialRef 仅引用、不落 secret material | 已验证 |
| idempotent publisher request id | 已验证 |
| rollback/unpublish plan snapshot only | 已验证 |
| 默认 `publisher:real` blocked | 保持 |
| 输出限制在 `execution_results` / `outbox` | 已验证 |
| Sprint-4 Control Plane 写入 | 未打开 |
| 审计文档 | `docs/reviews/sprint-8-publisher-runtime-safety-audit.md` |

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

## 7. 项目停止线

| Sprint | 状态 | 说明 |
|---|---|---|
| Sprint-6 Agent Real Runtime MVP | 已完成 | Agent real runtime safety / transport / provider contract |
| Sprint-7 MCP Runtime Safety MVP | 已完成 | MCP sandbox / timeout / high-risk confirmation |
| Sprint-8 Publisher Runtime Safety MVP | 已完成 | Publisher preview / approval / rollback plan snapshot |
| Sprint-9 Workflow Stage Writeback MVP | 已完成 | `workflow_stage_run` 单 subject 真实回写闭环 |
| Sprint-10 Production Readiness | 下一步且最后一步 | 全量审计、验证、runbook、风险清单、功能冻结 |

停止规则：

- 不再新增 Phase 2.x。
- 不再新增 Sprint-11 或新功能路线，除非项目 owner 明确扩 scope。
- Sprint-10 后只允许 bugfix、测试修复、文档补齐和安全修正。

---

## 8. 推荐下一步提示词

Sprint-6 Agent Real Runtime 已完成 MVP、Credential Boundary、Production Transport Gate 与 Provider Response Contract Hardening。
Sprint-7 MCP Runtime Safety MVP 已完成 fake/local harness、sandbox、timeout/cancel、high-risk confirmation 与 snapshot redaction。
Sprint-8 Publisher Runtime Safety MVP 已完成 fake/local harness、preview、approval gate、credential boundary、idempotent request id 与 rollback plan snapshot。
Sprint-9 Workflow Stage Writeback MVP 已完成 `workflow_stage_run` 单 subject 真实回写闭环。

不再继续新增 Phase 2.x；下一步进入最终收尾 **Sprint-10 Production Readiness / Final Audit / Delivery Freeze**：

```text
实现 Sprint-10 Production Readiness / Final Audit / Delivery Freeze。

目标：对 Sprint-5 至 Sprint-9 的 execution layer、runtime safety、outbox relay、writeback ledger、workflow_stage_run 回写闭环做最终生产就绪审计，并冻结功能范围。

边界：
- 不新增功能。
- 不新增 Phase 2.x。
- 不新增 Sprint-11。
- 不打开默认真实 runtime / 默认 writeback relay handler。
- 不修改 Sprint-4 Control Plane 业务状态机。
- 不引入 Redis / MQ / 外部平台调用。

要求：
1. 汇总 Sprint-5 Phase 1 到 Sprint-9 的当前能力矩阵。
2. 审计所有 execution plane 默认开关，确认 fail-closed。
3. 审计 DB migration、grant、append-only、RLS、audit hash chain 边界。
4. 审计 runtime adapter registry：agent/mcp/publisher real 默认 blocked，测试 harness 显式注入。
5. 审计 outbox relay 与 workflow writeback handler：默认不自动回写，显式 handler 具备事务/幂等测试。
6. 更新最终 runbook：如何启动 worker/relay、如何手动 process outbox、如何 recover stale jobs、如何手动 retry failed job。
7. 新增 docs/reviews/sprint-10-production-readiness-audit.md。
8. 更新 docs/reviews/sprint-6-implementation-roadmap.md，标记 Sprint-10 完成后功能冻结。
9. 运行全量质量门禁：
   - pnpm --dir apps/api exec vitest run
   - pnpm --dir packages/shared exec vitest run
   - pnpm --dir apps/web exec vitest run
   - pnpm -r typecheck
   - pnpm lint
   - git diff --check
10. 若发现阻断级问题，只做 bugfix / test fix / doc fix，不新增功能。
11. 独立 commit 并 push origin main。

输出：
- Sprint-10 commit hash
- origin/main hash
- 验证命令和结果
- 完整任务剩余项表格；若无功能剩余，明确写“功能路线已冻结，只剩后续产品化扩 scope”
- 未提交/未跟踪无关文件列表
- 明确声明没有 force push、没有提交无关 sprint-2 文档、未 amend / squash 既有提交
```
