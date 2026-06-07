# Sprint-5 Execution Phase 1.8 — Control Plane Bridge（Mock-only，审计）

> 范围：在不替换 Sprint-4 Control Plane 行为、不接真实 Agent/MCP/LLM/Publisher 的前提下，新增最小桥接层，
> 让现有控制平面可**显式请求 execution job**，并经 execution job / outbox 追踪异步执行请求。
> 一句话目标：**让 Sprint-4 Control Plane 可通过稳定的 Bridge API 请求 Mock-only execution job，但不自动改变任何现有业务状态，为 Phase 2 真实 Runtime 接入建立安全的控制面入口。**
> 核心原则：只新增桥接入口，不自动改写 Workflow/Agent/MCP 状态机；所有真实执行仍为 Mock Runtime。

---

## 1. Phase 1.7 vs Phase 1.8 差异

| 维度 | Phase 1.7 | Phase 1.8 |
| --- | --- | --- |
| 控制平面 → 执行 | 无显式入口（仅直接 POST /jobs） | **ExecutionBridgeService + POST /api/execution/bridge/jobs** |
| 请求模型 | CreateExecutionJobBody（裸 type+payload） | **CreateExecutionRequest（subjectRef + jobType + payload）** |
| subject 概念 | 无 | **ExecutionSubjectType + ExecutionSubjectRef**（4 类 subject） |
| payload 形态 | flat（直接 mock 控制位） | **归一化 envelope `{ schema_version, subject, input }`**（向后兼容 flat） |
| 幂等键 | 调用方提供 | **可省略 → 由 subjectType+subjectId+jobType+payload 确定性生成** |
| subject 透传 | — | RuntimeRequest.metadata.subject + outbox payload.subject |
| created outbox payload | `{ type }` | **`{ type, subject, idempotency_key }`** |
| 可选控制面入口 | — | **POST /api/stage-runs/:id/request-execution**（Mock-only，不碰 stage_runs） |
| DB | 无变更 | **无变更 / 无迁移 / 无 FK**（subject 仅入 payload，不入表） |

**未变**：ExecutionJob 状态机、retry policy、Runtime Contract（Phase 1.7）、Mock Runtime、outbox relay、Sprint-4 全部控制平面表与状态机。

---

## 2. Control Plane Bridge 架构图

```
  Sprint-4 Control Plane（不变）              Phase 1.8 Bridge（新增入口）          Execution Plane（Phase 1.5–1.7）
  ───────────────────────────              ──────────────────────────          ────────────────────────────────
  workflow_runs / stage_runs                POST /api/execution/bridge/jobs
  agent_profiles / mcp_tools     ──请求──►   POST /stage-runs/:id/request-execution
  （BridgeService 不读这些表）                       │
                                                     ▼
                                          ExecutionBridgeService.requestExecution
                                            1. validateExecutionBridgeRequest（subject↔job 映射校验）
                                            2. buildExecutionPayload → { schema_version, subject, input }
                                            3. idempotencyKey = 入参 或 sha256(subject+job+payload)
                                            4. ExecutionJobService.createJob（复用）
                                                     │ 同事务
                                                     ▼
                                          execution_jobs(pending) + outbox(execution_job.created
                                                                  payload: { type, subject, idempotency_key })
                                                     │  (worker 默认关闭，需显式 tick / 启用)
                                                     ▼
                                          ExecutionWorker：unwrap envelope →
                                            RuntimeRequest{ payload=input, metadata.subject } → Mock Adapter
                                            → RuntimeResponse → 终态/重试 + outbox（payload 保留 subject + runtime snapshot）
```

桥接是**单向、显式、不回写**的：控制平面请求 → 执行平面记录；执行结果**不自动写回** stage_runs/assets/reviews。

---

## 3. subject_ref / job_type 映射规则

| subjectType | 允许的 jobType | 说明 |
| --- | --- | --- |
| `workflow_stage_run` | `agent` | 阶段运行 → Agent 执行 |
| `agent_profile` | `agent` | Agent 档案 → Agent 执行 |
| `mcp_tool` | `mcp` | MCP 工具 → MCP 执行 |
| `publisher_target` | `publisher` | 发布目标 → Publisher 执行 |

`validateExecutionBridgeRequest` 强制 `jobType === expectedJobType(subjectType)`，不匹配 → `ValidationError`（API 400）。`projectId` 仅写入 `subject.metadata`/`subject.project_id`（payload 内），**不加入 execution_jobs 表、不建 FK**。

---

## 4. 为什么 BridgeService 不读取业务表

- **解耦与稳定边界**：bridge 是控制平面 → 执行平面的“请求投递口”，不是业务校验器。读业务表会把执行层与 Sprint-4 schema 强耦合，违背执行层“独立异步基座（无 project_id/无 FK/不 join）”的既定隔离。
- **职责单一**：业务状态合法性（stage 是否可执行、agent 是否 active）属控制平面职责，应由调用方在请求前判定；bridge 只负责“安全地把请求落成 execution job”。
- **可测试 / 可演进**：不读表 → bridge 纯函数式、易测、Mock/Real 无差别；Phase 2 真实 Runtime 接入时 bridge 不需改动。

