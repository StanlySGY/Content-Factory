# Sprint-5 Execution Phase 2.24 — Control-plane Transaction Port Disabled Harness（审计）

> 范围：在 Phase 2.23 Single Subject Real Writeback Disabled Transaction Prototype 之后，为未来真实 writeback executor 定义 control-plane transaction port contract。
> 一句话目标：**让真实回写所需的控制面事务端口、能力快照和 blocked 方法语义可审查，但当前仍完全 disabled，不连接 repository，不读写控制面、不写 audit。**

---

## 1. Phase 2.23 vs Phase 2.24 差异

| 维度 | Phase 2.23 | Phase 2.24 |
|---|---|---|
| Executor prototype | 定义 input/output/rollback/error contract | 新增未来 executor 依赖的 transaction port |
| Control-plane access | 仅字段声明不允许 | 新增 disabled port capability snapshot |
| 方法契约 | 事务步骤在 prototype 中描述 | 明确定义 5 个 port methods |
| 执行状态 | `executable=false` | 所有 method 返回 `blocked` / `executed=false` |
| DB 依赖 | 无 | 无；port 不持有 DB |
| API | transaction prototype readiness | 新增 transaction port readiness |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
ExecutionOpsService.getWritebackTransactionPortReadiness()
  -> buildExecutionWritebackTransactionPortReadiness()
     -> disabled capabilities:
        - kind = disabled_control_plane_transaction_port
        - registered = false
        - canReadSubject = false
        - canValidateStateTransition = false
        - canUpdateSubject = false
        - canAppendAudit = false
        - canMarkApplied = false
     -> methods:
        - load_subject -> blocked
        - validate_state_transition -> blocked
        - update_subject -> blocked
        - append_audit_event -> blocked
        - mark_writeback_applied -> blocked
  -> GET /api/execution/ops/writeback-transaction-port-readiness

No Db injected into the disabled port
No stage_runs/assets/reviews reads or writes
No audit_events reads or writes
No execution_writebacks writes
No business table joins
No DB migration
```

---

## 3. Port Contract

新增：`apps/api/src/application/writeback/control-plane-transaction-port.ts`

`ControlPlaneWritebackTransactionPort` 方法：

| Method | 未来真实语义 | 当前 disabled 输出 |
|---|---|---|
| `loadSubject` | 在事务内读取 `workflow_stage_run` snapshot | `blocked` |
| `validateStateTransition` | 校验 ADR-006 状态边 | `blocked` |
| `updateSubject` | 更新控制面 subject 状态 | `blocked` |
| `appendAuditEvent` | 同事务追加 audit event | `blocked` |
| `markWritebackApplied` | 事务提交后标记 writeback applied | `blocked` |

当前每个方法返回：

| 字段 | 值 |
|---|---|
| `status` | `blocked` |
| `executed` | `false` |
| `controlPlaneReadPerformed` | `false` |
| `controlPlaneWritePerformed` | `false` |
| `auditWritePerformed` | `false` |

能力快照：

| 字段 | 值 |
|---|---|
| `kind` | `disabled_control_plane_transaction_port` |
| `registered` | `false` |
| `canReadSubject` | `false` |
| `canValidateStateTransition` | `false` |
| `canUpdateSubject` | `false` |
| `canAppendAudit` | `false` |
| `canMarkApplied` | `false` |

---

## 4. API / DTO

新增端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/ops/writeback-transaction-port-readiness` | 查看系统级 disabled transaction port readiness |

DTO 采用 snake_case，关键字段：

- `transaction_port_registered`
- `control_plane_read_allowed`
- `control_plane_write_allowed`
- `audit_write_allowed`
- `capabilities`
- `methods`

---

## 5. Missing Requirements

| 缺口 | 说明 |
|---|---|
| `control-plane transaction port is disabled` | 当前没有真实 port 注册 |
| `control-plane read is disabled` | 不允许读取 `stage_runs` |
| `control-plane write is disabled` | 不允许写控制面 |
| `audit write is disabled` | 不允许写 audit hash chain |
| `state machine adapter is disabled` | ADR-006 校验尚未接入 |
| `writeback applied marker is disabled` | 当前不更新 writeback applied 状态 |

---

## 6. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改 |
| `stage_runs` / assets / reviews | 不读、不写、不 join；测试验证 ops readiness 不改变 `stage_runs` |
| audit hash chain | 不读、不写、不替代 |
| execution_writebacks | 本阶段不新增写入；ops readiness 测试验证不改变行数 |
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
| `execution-writeback-transaction-port.test.ts` | disabled capabilities；5 个方法均 blocked；readiness validator 拒绝 executable/registered |
| `execution-writeback-transaction-port-api.test.ts` | ops readiness 返回 disabled port；不写 `stage_runs` / `execution_writebacks` |

TDD 记录：

1. 先新增 unit/API 测试。
2. RED：缺少 `control-plane-transaction-port` module；ops readiness 端点返回 404。
3. GREEN：补 disabled port、ops service、mapper、shared DTO 与 route。
4. 定向验证通过：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-transaction-port.test.ts \
  test/integration/execution-writeback-transaction-port-api.test.ts
```

结果：4 tests / 2 files 通过。

完整验证矩阵见最终交付报告。

---

## 8. 非目标

- 不真实回写 `stage_runs`。
- 不真实读取 `stage_runs`。
- 不真实创建或修改 `content_assets` / `asset_versions`。
- 不真实创建 `review_records`。
- 不旁路 ADR-006 状态机。
- 不写 audit hash chain。
- 不把 transaction port 变成 executable。
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 9. Phase 2.25 建议

下一步建议进入 **Writeback State Transition Policy Disabled Harness**：

1. 为 `workflow_stage_run` 回写定义 ADR-006 状态边校验 contract。
2. 当前仅提供 disabled policy，不读取 `stage_runs`。
3. 明确 success/failed writeback 分别映射到哪些目标状态，但不执行状态变化。
4. 将 policy readiness 暴露到 ops，供 transaction port 的 `validate_state_transition` 后续接入。
