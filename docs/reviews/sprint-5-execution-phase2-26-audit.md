# Sprint-5 Execution Phase 2.26 — Writeback Subject Snapshot Readiness Disabled Harness（审计）

> 范围：在 Phase 2.25 Writeback State Transition Policy Disabled Harness 之后，为未来 `workflow_stage_run` 真实回写定义 subject snapshot contract。
> 一句话目标：**让真实 writeback 的 `load_subject` 前置具备可审查的 snapshot shape、required fields 与 redaction 约束；当前仍完全 disabled，不读取 `stage_runs`，不构建 live snapshot。**

---

## 1. Phase 2.25 vs Phase 2.26 差异

| 维度 | Phase 2.25 | Phase 2.26 |
|---|---|---|
| 核心对象 | State transition policy | Subject snapshot readiness |
| 关注点 | ADR-006 状态边映射 | `workflow_stage_run` snapshot shape |
| Future port method | `validate_state_transition` | `load_subject` |
| DB 读取 | 不读取 `stage_runs` | 不读取 `stage_runs` |
| 输出 | blocked evaluation samples | null sample + field contract |
| Redaction | 不涉及 snapshot shape | 明确 `gate_result` metadata redaction |
| API | state transition policy readiness | subject snapshot readiness |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
GET /api/execution/ops/writeback-subject-snapshot-readiness
  -> ExecutionOpsService.getWritebackSubjectSnapshotReadiness()
     -> buildExecutionWritebackSubjectSnapshotReadiness()
        -> disabled readiness:
           - mode = disabled_subject_snapshot_readiness
           - enabled = false
           - executable = false
           - subjectType = workflow_stage_run
           - snapshotReaderRegistered = false
           - canReadSubject = false
           - canBuildSnapshot = false
           - canPersistSnapshot = false
           - redactionRequired = true
           - sampleSnapshotBuilt = false
        -> snapshot shape:
           - sourceTable = stage_runs
           - required fields fixed
           - sample values are null placeholders
           - dbReadPerformed = false
           - controlPlaneWritePerformed = false

No stage_runs read
No stage_runs write
No execution_writebacks write
No audit_events read/write
No business table joins
No DB migration
```

---

## 3. Snapshot Contract

新增：`apps/api/src/domain/execution/writeback-subject-snapshot.ts`

Readiness 关键字段：

| 字段 | 当前值 |
|---|---|
| `mode` | `disabled_subject_snapshot_readiness` |
| `enabled` | `false` |
| `executable` | `false` |
| `subjectType` | `workflow_stage_run` |
| `snapshotReaderRegistered` | `false` |
| `canReadSubject` | `false` |
| `canBuildSnapshot` | `false` |
| `canPersistSnapshot` | `false` |
| `redactionRequired` | `true` |
| `sampleSnapshotBuilt` | `false` |

Required fields：

| 字段 | 类型 | required | nullable | redacted |
|---|---|---:|---:|---:|
| `id` | `uuid` | true | false | false |
| `workflow_run_id` | `uuid` | true | false | false |
| `workflow_stage_id` | `uuid` | true | false | false |
| `status` | `stage_run_status` | true | false | false |
| `attempt_count` | `integer` | true | false | false |
| `gate_result` | `json` | false | true | true |
| `updated_at` | `datetime` | true | false | false |

Sample contract：

| 字段 | 值 |
|---|---|
| `sample.*` | 全部为 `null` placeholder |
| `dbReadPerformed` | `false` |
| `controlPlaneWritePerformed` | `false` |
| `redactionApplied` | `true` |
| `redactionPolicy` | `metadata_only_no_secret_material` |

---

## 4. API / DTO

新增端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/ops/writeback-subject-snapshot-readiness` | 查看 disabled subject snapshot readiness |

DTO 采用 snake_case，关键字段：

- `snapshot_reader_registered`
- `can_read_subject`
- `can_build_snapshot`
- `can_persist_snapshot`
- `redaction_required`
- `sample_snapshot_built`
- `required_fields`
- `snapshot_shape`

---

## 5. Missing Requirements

| 缺口 | 说明 |
|---|---|
| `subject snapshot reader is disabled` | 当前 reader 不可执行 |
| `subject snapshot reader is not registered` | 当前未注册真实 subject reader |
| `control-plane subject read is disabled` | 不允许读取 `stage_runs` |
| `subject snapshot build is disabled` | 不允许从 live row 构建 snapshot |
| `subject snapshot persistence is disabled` | 不允许持久化 live subject snapshot |

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
| `execution-writeback-subject-snapshot.test.ts` | disabled readiness；required fields；snapshot shape；validator 拒绝 executable/read-enabled；null sample 不来自 DB |
| `execution-writeback-subject-snapshot-api.test.ts` | ops readiness 返回 disabled snapshot contract；不写 `stage_runs` / `execution_writebacks` |

TDD 记录：

1. 先新增 unit/API 测试。
2. RED：缺少 `writeback-subject-snapshot` module；ops readiness 端点返回 404。
3. GREEN：补 disabled snapshot readiness、ops service、mapper、shared DTO 与 route。
4. 定向验证通过：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-subject-snapshot.test.ts \
  test/integration/execution-writeback-subject-snapshot-api.test.ts
```

结果：3 tests / 2 files 通过。

完整验证矩阵见最终交付报告。

---

## 8. 非目标

- 不真实读取 `stage_runs`。
- 不真实回写 `stage_runs`。
- 不构建 live subject snapshot。
- 不持久化 live subject snapshot。
- 不修改 ADR-006 状态机。
- 不真实创建或修改 `content_assets` / `asset_versions`。
- 不真实创建 `review_records`。
- 不写 audit hash chain。
- 不把 subject snapshot reader 变成 executable。
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 9. Phase 2.27 建议

下一步建议进入 **Writeback Executor Preflight Matrix Disabled Harness**：

1. 聚合 guard、transaction plan、dry-run、apply guard、transaction port、state transition policy、subject snapshot readiness。
2. 输出单一 executor preflight matrix，明确每个 gate 的 blocked reason。
3. 当前仍不读取 `stage_runs`，不写控制面，仅作为进入真实 writeback spike 前的最终 readiness 总表。
