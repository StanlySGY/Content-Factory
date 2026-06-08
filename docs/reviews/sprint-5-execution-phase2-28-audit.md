# Sprint-5 Execution Phase 2.28 — Writeback Executor Feature Flag Disabled Harness（审计）

> 范围：在 Phase 2.27 Writeback Executor Preflight Matrix Disabled Harness 之后，为未来真实 writeback executor 定义独立 feature flag/readiness contract。
> 一句话目标：**让真实 writeback executor 的启用入口具备显式、可观测、可逆的 feature flag gate；当前仍完全 disabled，即使配置为 true 也不会注册或执行真实 executor。**

---

## 1. Phase 2.27 vs Phase 2.28 差异

| 维度 | Phase 2.27 | Phase 2.28 |
|---|---|---|
| 核心对象 | Executor preflight matrix | Executor feature flag readiness |
| 关注点 | 聚合所有 readiness gates | 显式启用开关与注册准入 |
| 新增 env | 无 | `EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false` |
| Matrix gate | 8 个 gate | 9 个 gate，新增 `executor_feature_flag` |
| Executor 注册 | 不注册 | 仍不注册 |
| 配置为 true | 不涉及 | `configuredEnabled=true` 仍 `effectiveEnabled=false` |
| Control-plane read/write | 禁用 | 禁用 |
| Audit write | 禁用 | 禁用 |
| API | executor preflight matrix | feature flag readiness + matrix 更新 |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
GET /api/execution/ops/writeback-executor-feature-flag-readiness
  -> ExecutionOpsService.getWritebackExecutorFeatureFlagReadiness()
     -> buildExecutionWritebackExecutorFeatureFlagReadiness({
          configuredEnabled: env.EXECUTION_WRITEBACK_EXECUTOR_ENABLED
        })
        -> output:
           - mode = disabled_writeback_executor_feature_flag
           - featureFlagName = EXECUTION_WRITEBACK_EXECUTOR_ENABLED
           - configuredEnabled = env flag value
           - effectiveEnabled = false
           - executorRegistrationAllowed = false
           - realExecutorRegistered = false
           - realExecutorExecutable = false
           - controlPlaneReadAllowed = false
           - controlPlaneWriteAllowed = false
           - auditWriteAllowed = false
           - preflightMatrixRequired = true
           - preflightMatrixReady = false

GET /api/execution/ops/writeback-executor-preflight-matrix
  -> includes executor_feature_flag gate

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

## 3. Feature Flag Contract

新增：`apps/api/src/domain/execution/writeback-executor-feature-flag.ts`

Readiness 关键字段：

| 字段 | 当前值 |
|---|---|
| `mode` | `disabled_writeback_executor_feature_flag` |
| `featureFlagName` | `EXECUTION_WRITEBACK_EXECUTOR_ENABLED` |
| `configuredEnabled` | env 输入值，默认 `false` |
| `effectiveEnabled` | `false` |
| `executorRegistrationAllowed` | `false` |
| `realExecutorRegistered` | `false` |
| `realExecutorExecutable` | `false` |
| `controlPlaneReadAllowed` | `false` |
| `controlPlaneWriteAllowed` | `false` |
| `auditWriteAllowed` | `false` |
| `subjectType` | `workflow_stage_run` |
| `preflightMatrixRequired` | `true` |
| `preflightMatrixReady` | `false` |

关键语义：

| 场景 | 结果 |
|---|---|
| env 未配置或 false | `configuredEnabled=false`、`effectiveEnabled=false` |
| env 配置 true | `configuredEnabled=true`、`effectiveEnabled=false` |
| 任意配置 | `executorRegistrationAllowed=false`、`realExecutorExecutable=false` |

因此 Phase 2.28 只是准入契约，不是 enablement。

---

## 4. Matrix 对齐

Phase 2.28 将 `executor_feature_flag` 加入 Phase 2.27 preflight matrix：

| gate | 当前状态 | 说明 |
|---|---|---|
| `executor_feature_flag` | blocked | 真实 executor feature flag gate 仍 disabled harness |

全局缺口新增/强化：

- `writeback executor feature flag is disabled`
- `writeback executor preflight matrix is not ready`
- `real writeback executor is not registered`
- `control-plane write is disabled`

---

## 5. API / DTO

新增端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/ops/writeback-executor-feature-flag-readiness` | 查看真实 writeback executor feature flag/readiness |

DTO 采用 snake_case，关键字段：

- `feature_flag_name`
- `configured_enabled`
- `effective_enabled`
- `executor_registration_allowed`
- `real_executor_registered`
- `real_executor_executable`
- `control_plane_read_allowed`
- `control_plane_write_allowed`
- `audit_write_allowed`
- `preflight_matrix_required`
- `preflight_matrix_ready`

---

## 6. 边界遵守

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
| env secret material | 不读取 |

---

## 7. 测试与验证

新增/更新测试：

| 测试 | 覆盖点 |
|---|---|
| `execution-writeback-executor-feature-flag.test.ts` | 默认 false；configured true 仍 fail-closed；validator 拒绝 enabled/executable/side-effecting readiness |
| `execution-writeback-executor-feature-flag-api.test.ts` | ops readiness 返回 disabled flag contract；不写 `stage_runs` / `execution_writebacks` |
| `execution-writeback-executor-preflight-matrix.test.ts` | matrix 包含 `executor_feature_flag` |
| `execution-writeback-executor-preflight-matrix-api.test.ts` | API matrix 返回 9 个 gate |

TDD 记录：

1. 先新增 feature flag unit/API 测试，并更新 matrix gate 预期。
2. RED：缺少 `writeback-executor-feature-flag` module；ops readiness 端点返回 404；matrix 缺少 `executor_feature_flag`。
3. GREEN：补 disabled feature flag domain、env、ops service、mapper、shared DTO、route，并把 matrix 纳入新 gate。
4. 定向验证通过：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-executor-feature-flag.test.ts \
  test/integration/execution-writeback-executor-feature-flag-api.test.ts \
  test/unit/execution-writeback-executor-preflight-matrix.test.ts \
  test/integration/execution-writeback-executor-preflight-matrix-api.test.ts
```

结果：7 tests / 4 files 通过。

完整验证矩阵见最终交付报告。

---

## 8. 非目标

- 不注册真实 writeback executor。
- 不执行真实 writeback。
- 不让 `EXECUTION_WRITEBACK_EXECUTOR_ENABLED=true` 生效为真实执行。
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

## 9. Phase 2.29 建议

下一步建议进入 **Writeback Executor Registration Contract Disabled Harness**：

1. 定义真实 writeback executor registry/descriptor contract。
2. 要求 feature flag、preflight matrix、transaction port、state transition policy、subject snapshot 全部 ready 后才允许注册。
3. 当前仍返回 `registered=false` / `executable=false`，不读写控制面。
