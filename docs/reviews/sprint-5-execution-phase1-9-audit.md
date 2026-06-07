# Sprint-5 Execution Phase 1.9 — Execution Result Ledger + Completion Observability（审计）

> 范围：在不接真实 Agent/MCP/LLM/Publisher、不自动回写 Workflow/Asset/Review/Agent/MCP 的前提下，
> 为 execution worker 的每次 runtime attempt 建立独立、只追加的 **execution result ledger**，让执行结果具备稳定持久化、查询、审计与 Phase 2 可复用的结果边界。
> 一句话目标：**让每次 Mock-only runtime attempt 都进入独立、只追加、可查询的 execution result ledger，为 Phase 2 真实 Runtime 的结果落库、排障和后续安全回写打好基础。**
> 核心原则：结果先进入 execution plane 自己的 ledger，不直接写回 Sprint-4 Control Plane。

---

## 1. Phase 1.8 vs Phase 1.9 差异

| 维度 | Phase 1.8 | Phase 1.9 |
| --- | --- | --- |
| 结果持久化 | 散落在 job 状态 + outbox payload | **独立 `execution_results` 账本**（每次 attempt 一条，只追加） |
| 结果可查询 | 仅 outbox 事件 | **GET /jobs/:id/results、/results/:id、/jobs/:id/result-summary** |
| 结果内容 | runtime snapshot 嵌在 outbox | request/response/subject 快照 + 错误分类 + 耗时 + retryable + 终态，结构化入表 |
| 写入边界 | job 更新 + outbox（同事务） | **+ result ledger（同一事务，三者原子）** |
| outbox 关联 | runtime snapshot | + **`result_id` + `attempt_no`** 指向账本 |
| 新增域 | bridge.ts | **result.ts**（ledger 语义） |
| 新增表/迁移 | 无 | **execution_results（0019 表 + 0020 grants，append-only）** |

**未变**：ExecutionJob 状态机、retry policy、Runtime Contract、bridge、Mock Runtime、outbox relay、Sprint-4 控制平面。recoverStaleRunningJobs（无 runtime 响应）不写账本——账本仅记录真实 runtime attempt。

---

## 2. 为什么需要 execution result ledger

- **结果是一等数据**：进入真实 Runtime 前，必须有稳定、可查询、可审计、可回放的结果落点；散落在 job 状态/outbox payload 不利于排障、统计与回放。
- **解耦结果与回写**：Phase 2 接真实 LLM/MCP 时，结果**先落账本**，再由后续机制（relay 真实 handler）安全、幂等地回写控制平面——而非执行即写业务表。
- **多 attempt 可追溯**：retry 场景下每次 attempt 的 request/response/错误分类/耗时独立留存（`unique(job_id, attempt_no)`），可完整回放一个 job 的执行历史。

---

## 3. execution_results 与 outbox_events 的边界

| 维度 | `execution_results` | `outbox_events` |
| --- | --- | --- |
| 角色 | 执行结果**账本**（真相源） | 待投递的执行**事件**（投递通道） |
| 粒度 | 每次 runtime attempt 一条 | 每次状态变化一条 |
| 可变性 | **只追加**（无 update/delete） | 可变（relay 标记 processed/failed/retry_count） |
| 内容 | 完整 request/response/subject 快照 | 事件摘要 + runtime snapshot + **result_id 指针** |
| 消费 | 只读观测/查询/汇总 | relay（Phase 1.6，no-op） |

关系：outbox 事件经 `result_id` **指向**账本记录；账本是结果真相，outbox 是事件流。二者同事务写入，互补不互替。

## 4. execution_results 与 audit_events 的边界

| 维度 | `execution_results`（execution plane） | `audit_events`（Sprint-4 审计） |
| --- | --- | --- |
| 目的 | 执行结果账本（排障/回放/统计） | 不可篡改的审计链路 |
| 完整性 | append-only（grant 撤 U/D） | append-only + **哈希链** |
| 范围 | 仅 execution plane（FK 限 execution_jobs） | 控制平面审计（含 RLS） |
| 关系 | **不消费、不替代 audit；不参与 hash chain** | 不被 result ledger 取代 |

**结论**：result ledger 是执行层自有结果账本，**绝不替代 audit_events / audit hash chain**，二者目的与完整性模型不同。

---

## 5. 为什么不直接写回 Workflow / Asset / Review

- **单一真相源**：控制平面状态由 ADR-006 集中状态机驱动；执行层直接写业务表会形成隐式双写，破坏一致性与可推理性。
- **Mock 不应驱动业务**：当前 100% Mock，执行结果不应改变真实业务状态。
- **回写是显式 Phase 2 设计**：结果回写须幂等、可审计、按 subject 路由，应经 relay 真实 handler（消费 result_id/subject）在 Phase 2 实现，而非执行即写。
- **隔离不变**：execution_results 不 FK/不 join 业务表，保持执行层独立基座。

