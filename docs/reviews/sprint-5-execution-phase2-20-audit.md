# Sprint-5 Execution Phase 2.20 — Writeback Transaction Plan / Audit Coupling Readiness（审计）

> 范围：在 Phase 2.19 Single Subject Writeback Guard / Disabled Fixture 之后，为未来 `workflow_stage_run` 真实回写定义事务与 audit coupling 计划。
> 一句话目标：**让 execution writeback 具备可审查的事务计划与 audit 同事务要求，但当前仍完全 disabled，不读写控制面。**

---

## 1. Phase 2.19 vs Phase 2.20 差异

| 维度 | Phase 2.19 | Phase 2.20 |
|---|---|---|
| Guard | `ExecutionWritebackGuard` 判断 writeback 是否可进入真实回写前检查 | 复用 guard 作为 transaction plan 输入 |
| Subject | 仅声明 `workflow_stage_run` 为首个支持 subject | 继续只支持 `workflow_stage_run` |
| 事务计划 | 无独立计划结构 | 新增 `ExecutionWritebackTransactionPlan` disabled plan |
| Audit coupling | 仅作为 missing requirement 文本 | 明确 `audit_coupling_required=true` 与 `append_audit_event` 必要步骤 |
| 控制面写入 | 禁用 | 仍禁用，`control_plane_write_planned=false` |
| API | writeback guard 与 ops guard readiness | 新增 transaction plan 与 ops readiness 只读端点 |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
execution_writebacks(id)
  -> ExecutionWritebackService.getTransactionPlan(id)
     -> getGuard(id)
        -> getWriteback(id)
        -> buildExecutionWritebackGuard(row snapshot)
     -> buildExecutionWritebackTransactionPlanFromGuard(guard)
        - mode = disabled_plan
        - enabled = false
        - executable = false
        - transactionRequired = true
        - auditCouplingRequired = true
        - controlPlaneWritePlanned = false
        - supportedSubject = guard.supportedSubject
        - decision = guard.decision
        - steps = required but disabled/unexecuted
  -> GET /api/execution/writebacks/:id/transaction-plan

ExecutionOpsService.getWritebackTransactionPlanReadiness()
  -> static disabled plan readiness
  -> GET /api/execution/ops/writeback-transaction-plan-readiness

No stage_runs/assets/reviews reads or writes
No audit_events reads or writes
No workflow/review/agent/mcp state transition
No business table joins
No DB migration
```

---

## 3. Domain Contract

新增：`apps/api/src/domain/execution/writeback-transaction-plan.ts`

`ExecutionWritebackTransactionPlan` 固定语义：

| 字段 | 值 / 说明 |
|---|---|
| `mode` | `disabled_plan` |
| `enabled` | `false` |
| `executable` | `false` |
| `transactionRequired` | `true` |
| `auditCouplingRequired` | `true` |
| `controlPlaneWritePlanned` | `false` |
| `supportedSubject` | 由 guard 决定，当前仅 `workflow_stage_run` 为 true |
| `decision` | 由 guard 透传，当前为 `blocked` |

必要事务步骤固定为：

| 顺序 | Step | 当前状态 | 真实回写含义 |
|---:|---|---|---|
| 1 | `load_control_plane_subject` | disabled / unexecuted | 在事务内读取 `workflow_stage_run` |
| 2 | `validate_state_transition` | disabled / unexecuted | 经 ADR-006 状态机校验允许边 |
| 3 | `update_control_plane_subject` | disabled / unexecuted | 更新控制面 subject |
| 4 | `append_audit_event` | disabled / unexecuted | 同事务追加 audit event |
| 5 | `mark_writeback_applied` | disabled / unexecuted | 控制面写入成功后标记 writeback ledger |

validator 会拒绝：

- 非 `disabled_plan` mode
- `enabled=true`
- `executable=true`
- 缺失 transaction / audit coupling 要求
- `controlPlaneWritePlanned=true`
- 不完整步骤列表

---

## 4. API / DTO

新增只读端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/writebacks/:id/transaction-plan` | 查询某 writeback ledger 对应的 disabled transaction plan |
| `GET /api/execution/ops/writeback-transaction-plan-readiness` | 查看系统级 transaction / audit coupling readiness |

DTO 采用 snake_case，关键字段：

- `transaction_required`
- `audit_coupling_required`
- `control_plane_write_planned`
- `real_transaction_executor_registered`
- `required_steps`
- `missing_requirements`
- `next_phase_requirements`

---

## 5. 为什么仍然 disabled

真实回写仍被以下条件阻止：

| 缺口 | 原因 |
|---|---|
| transaction executor 未实现 | 当前没有执行计划步骤的服务 |
| audit coupling 未连接 | 真实控制面写入必须与 audit 同事务，当前不写 audit |
| control-plane state machine adapter 未实现 | 必须经 ADR-006 状态机，不允许直接改表 |
| writeback applied 标记未接真实事务 | 只有控制面写入成功后才能标记 applied |

本阶段只定义计划和观测，不执行任何计划步骤。

---

## 6. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改 |
| `stage_runs` / assets / reviews | 不读、不写、不 join；测试验证 ops readiness 不改变 `stage_runs` |
| audit hash chain | 不读、不写、不替代 |
| execution_writebacks | transaction plan API 只读 |
| execution_results / outbox_events | 本阶段不新增写入 |
| DB migration | 无 |
| Redis / MQ | 未引入 |
| 外部网络 / provider | 未调用 |
| 真实回写 | 仍禁用 |

---

## 7. 测试与验证

新增测试：

| 测试 | 覆盖点 |
|---|---|
| `execution-writeback-transaction-plan.test.ts` | domain plan builder/validator；必要步骤；unsupported subject blocked；非法 executable / partial plan 拒绝 |
| `execution-writeback-transaction-plan-api.test.ts` | `GET /writebacks/:id/transaction-plan` 返回 disabled plan；ops readiness 只读且不写 `stage_runs` / `execution_writebacks` |

TDD 记录：

1. 先新增 domain/API 测试。
2. RED：缺少 domain module 与 API route 时失败，缺失端点返回 404。
3. GREEN：补 domain、service、mapper、shared DTO 与 route。
4. 定向验证通过：

```bash
pnpm --dir apps/api typecheck
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-transaction-plan.test.ts \
  test/integration/execution-writeback-transaction-plan-api.test.ts
```

结果：typecheck 通过；5 tests / 2 files 通过。

完整验证矩阵见最终交付报告。

---

## 8. 非目标

- 不真实回写 `stage_runs`。
- 不真实创建或修改 `content_assets` / `asset_versions`。
- 不真实创建 `review_records`。
- 不旁路 ADR-006 状态机。
- 不写 audit hash chain。
- 不把 transaction plan 变成 executable。
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 9. Phase 2.21 建议

下一步建议进入 **Writeback Dry-run Executor / Control-plane Adapter Disabled Harness**：

1. 定义 disabled dry-run executor，只模拟事务步骤结果，不读写控制面。
2. 引入 control-plane adapter port，但默认 disabled fixture，不连接真实 `stage_runs`。
3. dry-run 输出每个步骤的 blocked / missing requirement 结果。
4. ops readiness 展示 executor、adapter、audit coupling 三类缺口。
5. 保持 `control_plane_write_planned=false`，为后续真实回写 executor 做最后一次禁用态演练。
