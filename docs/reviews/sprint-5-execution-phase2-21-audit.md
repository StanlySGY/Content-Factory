# Sprint-5 Execution Phase 2.21 — Writeback Dry-run Executor / Control-plane Adapter Disabled Harness（审计）

> 范围：在 Phase 2.20 Writeback Transaction Plan / Audit Coupling Readiness 之后，为未来真实 `workflow_stage_run` 回写增加禁用态 dry-run harness。
> 一句话目标：**让 execution writeback 能模拟未来事务步骤并暴露 blocked 缺口，但当前仍不读写控制面、不写 audit、不执行真实回写。**

---

## 1. Phase 2.20 vs Phase 2.21 差异

| 维度 | Phase 2.20 | Phase 2.21 |
|---|---|---|
| Transaction plan | 定义 required steps，全部 disabled/unexecuted | 复用 plan，生成每步 blocked dry-run 结果 |
| Control-plane adapter | 仅作为 missing requirement | 新增 disabled adapter capability snapshot |
| Dry-run executor | 无 | 新增 `ExecutionWritebackDryRun` disabled harness |
| Side effect 证明 | plan 层 `controlPlaneWritePlanned=false` | dry-run 层记录 read/write/audit 均未发生 |
| API | `GET /writebacks/:id/transaction-plan` | 新增 `POST /writebacks/:id/dry-run` |
| Ops readiness | transaction/audit coupling readiness | 新增 writeback dry-run readiness |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
execution_writebacks(id)
  -> ExecutionWritebackService.dryRun(id)
     -> getTransactionPlan(id)
        -> getGuard(id)
        -> getWriteback(id)
     -> buildDisabledControlPlaneWritebackAdapter()
        - registered = false
        - canReadControlPlane = false
        - canWriteControlPlane = false
        - canWriteAudit = false
     -> buildExecutionWritebackDryRun(plan, adapter)
        - mode = disabled_dry_run
        - enabled = false
        - executable = false
        - controlPlaneReadPerformed = false
        - controlPlaneWritePerformed = false
        - auditWritePerformed = false
        - every step status = blocked
  -> POST /api/execution/writebacks/:id/dry-run

ExecutionOpsService.getWritebackDryRunReadiness()
  -> static disabled dry-run readiness
  -> GET /api/execution/ops/writeback-dry-run-readiness

No stage_runs/assets/reviews reads or writes
No audit_events reads or writes
No workflow/review/agent/mcp state transition
No business table joins
No DB migration
```

---

## 3. Domain Contract

新增：`apps/api/src/domain/execution/writeback-dry-run.ts`

`ExecutionWritebackDryRun` 固定语义：

| 字段 | 值 / 说明 |
|---|---|
| `mode` | `disabled_dry_run` |
| `enabled` | `false` |
| `executable` | `false` |
| `controlPlaneAdapterRegistered` | `false` |
| `auditAdapterRegistered` | `false` |
| `controlPlaneReadPerformed` | `false` |
| `controlPlaneWritePerformed` | `false` |
| `auditWritePerformed` | `false` |
| `steps[].status` | `blocked` |
| `steps[].executed` | `false` |

disabled adapter snapshot：

| 字段 | 值 |
|---|---|
| `kind` | `disabled_control_plane_adapter` |
| `registered` | `false` |
| `canReadControlPlane` | `false` |
| `canWriteControlPlane` | `false` |
| `canWriteAudit` | `false` |

validator 会拒绝：

- 非 `disabled_dry_run` mode
- `enabled=true`
- `executable=true`
- adapter registered
- 任意 control-plane read/write performed
- 任意 audit write performed
- 步骤缺失、不为 blocked、或 `executed=true`

---

## 4. API / DTO

新增端点：

| 端点 | 说明 |
|---|---|
| `POST /api/execution/writebacks/:id/dry-run` | 返回某 writeback 的 disabled dry-run 步骤结果 |
| `GET /api/execution/ops/writeback-dry-run-readiness` | 查看系统级 dry-run executor / adapter readiness |

DTO 采用 snake_case，关键字段：

- `control_plane_adapter_registered`
- `audit_adapter_registered`
- `control_plane_read_performed`
- `control_plane_write_performed`
- `audit_write_performed`
- `steps[].status`
- `steps[].missing_requirements`

---

## 5. Dry-run 步骤输出

| Step | 当前输出 |
|---|---|
| `load_control_plane_subject` | `blocked`，缺 `control-plane adapter is disabled` |
| `validate_state_transition` | `blocked`，缺 `control-plane adapter is disabled` |
| `update_control_plane_subject` | `blocked`，缺 `control-plane adapter is disabled` |
| `append_audit_event` | `blocked`，缺 `audit adapter is disabled` |
| `mark_writeback_applied` | `blocked`，缺 `control-plane adapter is disabled` |

所有步骤额外携带 `writeback dry-run executor is disabled`，用于避免把 dry-run 误解为可执行模拟器。

---

## 6. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改 |
| `stage_runs` / assets / reviews | 不读、不写、不 join；测试验证 ops readiness 不改变 `stage_runs` |
| audit hash chain | 不读、不写、不替代 |
| execution_writebacks | dry-run API 只读 |
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
| `execution-writeback-dry-run.test.ts` | domain dry-run builder/validator；全步骤 blocked；非法 side effect 拒绝 |
| `execution-writeback-dry-run-api.test.ts` | `POST /writebacks/:id/dry-run` 返回 disabled dry-run；ops readiness 只读且不写 `stage_runs` / `execution_writebacks` |

TDD 记录：

1. 先新增 domain/API 测试。
2. RED：缺少 `writeback-dry-run` module；dry-run 与 ops readiness 端点返回 404。
3. GREEN：补 domain、disabled adapter、service、mapper、shared DTO 与 route。
4. 定向验证通过：

```bash
pnpm --dir apps/api typecheck
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-dry-run.test.ts \
  test/integration/execution-writeback-dry-run-api.test.ts
```

结果：typecheck 通过；4 tests / 2 files 通过。

完整验证矩阵见最终交付报告。

---

## 8. 非目标

- 不真实回写 `stage_runs`。
- 不真实读取 `stage_runs`。
- 不真实创建或修改 `content_assets` / `asset_versions`。
- 不真实创建 `review_records`。
- 不旁路 ADR-006 状态机。
- 不写 audit hash chain。
- 不把 dry-run 变成 executable。
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 9. Phase 2.22 建议

下一步建议进入 **Writeback Apply Guard / Real Executor Final Gate**：

1. 定义真实 executor 前的最终 apply guard contract，继续 disabled。
2. guard 必须同时检查 writeback ledger 状态、transaction plan、dry-run blocked 状态、audit coupling 与 feature flag。
3. 明确真实 executor 的允许条件和拒绝原因，但仍不读取/写入控制面。
4. ops readiness 聚合 guard / plan / dry-run 三层缺口。
5. 为 Phase 2 后续单 subject 真实回写 spike 留出可审查的最终闸门。
