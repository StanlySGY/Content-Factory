# Sprint-5 Execution Phase 2.19 — Single Subject Writeback Guard / Disabled Fixture（审计）

> 范围：在 Phase 2.18 Writeback Ledger / Idempotent Consumer Readiness 之后，为真实 control-plane writeback 前增加单 subject guard contract。
> 一句话目标：**让 execution writeback 具备真实控制面回写前的单 subject 守门契约，但当前仍完全 disabled/no-op。**

---

## 1. Phase 2.18 vs Phase 2.19 差异

| 维度 | Phase 2.18 | Phase 2.19 |
|---|---|---|
| Writeback ledger | `execution_writebacks` 持久化 disabled no-op plan | 不改 ledger schema |
| 幂等 | `idempotency_key UNIQUE`，重复 event handler 只生成一条 row | 复用 ledger row 作为 guard 输入 |
| Guard | 无独立 guard contract | 新增 `ExecutionWritebackGuard` disabled fixture |
| Subject | ledger 记录任意 `subject_type` 快照 | guard 仅声明 `workflow_stage_run` 为首个支持 subject |
| API | writeback ledger 只读查询 | 新增 writeback guard 与 ops readiness 只读端点 |
| 控制面 | 不回写 | 仍不回写 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、runtime adapter 默认关闭边界、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
execution_writebacks(id)
  -> ExecutionWritebackService.getGuard(id)
     -> getWriteback(id)
     -> buildExecutionWritebackGuard(row snapshot)
        - mode = disabled_fixture
        - enabled = false
        - sideEffectAllowed = false
        - supportedSubject = subject_type == workflow_stage_run
        - decision = blocked
        - missingRequirements:
            writeback feature flag is disabled
            control-plane state machine adapter is not implemented
            audit write plan is not connected
  -> GET /api/execution/writebacks/:id/guard

ExecutionOpsService.getWritebackGuardReadiness()
  -> static disabled fixture readiness
  -> GET /api/execution/ops/writeback-guard-readiness

No stage_runs/assets/reviews writes
No workflow/review/agent/mcp state transition
No audit event write
No business table joins
No DB migration
```

---

## 3. Domain Contract

新增：`apps/api/src/domain/execution/writeback-guard.ts`

`ExecutionWritebackGuard` 固定语义：

| 字段 | 值 / 说明 |
|---|---|
| `mode` | `disabled_fixture` |
| `enabled` | `false` |
| `sideEffectAllowed` | `false` |
| `decision` | `blocked` |
| `supportedSubject` | 仅 `subjectType === workflow_stage_run` 为 true |
| `missingRequirements` | 当前阻止真实回写的明确条件 |
| `nextPhaseRequirements` | 下一阶段真实回写前置条件 |

支持 subject：

```text
workflow_stage_run
```

不支持 subject 不抛错；guard 返回 `supportedSubject=false` 与 `unsupported subject_type: ...`，用于观测和后续准入判断。validator 仍会拒绝非法 mode、启用态或 side effect。

---

## 4. API / DTO

新增只读端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/writebacks/:id/guard` | 查询某 writeback ledger 的真实回写前 guard |
| `GET /api/execution/ops/writeback-guard-readiness` | 查看系统级 writeback guard readiness |

DTO 采用 snake_case：

- `side_effect_allowed`
- `supported_subject`
- `missing_requirements`
- `next_phase_requirements`
- `supported_subject_types`
- `real_writeback_registered`
- `control_plane_write_enabled`
- `audit_write_enabled`

---

## 5. 为什么仍然 disabled

真实回写仍被以下条件阻止：

| 缺口 | 原因 |
|---|---|
| feature flag 未启用 | 防止误写控制面 |
| control-plane state machine adapter 未实现 | 必须经 ADR-006 状态机，不允许直接改表 |
| audit write plan 未连接 | 真实回写必须与 audit 同事务 |
| subject 范围仅声明首个支持类型 | 先限定 `workflow_stage_run`，避免一次性扩大到 assets/reviews |

---

## 6. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改 |
| `stage_runs` / assets / reviews | 不读、不写、不 join；测试验证 ops readiness 不改变 `stage_runs` |
| audit hash chain | 不读、不写、不替代 |
| execution_writebacks | guard API 只读 |
| execution_results / outbox_events | 本阶段不新增读写 |
| DB migration | 无 |
| Redis / MQ | 未引入 |
| 外部网络 / provider | 未调用 |
| 真实回写 | 仍禁用 |

---

## 7. 测试与验证

新增测试：

| 测试 | 覆盖点 |
|---|---|
| `execution-writeback-guard.test.ts` | domain guard builder/validator；`workflow_stage_run` 支持；unsupported subject blocked；非法启用态拒绝 |
| `execution-writeback-guard-api.test.ts` | `GET /writebacks/:id/guard` 返回 disabled fixture；ops readiness 只读且不写 `stage_runs` / `execution_writebacks` |

定向验证已执行：

```bash
pnpm --dir apps/api typecheck
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-guard.test.ts \
  test/integration/execution-writeback-guard-api.test.ts
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
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 9. Phase 2.20 建议

下一步建议进入 **Writeback Transaction Plan / Audit Coupling Readiness**：

1. 定义真实 `workflow_stage_run` writeback 的事务计划 contract，但仍 disabled。
2. 明确需要同事务执行的步骤：读取 stage run、校验 ADR-006 状态边、更新 stage run、写 audit event、更新 writeback ledger。
3. 只生成 plan，不执行任何控制面写入。
4. ops readiness 展示 audit coupling / transaction coupling 的缺口。
5. 为后续真实 writeback spike 准备可审查的事务边界。
