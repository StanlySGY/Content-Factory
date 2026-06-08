# Sprint-5 Execution Phase 2.27 — Writeback Executor Preflight Matrix Disabled Harness（审计）

> 范围：在 Phase 2.26 Writeback Subject Snapshot Readiness Disabled Harness 之后，聚合真实 writeback executor 进入前的所有 readiness gates。
> 一句话目标：**让真实 writeback executor 的最终准入条件形成单一、可审查、只读的 blocked matrix；当前仍完全 disabled，不读取/写入控制面，不注册真实 executor。**

---

## 1. Phase 2.26 vs Phase 2.27 差异

| 维度 | Phase 2.26 | Phase 2.27 |
|---|---|---|
| 核心对象 | Subject snapshot readiness | Executor preflight matrix |
| 关注点 | `workflow_stage_run` snapshot shape | 真实 executor 前最终 gate 聚合 |
| 输入 | snapshot reader contract | guard / plan / dry-run / apply guard / prototype / port / policy / snapshot |
| 输出 | disabled snapshot readiness | disabled executor preflight matrix |
| Executor | 不注册 | 仍不注册，显式 `realExecutorRegistered=false` |
| Control-plane read/write | 禁用 | 禁用 |
| Audit write | 禁用 | 禁用 |
| API | subject snapshot readiness | executor preflight matrix |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
GET /api/execution/ops/writeback-executor-preflight-matrix
  -> ExecutionOpsService.getWritebackExecutorPreflightMatrix()
     -> buildExecutionWritebackExecutorPreflightMatrix()
        -> aggregate disabled gates:
           - writeback_guard
           - transaction_plan
           - dry_run
           - apply_guard
           - transaction_prototype
           - transaction_port
           - state_transition_policy
           - subject_snapshot
        -> output:
           - mode = disabled_executor_preflight_matrix
           - ready = false
           - executable = false
           - realExecutorRegistered = false
           - controlPlaneReadAllowed = false
           - controlPlaneWriteAllowed = false
           - auditWriteAllowed = false
           - subjectType = workflow_stage_run

No stage_runs read
No stage_runs write
No execution_writebacks write
No execution_results write
No outbox_events write
No audit_events read/write
No business table joins
No DB migration
```

---

## 3. Preflight Matrix Contract

新增：`apps/api/src/domain/execution/writeback-executor-preflight-matrix.ts`

Matrix 关键字段：

| 字段 | 当前值 |
|---|---|
| `mode` | `disabled_executor_preflight_matrix` |
| `ready` | `false` |
| `executable` | `false` |
| `realExecutorRegistered` | `false` |
| `controlPlaneReadAllowed` | `false` |
| `controlPlaneWriteAllowed` | `false` |
| `auditWriteAllowed` | `false` |
| `subjectType` | `workflow_stage_run` |

Gate 列表：

| gate | 当前状态 | 说明 |
|---|---|---|
| `writeback_guard` | blocked | 单 subject guard 仍是 disabled fixture |
| `transaction_plan` | blocked | 事务计划已冻结但不可执行 |
| `dry_run` | blocked | dry-run 只输出 blocked steps |
| `apply_guard` | blocked | 最终 apply guard 禁止真实 executor |
| `transaction_prototype` | blocked | 真实事务原型不可执行 |
| `transaction_port` | blocked | control-plane transaction port 未注册 |
| `state_transition_policy` | blocked | ADR-006 状态边 policy 只读 disabled |
| `subject_snapshot` | blocked | snapshot reader 未注册，不读 `stage_runs` |

全局缺口固定包含：

- `real writeback executor is not registered`
- `control-plane read is disabled`
- `control-plane write is disabled`
- `audit write is disabled`

---

## 4. API / DTO

新增端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/ops/writeback-executor-preflight-matrix` | 查看真实 writeback executor 前的最终 blocked matrix |

DTO 采用 snake_case，关键字段：

- `real_executor_registered`
- `control_plane_read_allowed`
- `control_plane_write_allowed`
- `audit_write_allowed`
- `subject_type`
- `gates`
- `missing_requirements`
- `next_phase_requirements`

---

## 5. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改 |
| `stage_runs` / assets / reviews | 不读、不写、不 join；测试验证 ops readiness 不改变 `stage_runs` |
| audit hash chain | 不读、不写、不替代 |
| `execution_writebacks` | 本阶段不新增写入；测试验证不改变行数 |
| `execution_results` / `outbox_events` | 本阶段不新增写入 |
| DB migration | 无 |
| Redis / MQ | 未引入 |
| 外部网络 / provider | 未调用 |
| 真实 writeback executor | 未注册、不可执行 |

---

## 6. 测试与验证

新增测试：

| 测试 | 覆盖点 |
|---|---|
| `execution-writeback-executor-preflight-matrix.test.ts` | 聚合 8 个 gate；所有 gate blocked；validator 拒绝 executable 或 gate 缺失 |
| `execution-writeback-executor-preflight-matrix-api.test.ts` | ops readiness 返回 disabled matrix；不写 `stage_runs` / `execution_writebacks` |

TDD 记录：

1. 先新增 unit/API 测试。
2. RED：缺少 `writeback-executor-preflight-matrix` module；ops readiness 端点返回 404。
3. GREEN：补 disabled matrix domain、ops service、mapper、shared DTO 与 route。
4. 定向验证通过：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-executor-preflight-matrix.test.ts \
  test/integration/execution-writeback-executor-preflight-matrix-api.test.ts
```

结果：3 tests / 2 files 通过。

完整验证矩阵见最终交付报告。

---

## 7. 非目标

- 不注册真实 writeback executor。
- 不执行真实 writeback。
- 不读取 `stage_runs`。
- 不写入 `stage_runs` / assets / reviews。
- 不写 audit hash chain。
- 不消费或替代 audit。
- 不把 transaction port 变成 executable。
- 不把 subject snapshot reader 变成 executable。
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 8. Phase 2.28 建议

下一步建议进入 **Writeback Executor Feature Flag Disabled Harness**：

1. 为真实 writeback executor 定义独立 feature flag / readiness contract。
2. 明确 `real_executor_flag_enabled=false` 与 `executor_registration_allowed=false` 的 fail-closed 语义。
3. 将 Phase 2.27 的 matrix 与 feature flag gate 对齐，但仍不读写控制面、不注册真实 executor。