---

## 6. Result Ledger 写入事务边界

worker 每次 runtime attempt（success / retryable failed / non-retryable failed / 归一化抛错 / timeout / blocked）后，在**同一个 job 状态变化事务内**：

```
BEGIN
  UPDATE execution_jobs (success | failed | pending-retry)
  INSERT execution_results (request/response/subject 快照 + 分类 + 耗时 + retryable)
  INSERT outbox_events (event + runtime snapshot + result_id + attempt_no)
COMMIT
```

**原子性**：result ledger insert 失败 → 整个事务回滚 → job 状态变化也回滚（结果绝不仅存于 outbox）。`attempt_no = job.attempt_count`（claim 时已自增），`unique(job_id, attempt_no)` 保证一次 attempt 一条、可幂等回放。

---

## 7. result_id 在 outbox payload 中的用途

- **事件 → 账本指针**：`execution_job.success/failed/retry_scheduled` payload 携带 `result_id + attempt_no`，relay/下游无需扫描即可定位该次 attempt 的完整结果。
- **Phase 2 回写依据**：真实 relay handler 据 `result_id` 取结果 + `subject` 定位控制平面聚合，完成安全回写。
- **relay 仍 no-op**：Phase 1.9 不消费、不投递外部系统。

---

## 8. Phase 2 Real Adapter 如何复用 result ledger

- **结果落点不变**：Real Adapter 返回真实 RuntimeResponse，worker 仍写同一 `execution_results`（schema/事务边界复用），只是 output/errorType 变为真实值。
- **快照即排障**：request/response 快照对真实 LLM/MCP 调用的排障、重放、审计天然适用。
- **回写经账本**：Phase 2 回写从 ledger（真相）+ outbox（result_id 指针）出发，不改 worker 写入路径。

## 9. Phase 2 前仍未完成的事项

- [ ] **结果回写**：relay 真实 handler 消费 result_id/subject，幂等回写控制平面（stage_runs/assets/reviews，经状态机）。
- [ ] **Real RuntimeAdapterFactory + 隔离层**：真实 Agent/MCP/Publisher、超时中断、资源限额、凭证作用域化。
- [ ] **relay 并发领取保护**（Phase 1.6 遗留）+ 真实投递语义。
- [ ] **结果保留/归档策略**：ledger 增长后的分区/归档（当前不处理）。
- [ ] **跨 attempt 统计/查询增强**：按 error_type/job_type 的聚合观测（已建索引，API 待扩）。

---

## 10. 非目标（本阶段严格不做）

- ❌ 不做真实 Agent / MCP / LLM
- ❌ 不做 Publisher 实际发布
- ❌ 不引入 Redis / MQ / BullMQ
- ❌ 不改 Workflow / Review / Agent / MCP 状态机
- ❌ 不做 UI 改造
- ❌ 不读取真实 API Key
- ❌ 不实现 MCP transport
- ❌ 不新增 Real Adapter
- ❌ 不自动把 execution result 写回 stage_runs / assets / reviews
- ❌ 不把 execution_results join 到业务表
- ❌ 不替代 audit_events / audit hash chain

---

## 11. 验证结果

| 项 | 结果 |
| --- | --- |
| DB 迁移 | **0019 execution_results（表+索引+约束+FK execution_jobs）+ 0020 grants（cf_app S/I，撤 U/D；cf_audit_reader S）**；up 通过 ✔ |
| API 全量测试 | **473 passed / 52 files**（+16）✔ |
| 覆盖率门控（overall ≥80/70；domain ≥90/85） | 98.9 / 90.6；`src/domain` 100/100 ✔ |
| shared / web 测试 | 6 ✔ / 40 ✔ |
| typecheck（shared + api + web） | 通过 ✔ |
| lint | 0 error / 0 warning ✔ |
| result-summary 端点 | **已实现** `GET /api/execution/jobs/:id/result-summary` ✔ |

新增/扩展测试：result 记录校验（非法 status/attempt_no/duration/errorType）、buildExecutionResultRecord 映射、isTerminalExecutionResult、summarize（空+多）、createExecutionResult 只追加、**UPDATE/DELETE 被 cf_app 拒绝（permission denied）**、listResultsByJob attempt 升序、summarizeResultsByJob、worker success/retryable/non-retryable/抛错归一化/timeout 各写一条结果、outbox terminal payload 含 result_id+attempt_no、GET results / 单条 404 / summary。Phase 1.5–1.8 既有测试全绿。

**裁决：GO** —— 每次 Mock-only runtime attempt 进入独立、只追加、可查询的 execution result ledger；结果与 job 状态/outbox 同事务原子写入，账本与 audit/业务表严格隔离，不自动回写控制平面。Phase 2 以“真实 Adapter + relay 按 result_id/subject 回写”复用本账本。
