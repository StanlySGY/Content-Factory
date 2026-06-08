# Sprint-5 Execution Phase 2.23 — Single Subject Real Writeback Disabled Transaction Prototype（审计）

> 范围：在 Phase 2.22 Writeback Apply Guard / Real Executor Final Gate 之后，为 `workflow_stage_run` 单 subject 定义未来真实 writeback executor 的事务原型。
> 一句话目标：**让真实回写 executor 的输入、输出、回滚与错误契约可审查，但当前仍完全 disabled，不读写控制面、不写 audit、不执行真实回写。**

---

## 1. Phase 2.22 vs Phase 2.23 差异

| 维度 | Phase 2.22 | Phase 2.23 |
|---|---|---|
| 最终闸门 | apply guard 聚合缺口并 blocked | prototype 必须依赖 apply guard |
| 事务形状 | 仅 transaction plan / dry-run | 新增真实 executor 的 input/output/rollback/error contract |
| Subject | guard 支持 `workflow_stage_run` | 单 subject prototype 固定 `workflow_stage_run` 事务语义 |
| 执行状态 | `realExecutorAllowed=false` | `executable=false`，`applyGuardDecision=blocked` |
| Control-plane side effect | 明确不允许写 | 明确 read/write/audit 全不允许且未发生 |
| API | `GET /writebacks/:id/apply-guard` | 新增 `GET /writebacks/:id/transaction-prototype` |
| Ops readiness | apply guard readiness | 新增 transaction prototype readiness |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
execution_writebacks(id)
  -> ExecutionWritebackService.getTransactionPrototype(id)
     -> getApplyGuard(id)
        -> getGuard(id)
        -> build transaction plan
        -> build disabled dry-run
        -> build disabled apply guard
     -> buildExecutionWritebackTransactionPrototype({ applyGuard })
        - mode = disabled_transaction_prototype
        - executable = false
        - applyGuardRequired = true
        - applyGuardDecision = blocked
        - controlPlaneReadAllowed = false
        - controlPlaneWriteAllowed = false
        - auditWriteAllowed = false
        - transactionRequired = true
        - rollbackRequired = true
        - rollbackPlanReady = true
        - errorContractReady = true
        - subjectSnapshotRequired = true
  -> GET /api/execution/writebacks/:id/transaction-prototype

ExecutionOpsService.getWritebackTransactionPrototypeReadiness()
  -> static disabled transaction prototype readiness
  -> GET /api/execution/ops/writeback-transaction-prototype-readiness

No stage_runs/assets/reviews reads or writes
No audit_events reads or writes
No workflow/review/agent/mcp state transition
No business table joins
No DB migration
```

---

## 3. Domain Contract

新增：`apps/api/src/domain/execution/writeback-transaction-prototype.ts`

`ExecutionWritebackTransactionPrototype` 固定语义：

| 字段 | 值 / 说明 |
|---|---|
| `mode` | `disabled_transaction_prototype` |
| `subjectType` | 当前目标 subject 为 `workflow_stage_run` |
| `executable` | `false` |
| `applyGuardRequired` | `true` |
| `applyGuardDecision` | `blocked` |
| `controlPlaneReadAllowed` | `false` |
| `controlPlaneWriteAllowed` | `false` |
| `auditWriteAllowed` | `false` |
| `transactionRequired` | `true` |
| `rollbackRequired` | `true` |
| `rollbackPlanReady` | `true` |
| `errorContractReady` | `true` |
| `subjectSnapshotRequired` | `true` |

事务输入 shape：

| 字段 | 当前语义 |
|---|---|
| `subject_type` | `workflow_stage_run` |
| `subject_id` | writeback ledger 中的 subject id |
| `subject_snapshot_required` | 真实执行前必须读取 subject snapshot |
| `expected_current_status` | `running` |
| `target_status_on_success` | `completed` |
| `target_status_on_failure` | `failed` |
| `audit_event_type` | `execution.writeback.applied` |
| `idempotency_key_required` | `true` |

输出 shape 当前固定 blocked：

| 字段 | 值 |
|---|---|
| `status` | `blocked` |
| `applied` | `false` |
| `control_plane_read_performed` | `false` |
| `control_plane_write_performed` | `false` |
| `audit_write_performed` | `false` |
| `rollback_performed` | `false` |

rollback/error contract：

| 契约 | 语义 |
|---|---|
| rollback strategy | `transaction_rollback` |
| compensating action | 当前不允许；真实写入必须依赖事务回滚 |
| error type | `writeback_apply_blocked` |
| retryable | `false` |
| applied 标记 | 只能在控制面写入和 audit append 事务提交后执行 |

---

## 4. API / DTO

新增端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/writebacks/:id/transaction-prototype` | 返回某 writeback 的 disabled transaction prototype |
| `GET /api/execution/ops/writeback-transaction-prototype-readiness` | 查看系统级 transaction prototype readiness |

