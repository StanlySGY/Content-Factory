# Sprint-5 Execution Phase 2.22 — Writeback Apply Guard / Real Executor Final Gate（审计）

> 范围：在 Phase 2.21 Writeback Dry-run Executor / Control-plane Adapter Disabled Harness 之后，为未来真实 writeback executor 增加最终 apply guard。
> 一句话目标：**让 execution writeback 在进入真实 executor 前具备最终 fail-closed 闸门，但当前仍不读写控制面、不写 audit、不执行真实回写。**

---

## 1. Phase 2.21 vs Phase 2.22 差异

| 维度 | Phase 2.21 | Phase 2.22 |
|---|---|---|
| Dry-run | 输出每个 transaction step 的 blocked 结果 | 作为 apply guard 输入之一 |
| Guard 层级 | subject guard / transaction plan / dry-run 分散观测 | 新增最终 apply guard 聚合三层缺口 |
| Executor 允许 | 无最终判定 | `realExecutorAllowed=false`，`decision=blocked` |
| Feature flag | 仅在旧 guard missing requirement 中体现 | 明确 `featureFlagEnabled=false` |
| Control-plane write | dry-run 证明未发生 | apply guard 明确 `controlPlaneWriteAllowed=false` |
| API | `POST /writebacks/:id/dry-run` | 新增 `GET /writebacks/:id/apply-guard` |
| Ops readiness | dry-run readiness | 新增 apply guard readiness |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
execution_writebacks(id)
  -> ExecutionWritebackService.getApplyGuard(id)
     -> getGuard(id)
        - writeback ledger snapshot
        - subject support
        - disabled fixture
     -> buildExecutionWritebackTransactionPlanFromGuard(guard)
     -> buildExecutionWritebackDryRun(plan, disabled adapter)
     -> buildExecutionWritebackApplyGuard({ guard, plan, dryRun })
        - mode = disabled_apply_guard
        - decision = blocked
        - realExecutorAllowed = false
        - featureFlagEnabled = false
        - ledgerStatusAllowed = false
        - transactionPlanReady = false
        - dryRunPassed = false
        - auditCouplingReady = false
        - controlPlaneWriteAllowed = false
  -> GET /api/execution/writebacks/:id/apply-guard

ExecutionOpsService.getWritebackApplyGuardReadiness()
  -> static disabled apply guard readiness
  -> GET /api/execution/ops/writeback-apply-guard-readiness

No stage_runs/assets/reviews reads or writes
No audit_events reads or writes
No workflow/review/agent/mcp state transition
No business table joins
No DB migration
```

---

## 3. Domain Contract

新增：`apps/api/src/domain/execution/writeback-apply-guard.ts`

`ExecutionWritebackApplyGuard` 固定语义：

| 字段 | 值 / 说明 |
|---|---|
| `mode` | `disabled_apply_guard` |
| `enabled` | `false` |
| `executable` | `false` |
| `decision` | `blocked` |
| `realExecutorAllowed` | `false` |
| `featureFlagEnabled` | `false` |
| `ledgerStatusAllowed` | `false` |
| `transactionPlanReady` | `false` |
| `dryRunPassed` | `false` |
| `auditCouplingReady` | `false` |
| `controlPlaneWriteAllowed` | `false` |

必要检查固定为：

| Check | 当前结果 |
|---|---|
| `writeback_ledger_status` | blocked |
| `subject_support` | blocked |
| `transaction_plan` | blocked |
| `dry_run` | blocked |
| `audit_coupling` | blocked |
| `feature_flag` | blocked |

validator 会拒绝：

- 非 `disabled_apply_guard` mode
- `enabled=true`
- `executable=true`
- `decision` 非 `blocked`
- `realExecutorAllowed=true`
- `featureFlagEnabled=true`
- `ledgerStatusAllowed=true`
- `transactionPlanReady=true`
- `dryRunPassed=true`
- `auditCouplingReady=true`
- `controlPlaneWriteAllowed=true`
- required checks 缺失或非 blocked

---

## 4. API / DTO

新增端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/writebacks/:id/apply-guard` | 返回某 writeback 的最终 disabled apply guard |
| `GET /api/execution/ops/writeback-apply-guard-readiness` | 查看系统级 apply guard readiness |

DTO 采用 snake_case，关键字段：

- `real_executor_allowed`
- `feature_flag_enabled`
- `ledger_status_allowed`
- `transaction_plan_ready`
- `dry_run_passed`
- `audit_coupling_ready`
- `control_plane_write_allowed`
- `required_checks`

---

## 5. Missing Requirements 聚合

apply guard 聚合以下来源：

| 来源 | 说明 |
|---|---|
| ledger | `writeback ledger status must be planned`，非 planned 时出现 |
| subject | unsupported subject 时出现 `unsupported subject_type: ...` |
| subject guard | Phase 2.19 的 feature flag / state machine / audit 缺口 |
| transaction plan | Phase 2.20 的 transaction / audit / state machine 缺口 |
| dry-run | Phase 2.21 的 executor / adapter / side-effect 缺口 |
| final gate | `writeback apply feature flag is disabled`、`real writeback executor is not registered`、`control-plane write is disabled` |

即使 ledger status 是 `planned` 且 subject 支持，当前仍 fail-closed；本阶段不允许任何真实 executor 进入。

---

## 6. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改 |
| `stage_runs` / assets / reviews | 不读、不写、不 join；测试验证 ops readiness 不改变 `stage_runs` |
| audit hash chain | 不读、不写、不替代 |
| execution_writebacks | apply guard API 只读 |
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
| `execution-writeback-apply-guard.test.ts` | domain apply guard builder/validator；required checks；unsupported subject 与非 planned ledger；非法 enabled/executable/allowed 拒绝 |
| `execution-writeback-apply-guard-api.test.ts` | `GET /writebacks/:id/apply-guard` 返回 disabled final gate；ops readiness 只读且不写 `stage_runs` / `execution_writebacks` |

TDD 记录：

1. 先新增 domain/API 测试。
2. RED：缺少 `writeback-apply-guard` module；apply guard 与 ops readiness 端点返回 404。
3. GREEN：补 domain、service、mapper、shared DTO 与 route。
4. 定向验证通过：

```bash
pnpm --dir apps/api typecheck
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-apply-guard.test.ts \
  test/integration/execution-writeback-apply-guard-api.test.ts
```

结果：typecheck 通过；5 tests / 2 files 通过。

完整验证矩阵见最终交付报告。

---

## 8. 非目标

- 不真实回写 `stage_runs`。
- 不真实读取 `stage_runs`。
- 不真实创建或修改 `content_assets` / `asset_versions`。
- 不真实创建 `review_records`。
- 不旁路 ADR-006 状态机。
- 不写 audit hash chain。
- 不把 apply guard 变成 executable。
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 9. Phase 2.23 建议

下一步建议进入 **Single Subject Real Writeback Disabled Transaction Prototype**：

1. 定义 `workflow_stage_run` 单 subject 的真实回写 executor prototype，但继续 disabled。
2. 引入 control-plane transaction port interface，不连接真实 repository。
3. prototype 仅生成事务输入/输出 shape 与 rollback/error contract，不读取或写入控制面。
4. 明确真实执行时必须由 apply guard 放行，当前 apply guard 永远 blocked。
5. 为后续真正读写 `stage_runs` + audit 同事务的 spike 准备最终接口。