## 5. 为什么 Phase 1.8 不自动推进 Workflow 状态

- **避免双写真相源**：自动把 execution 结果写回 stage_runs/workflow_runs 会让“执行层”成为控制平面状态的隐式驱动者，破坏 ADR-006 集中状态机的单一真相源。
- **Mock 不应驱动真实业务**：当前执行 100% 为 Mock，让 Mock 结果改变业务状态会污染控制平面语义。
- **回写是 Phase 2 的显式设计**：结果回写（execution → 控制平面）应经 outbox relay + 真实 handler，在 Phase 2 以可审计、可幂等的方式实现，而非 Phase 1.8 隐式 side-effect。

---

## 6. outbox payload 中 subject metadata 的用途

- **可追溯**：`execution_job.created` 携带 `{ type, subject, idempotency_key }`，terminal/retry 事件携带 `subject + runtime snapshot` —— 仅凭 outbox 即可回答“哪个 subject 触发了哪个 job、结果如何”，无需 join。
- **Phase 2 投递依据**：relay 的真实 handler 将据 `subject` 决定把结果投递/通知回哪个控制平面聚合（如 stage_run_id），是“执行 → 控制平面回写”的关键路由信息。
- **隔离友好**：subject 随事件流动，执行层始终不持有业务表 FK。

---

## 7. Phase 2 Real Adapter 如何复用 bridge

- **入口不变**：控制平面继续调用 `ExecutionBridgeService.requestExecution` / Bridge API；Real Runtime 接入只替换 `RuntimeAdapterFactory`（Phase 1.7 预留点），bridge / 契约 / 状态机零改动。
- **subject 贯通**：RuntimeRequest.metadata.subject 已就位，Real Adapter 可据 subject 做凭证作用域化、结果归属。
- **回写经 relay**：Phase 2 用真实 outbox handler 消费 terminal 事件，按 subject 回写控制平面（仍走状态机，不旁路）。

## 8. Phase 2 之前仍未完成的事项

- [ ] **结果回写**：execution 终态 → 控制平面（stage_runs/assets/reviews）的幂等、可审计回写（经 relay 真实 handler，按 subject 路由）。
- [ ] **Real RuntimeAdapterFactory**：Agent(LLM+tool)/MCP(transport)/Publisher 真实实现 + Runtime 隔离层（超时中断、资源限额、凭证作用域化）。
- [ ] **业务前置校验**：调用方（控制平面）在请求执行前的状态合法性判定（bridge 仍不读表）。
- [ ] **relay 真实消费 + 并发领取保护**（Phase 1.6 遗留：claimed_at/租约）。
- [ ] **subject 存在性/授权**：是否在控制平面侧校验 subject 真实存在与操作权限（执行层不负责）。

---

## 9. 非目标（本阶段严格不做）

- ❌ 不做真实 Agent / MCP / LLM 执行
- ❌ 不做 Publisher 实际发布
- ❌ 不引入 Redis / MQ / BullMQ
- ❌ 不改 Workflow / Review / Agent / MCP 状态机
- ❌ 不做 UI 改造
- ❌ 不读取真实 API Key
- ❌ 不实现 MCP transport
- ❌ 不新增 Real Adapter
- ❌ 不让 BridgeService join 业务表
- ❌ 不自动把 execution result 写回 stage_runs / assets / reviews

---

## 10. 验证结果

| 项 | 结果 |
| --- | --- |
| DB 迁移 | **无新增**（subject 仅入 payload，不入表/不 FK）✔ |
| API 全量测试 | **457 passed / 49 files**（+12）✔ |
| 覆盖率门控（overall ≥80/70；domain ≥90/85） | 98.87 / 90.65；`src/domain` 聚合达标 ✔ |
| shared / web 测试 | 6 ✔ / 40 ✔ |
| typecheck（shared + api + web） | 通过 ✔ |
| lint | 0 error / 0 warning ✔ |
| 可选 stage-run 端点 | **已实现** `POST /api/stage-runs/:id/request-execution`（Mock-only，不碰 stage_runs）✔ |

新增/扩展测试：subject ref 校验、subject/job 映射校验、幂等键确定性（键序无关）、envelope 构造/解包、flat 解包 null subject、BridgeService 归一化 subject payload + created outbox 携带 subject、幂等冲突 409、RuntimeRequest.metadata 含 subject 且 runtime 只见 input、terminal outbox 保留 subject、Bridge API 创建/映射拒绝(400)/显式幂等键(409)、stage-run 端点创建 agent job 且不触碰 stage_runs。Phase 1.5/1.6/1.7 既有测试全绿。

**裁决：GO** —— 控制平面可经稳定 Bridge API 请求 Mock-only execution job，subject 全程可追溯，且**不自动改变任何业务状态**；Sprint-4 控制平面与执行层隔离边界保持不变。Phase 2 以“替换 RuntimeAdapterFactory + relay 真实回写”接入，bridge 入口复用。