DTO 采用 snake_case，关键字段：

- `apply_guard_required`
- `apply_guard_decision`
- `control_plane_read_allowed`
- `control_plane_write_allowed`
- `audit_write_allowed`
- `rollback_plan_ready`
- `error_contract_ready`
- `input`
- `output`
- `rollback`
- `error_contract`

---

## 5. Missing Requirements 聚合

prototype 聚合以下缺口：

| 来源 | 说明 |
|---|---|
| apply guard | 当前 `decision=blocked`，所以 prototype 不可执行 |
| executor | `real transaction executor is not registered` |
| control-plane read | `control-plane read is disabled` |
| control-plane write | `control-plane write is disabled` |
| audit write | `audit write is disabled` |
| subject support | 非 `workflow_stage_run` subject 会带 `unsupported subject_type: ...` |

即使 writeback ledger 是 `planned` 且 subject 支持，当前仍 fail-closed；本阶段不允许任何真实事务 executor 进入。

---

## 6. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改 |
| `stage_runs` / assets / reviews | 不读、不写、不 join；测试验证 ops readiness 不改变 `stage_runs` |
| audit hash chain | 不读、不写、不替代 |
| execution_writebacks | prototype API 只读 |
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
| `execution-writeback-transaction-prototype.test.ts` | domain prototype builder/validator；input/output/rollback/error contract；unsupported subject；非法 side effect 拒绝 |
| `execution-writeback-transaction-prototype-api.test.ts` | `GET /writebacks/:id/transaction-prototype` 返回 disabled prototype；ops readiness 只读且不写 `stage_runs` / `execution_writebacks` |

TDD 记录：

1. 先新增 domain/API 测试。
2. RED：缺少 `writeback-transaction-prototype` module；prototype 与 ops readiness 端点返回 404。
3. GREEN：补 domain、service、mapper、shared DTO 与 route。
4. 定向验证通过：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-transaction-prototype.test.ts \
  test/integration/execution-writeback-transaction-prototype-api.test.ts
```

结果：5 tests / 2 files 通过。

完整验证矩阵见最终交付报告。

---

## 8. 非目标

- 不真实回写 `stage_runs`。
- 不真实读取 `stage_runs`。
- 不真实创建或修改 `content_assets` / `asset_versions`。
- 不真实创建 `review_records`。
- 不旁路 ADR-006 状态机。
- 不写 audit hash chain。
- 不把 transaction prototype 变成 executable。
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 9. Phase 2.24 建议

下一步建议进入 **Control-plane Transaction Port Disabled Harness**：

1. 定义真实 writeback executor 将来需要的 `IControlPlaneWritebackTransactionPort`。
2. 提供 disabled harness，只返回 blocked capability snapshot，不连接真实 repository。
3. 明确 read subject / validate state transition / update subject / append audit / mark applied 的方法签名与错误语义。
4. prototype 仍只使用 disabled port readiness，不读写 `stage_runs` / audit。
5. 为后续 relay 真实回写 spike 的事务边界和测试替身做准备。
