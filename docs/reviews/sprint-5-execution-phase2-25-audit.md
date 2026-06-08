# Sprint-5 Execution Phase 2.25 — Writeback State Transition Policy Disabled Harness（审计）

> 范围：在 Phase 2.24 Control-plane Transaction Port Disabled Harness 之后，为未来 `workflow_stage_run` 真实回写定义 ADR-006 状态边校验 contract。
> 一句话目标：**让 execution writeback 在进入真实控制面写入前，先具备可审查的状态转换策略契约；当前仍完全 disabled，不读取 `stage_runs`，不执行状态变化。**

---

## 1. Phase 2.24 vs Phase 2.25 差异

| 维度 | Phase 2.24 | Phase 2.25 |
|---|---|---|
| 核心对象 | Control-plane transaction port | State transition policy |
| 关注点 | 未来真实事务方法与 capability | ADR-006 状态边校验 contract |
| Subject | 仅作为 port input | 固定 `workflow_stage_run` |
| 状态映射 | port 只声明 `validate_state_transition` 方法 | 明确 runtime terminal status → stage-run target status |
| 执行状态 | 所有 port method blocked | policy/evaluation blocked |
| DB 依赖 | 无 | 无；不读取 `stage_runs` |
| API | transaction port readiness | state transition policy readiness |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
GET /api/execution/ops/writeback-state-transition-policy-readiness
  -> ExecutionOpsService.getWritebackStateTransitionPolicyReadiness()
     -> buildExecutionWritebackStateTransitionPolicyReadiness()
        -> disabled policy snapshot:
           - mode = disabled_state_transition_policy
           - enabled = false
           - executable = false
           - subjectType = workflow_stage_run
           - policyRegistered = false
           - canReadSubject = false
           - canValidateTransition = false
           - canApplyTransition = false
        -> sample evaluations:
           - runtime success + current running -> target waiting_review, blocked
           - runtime failed + current running -> target failed, blocked

No stage_runs read
No stage_runs write
No execution_writebacks write
No audit_events read/write
No business table joins
No DB migration
```

---

## 3. ADR-006 状态边映射

现有 `workflow_stage_run` 状态机定义在 `apps/api/src/domain/stage-run/status.ts`：

| From | To |
|---|---|
| `pending` | `running`, `skipped` |
| `running` | `waiting_review`, `failed` |
| `waiting_review` | `approved` |
| `failed` | `running` |
| `approved` | 无 |
| `skipped` | 无 |

Phase 2.23 prototype 曾使用 `target_status_on_success="completed"` 作为未来 executor 的粗粒度占位。但 `stage_runs.status` 当前并不包含 `completed`，因此 Phase 2.25 对 `workflow_stage_run` policy 做了 ADR-006 纠偏：

| Runtime terminal status | Expected current status | ADR-006 target status |
|---|---|---|
| `success` | `running` | `waiting_review` |
| `failed` | `running` | `failed` |

`completed` 仍可作为上层 workflow/content task 语义，但不得写入 `stage_runs.status`。

---

## 4. Policy Contract

新增：`apps/api/src/domain/execution/writeback-state-transition-policy.ts`

Readiness 关键字段：

| 字段 | 当前值 |
|---|---|
| `mode` | `disabled_state_transition_policy` |
| `enabled` | `false` |
| `executable` | `false` |
| `subjectType` | `workflow_stage_run` |
| `policyRegistered` | `false` |
| `canReadSubject` | `false` |
| `canValidateTransition` | `false` |
| `canApplyTransition` | `false` |
| `expectedCurrentStatus` | `running` |
| `successTargetStatus` | `waiting_review` |
| `failedTargetStatus` | `failed` |

`evaluateWritebackStateTransition(input)` 行为：

| 输入场景 | 输出 |
|---|---|
| `workflow_stage_run` + `running` + `success` | `targetStatus=waiting_review`，但 `status=blocked` |
| `workflow_stage_run` + `running` + `failed` | `targetStatus=failed`，但 `status=blocked` |
| unsupported subject | `targetStatus=null`，`subjectSupported=false`，`blocked` |
| missing/invalid current status | `targetStatus=null`，`blocked` |

所有 evaluation 均保证：

| 字段 | 值 |
|---|---|
| `transitionAllowed` | `false` |
| `policyEnabled` | `false` |
| `dbReadPerformed` | `false` |
| `controlPlaneWritePerformed` | `false` |

---

## 5. API / DTO

新增端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/ops/writeback-state-transition-policy-readiness` | 查看 disabled state transition policy readiness |

DTO 采用 snake_case，关键字段：

- `policy_registered`
- `can_read_subject`
- `can_validate_transition`
- `can_apply_transition`
- `expected_current_status`
- `success_target_status`
- `failed_target_status`
- `sample_evaluations`

---

## 6. Missing Requirements

| 缺口 | 说明 |
|---|---|
| `state transition policy is disabled` | 当前 policy 不可执行 |
| `state transition policy is not registered` | 当前未注册真实策略 |
| `control-plane subject read is disabled` | 不允许读取 `stage_runs` |
| `control-plane subject write is disabled` | 不允许写 `stage_runs` |
| `ADR-006 state machine adapter is disabled` | 尚未连接真实状态机校验执行路径 |

---

## 7. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改；只读取现有状态枚举作为类型约束 |
| `stage_runs` / assets / reviews | 不读、不写、不 join；测试验证 ops readiness 不改变 `stage_runs` |
| audit hash chain | 不读、不写、不替代 |
| execution_writebacks | 本阶段不新增写入；ops readiness 测试验证不改变行数 |
| execution_results / outbox_events | 本阶段不新增写入 |
| DB migration | 无 |
| Redis / MQ | 未引入 |
| 外部网络 / provider | 未调用 |
| 真实回写 | 仍禁用 |

---

## 8. 测试与验证

新增测试：

| 测试 | 覆盖点 |
|---|---|
| `execution-writeback-state-transition-policy.test.ts` | disabled readiness；ADR-006 success/failed target；validator 拒绝 executable 和非法 `completed` target；unsupported/missing status blocked |
| `execution-writeback-state-transition-policy-api.test.ts` | ops readiness 返回 disabled policy；不写 `stage_runs` / `execution_writebacks` |

TDD 记录：

1. 先新增 unit/API 测试。
2. RED：缺少 `writeback-state-transition-policy` module；ops readiness 端点返回 404。
3. GREEN：补 disabled policy、ops service、mapper、shared DTO 与 route。
4. 定向验证通过：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-state-transition-policy.test.ts \
  test/integration/execution-writeback-state-transition-policy-api.test.ts
```

结果：4 tests / 2 files 通过。

完整验证矩阵见最终交付报告。

---

## 9. 非目标

- 不真实回写 `stage_runs`。
- 不真实读取 `stage_runs`。
- 不把 `completed` 写入 `stage_runs.status`。
- 不修改 ADR-006 状态机。
- 不真实创建或修改 `content_assets` / `asset_versions`。
- 不真实创建 `review_records`。
- 不写 audit hash chain。
- 不把 state transition policy 变成 executable。
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 10. Phase 2.26 建议

下一步建议进入 **Writeback Subject Snapshot Readiness Disabled Harness**：

1. 为未来真实回写定义 `workflow_stage_run` subject snapshot contract。
2. 当前仍不读取 `stage_runs`，仅定义 snapshot shape、required fields、redaction 与 missing requirements。
3. 将 snapshot readiness 接入 ops，供 transaction port 的 `load_subject` 后续接入。
