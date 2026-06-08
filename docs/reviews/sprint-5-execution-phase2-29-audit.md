# Sprint-5 Execution Phase 2.29 — Writeback Executor Registration Contract Disabled Harness（审计）

> 范围：在 Phase 2.28 Writeback Executor Feature Flag Disabled Harness 之后，为未来 `workflow_stage_run` 真实 writeback executor 定义 registry / descriptor / registration readiness contract。
> 一句话目标：**把真实 writeback executor 的注册入口显式建模为可观测、可验证、可回滚的 disabled contract；当前仍不注册、不执行、不读写控制面。**

---

## 1. Phase 2.28 vs Phase 2.29 差异

| 维度 | Phase 2.28 | Phase 2.29 |
|---|---|---|
| 核心对象 | Executor feature flag readiness | Executor registration readiness |
| 关注点 | env configured/effective gate | registry / descriptor / registration contract |
| Subject | `workflow_stage_run` | `workflow_stage_run` |
| Executor kind | 未定义 | `workflow_stage_run_writeback_executor` |
| Registry kind | 未定义 | `disabled_writeback_executor_registry` |
| 注册行为 | 不注册 | 仍不注册 |
| 可执行性 | `realExecutorExecutable=false` | `registered=false` / `executable=false` |
| 依赖项 | preflight matrix required | feature flag + preflight matrix + transaction port + state policy + subject snapshot |
| API | feature flag readiness | registration readiness |
| DB migration | 无 | 无 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
GET /api/execution/ops/writeback-executor-registration-readiness
  -> ExecutionOpsService.getWritebackExecutorRegistrationReadiness()
     -> buildExecutionWritebackExecutorRegistrationReadiness({
          writebackExecutorConfiguredEnabled: env.EXECUTION_WRITEBACK_EXECUTOR_ENABLED
        })
        -> aggregate disabled readiness:
           - feature flag readiness
           - executor preflight matrix
           - transaction port dependency
           - state transition policy readiness
           - subject snapshot readiness
        -> output:
           - mode = disabled_writeback_executor_registration
           - subjectType = workflow_stage_run
           - executorKind = workflow_stage_run_writeback_executor
           - registryKind = disabled_writeback_executor_registry
           - registered = false
           - executable = false
           - registrationAllowed = false
           - controlPlaneReadAllowed = false
           - controlPlaneWriteAllowed = false
           - auditWriteAllowed = false

No real executor registration
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

## 3. Registration Contract

新增：`apps/api/src/domain/execution/writeback-executor-registration.ts`

关键字段：

| 字段 | 当前值 |
|---|---|
| `mode` | `disabled_writeback_executor_registration` |
| `subjectType` | `workflow_stage_run` |
| `executorKind` | `workflow_stage_run_writeback_executor` |
| `registryKind` | `disabled_writeback_executor_registry` |
| `registered` | `false` |
| `executable` | `false` |
| `registrationAllowed` | `false` |
| `featureFlagRequired` | `true` |
| `featureFlagConfiguredEnabled` | env 输入值，默认 `false` |
| `featureFlagEffective` | `false` |
| `preflightMatrixRequired` | `true` |
| `preflightMatrixReady` | `false` |
| `transactionPortRequired` | `true` |
| `transactionPortRegistered` | `false` |
| `stateTransitionPolicyRequired` | `true` |
| `stateTransitionPolicyRegistered` | `false` |
| `subjectSnapshotRequired` | `true` |
| `subjectSnapshotReaderRegistered` | `false` |
| `controlPlaneReadAllowed` | `false` |
| `controlPlaneWriteAllowed` | `false` |
| `auditWriteAllowed` | `false` |

Descriptor 当前固定为 blocked：

```text
descriptor:
  subjectType = workflow_stage_run
  executorKind = workflow_stage_run_writeback_executor
  status = blocked
  executable = false
  version = disabled-harness
```

关键语义：

| 场景 | 结果 |
|---|---|
| env 未配置或 false | `featureFlagConfiguredEnabled=false`，注册仍 blocked |
| env 配置 true | `featureFlagConfiguredEnabled=true`，`featureFlagEffective=false`，注册仍 blocked |
| 任意配置 | `registered=false`、`registrationAllowed=false`、`executable=false` |

---

## 4. API / DTO

新增端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/ops/writeback-executor-registration-readiness` | 查看真实 writeback executor 注册契约 readiness |

DTO 采用 snake_case，并新增 shared schema：

- `ExecutionWritebackExecutorDescriptorSchema`
- `ExecutionWritebackExecutorRegistrationReadinessResponseSchema`

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
| env secret material | 不读取 |

---

## 6. 测试与验证

新增测试：

| 测试 | 覆盖点 |
|---|---|
| `execution-writeback-executor-registration.test.ts` | 默认 false；configured true 仍 fail-closed；validator 拒绝 registered/executable/side-effecting readiness |
| `execution-writeback-executor-registration-api.test.ts` | ops readiness 返回 disabled registration contract；不写 `stage_runs` / `execution_writebacks` |

TDD 记录：

1. RED：先新增 unit/API 测试。
2. RED 结果：unit 测试因缺少 `writeback-executor-registration` module 失败；API 返回 404。
3. GREEN：补 disabled registration domain、ops service、mapper、shared DTO、route。
4. 定向验证通过：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-executor-registration.test.ts \
  test/integration/execution-writeback-executor-registration-api.test.ts
```

结果：4 tests / 2 files 通过。

完整验证矩阵见最终交付报告。

---

## 7. 非目标

- 不注册真实 writeback executor。
- 不执行真实 writeback。
- 不让 `EXECUTION_WRITEBACK_EXECUTOR_ENABLED=true` 生效为真实注册。
- 不读取 `stage_runs`。
- 不写入 `stage_runs` / assets / reviews。
- 不写 audit hash chain。
- 不消费或替代 audit。
- 不把 transaction port 变成 executable。
- 不把 state transition policy 变成 executable。
- 不把 subject snapshot reader 变成 executable。
- 不新增 DB 迁移。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 8. Phase 2 收口结论

Phase 2 停止于 Phase 2.29。后续不再新增 Phase 2.30 / 2.31 disabled harness。

原因：

1. Phase 2.29 已经定义真实 writeback executor 的 registry / descriptor / registration readiness contract。
2. `registered=false` / `registrationAllowed=false` / `executable=false` 已足够阻止 invocation。
3. 继续添加 no-op invocation disabled harness 会增加 API 和测试表面积，但不会显著降低真实实现风险。
4. 下一阶段应进入 Sprint-6 真实能力路线选择：Agent Real Runtime MVP、Workflow Stage Writeback MVP 或 MCP Runtime Safety MVP。

详见：`docs/reviews/sprint-5-execution-phase2-exit-readiness-audit.md` 与 `docs/reviews/sprint-6-implementation-roadmap.md`。
