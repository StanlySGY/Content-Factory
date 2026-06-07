# Sprint-5 Execution Phase 1.6 — Outbox Relay + Execution Observability（审计）

> 范围：在不改动 Sprint-4 Control Plane（Agent / MCP / Workflow / Review / Audit / Append-only / 权限模型）前提下，
> 为 Phase 1/1.5 已写入的 `outbox_events` 补齐**最小可观测、可手动处理、可失败重试的 relay 骨架**，并增强 execution job 的只读观测。
> 一句话目标：**让 execution layer 写出的 outbox_events 具备可观测、可手动处理、可失败重试的 relay 骨架，为 Phase 2 真实 Runtime 和事件投递做好前置保护。**
> 仍不接入真实 Agent / MCP / LLM / Publisher；不引入 Redis/MQ；relay 不修改 execution_jobs；不 join 业务表；不替代 audit。

---

## 1. Phase 1.5 vs Phase 1.6 差异

| 维度 | Phase 1.5 | Phase 1.6 |
| --- | --- | --- |
| outbox 角色 | 仅**写入**（状态变更同事务追加），从不消费 | + **relay 骨架消费自身生命周期**：claim → dispatch → markProcessed/markFailed |
| Outbox 领域模型 | 无（仅 DB 行 + repo.createOutboxEvent） | **OutboxEvent** + `validate/isProcessed/markProcessed/markFailed`（纯域） |
| Outbox 仓储 | createOutboxEvent | + list（event_type/aggregate_type/processed）/ get / claimNext(SKIP LOCKED) / markProcessed / markFailed / byAggregateId |
| 投递 | 无 | **OutboxRelay**（轮询）+ **Handler Registry**（6 类 no-op handler） |
| 失败语义 | execution job 有 last_error/重试 | **outbox 事件**自身 retry_count+1 / error / processed_at=null（待重试） |
| 观测 API | jobs CRUD + 手动 tick | + `GET outbox-events`（过滤）/ `GET outbox-events/:id` / `POST :id/process` / `GET jobs/:id/events` |
| DTO | ExecutionJobDTO | + **OutboxEventDTO** / OutboxEventsResponse / ProcessOutboxEventResponse |
| Feature flag | EXECUTION_WORKER_ENABLED | + **OUTBOX_RELAY_ENABLED**（默认 false）/ OUTBOX_RELAY_INTERVAL_MS（5s） |
| DB 迁移 | 0018（新增列） | **无**（复用 0018 的 error/retry_count、0016 的 `idx_outbox_unprocessed`） |

**未变**：`outbox_events` 仍是独立结构表（无 FK、不与业务表 join）；relay **不触碰** execution_jobs 与任何控制平面状态机。

---

## 2. Outbox Relay 架构图

```
 写侧（Phase 1/1.5，不变）                         读/中继侧（Phase 1.6 新增）
 ─────────────────────────                         ───────────────────────────────────────
 createJob / claim / 终态 / stale                  ┌──────────── OutboxRelay（默认关闭）────────────┐
   │ 同事务 append                                  │ tick(): claimNextOutboxEvent (FOR UPDATE       │
   ▼                                                │         SKIP LOCKED, processed_at IS NULL,     │
 ┌───────────────┐                                  │         ORDER BY created_at ASC)               │
 │ outbox_events │◄──── claim ──────────────────────┤   │                                            │
 │  processed_at │                                  │   ▼ dispatch(event)                            │
 │  error        │──── markProcessed ───────────────┤  Handler Registry: Map<event_type, handler>    │
 │  retry_count  │──── markFailed(retry+1) ─────────┤   ├─ 命中 → handler.handle()(no-op) → markProcessed
 └───────────────┘                                  │   └─ 未命中 → markFailed('no handler registered')│
        ▲                                            │       handler 抛错 → markFailed(error)          │
        │ 只读观测                                    └────────────────────────────────────────────────┘
 GET /outbox-events?event_type=&aggregate_type=&processed=   POST /outbox-events/:id/process（手动，走同一 dispatch）
 GET /outbox-events/:id        GET /jobs/:id/events（仅按 aggregate_id 查询，无 join）
```

处理结果只改 `outbox_events` 自身三字段：`processed_at`（成功置位）、`error` / `retry_count`（失败累加，processed_at 保持 null 待重试）。

---

## 3. outbox_events 与 audit_events 的边界（严格区分）

| 维度 | `outbox_events`（execution 内部） | `audit_events`（Sprint-4 审计） |
| --- | --- | --- |
| 目的 | 待投递的执行事件（事务性发件箱） | 不可篡改的审计链路 |
| 可变性 | **可变**：processed_at / error / retry_count 随 relay 更新 | **append-only + 哈希链**，插入即定稿 |
| 消费者 | OutboxRelay（本阶段 no-op） | 审计读取身份（cf_audit_reader），只读 |
| 关系 | 与 audit **互不消费、互不替代** | 不被 outbox 取代；hash chain 不受影响 |
| 隔离 | 无 project_id / 无 FK / 不 join 业务表 | 控制平面审计（含 RLS） |

**结论**：Phase 1.6 的 relay 只在 `outbox_events` 内闭环；**绝不读写 audit_events，绝不替代 audit hash chain**。

---

## 4. No-op Handler Registry 设计

- 接口：`OutboxHandler { eventType; handle(event): Promise<void> }`。
- 默认注册（唯一真相源 `@cf/shared` `EXECUTION_OUTBOX_EVENTS`）：`created / running / retry_scheduled / success / failed / lock_timeout` 各一个 **no-op handler**——仅确认事件“可识别”，**不触发任何真实副作用、无网络调用**。
- Registry 为 `Map<eventType, handler>`，构造时注入（可替换/扩展，为 Phase 2 真实 handler 预留接缝）。
- 分发裁决：命中 → `handle()` 成功 → `markProcessed`；命中但 `handle()` 抛错 → `markFailed(error)`；**未注册 → `markFailed('no handler registered')`**（不静默丢弃）。

---

## 5. Relay start/stop / Feature flag 行为

- **默认关闭**：`OUTBOX_RELAY_ENABLED` 未置 `true` 时不启动轮询；仅手动 `POST /:id/process` 可触发（测试/运维）。
- `start()`：**幂等**——已运行则直接返回（不重复创建 timer，单测以 `setInterval` 调用计数验证）；`setInterval(intervalMs=5s)` 且 `unref()` 不阻塞退出。
- `stop()`：清除 timer，置空；`app.close()` 中与 ExecutionWorker 一并停止。
- tick 边界对 infra 抖动容错（下周期重试）；**事件级失败已落 `outbox.error`，绝不静默吞没**。
- 仍为**纯 DB 轮询**（FOR UPDATE SKIP LOCKED），无 Redis/RabbitMQ/BullMQ。

---

## 6. 为什么当前仍不消费外部系统

1. **先证“可投递骨架”，再证“真实投递”**：no-op handler 让「claim→分发→标记处理/失败→重试」闭环在确定性、零副作用下验证到位，避免与外部系统不确定性耦合。
2. **接缝已就位**：Handler Registry + 端口化的 `OutboxHandler` 让 Phase 2 以「替换 handler」接入真实投递（事件通知 / 控制平面状态推进），而非改 relay 骨架。
3. **至少一次语义未定标**：真实消费需幂等键去重、并发 relay 的“领取”保护（见 §7）、投递失败的退避策略——这些是 Phase 2 前置，骨架阶段先冻结结构。
4. **边界安全**：relay 只闭环于 `outbox_events`，不碰 execution_jobs / 业务表 / audit；外部消费在隔离层就位前不引入。

---

## 7. Phase 2（Real Adapter / 真实投递）前置条件清单

- [ ] **并发领取保护**：当前 `claimNextOutboxEvent` 为 SKIP LOCKED 短事务（提交即释放锁）；多实例 relay 需引入 `claimed_at`/租约或「锁内处理」以保证单事件单投递。
- [ ] **至少一次 + 幂等**：真实 handler 副作用需幂等键/去重；投递与 `markProcessed` 的原子性对账（防“已投递未标记”重复投递）。
- [ ] **退避与上限**：outbox 失败的 `retry_count` 接入退避策略与死信阈值（复用 execution retry-policy 思路或独立策略）。
- [ ] **真实 handler 注册**：用真实投递/通知 handler 替换 no-op；定义投递目标契约（事件→下游动作）。
- [ ] **Runtime 隔离层**：真实执行（Agent/MCP/LLM/Publisher）超时、资源限额、凭证按 `sensitivity_level` 作用域化（沿用控制平面建模）。
- [ ] **可观测增强**：relay 吞吐/积压（unprocessed 深度）、失败率、重试分布指标。
- [ ] **降级开关**：真实 handler 与 no-op 经 Registry 可切换，故障快速回退。

满足后，Phase 2 以「替换 handler + 隔离层 + 真实结果契约」接入，relay 骨架与控制平面不回改。

---

## 8. 非目标（本阶段严格不做）

- ❌ 不做真实 Agent / MCP / LLM 执行
- ❌ 不做 Publisher 实际发布
- ❌ 不引入 Redis / MQ / BullMQ
- ❌ 不改 Workflow / Review / Agent / MCP 状态机
- ❌ 不做 UI 改造
- ❌ 不替代 audit_events / audit hash chain
- ❌ 不让 relay 修改 execution_jobs
- ❌ 不把 outbox_events join 到业务表

---

## 9. 验证结果

| 项 | 结果 |
| --- | --- |
| DB 迁移 | **无新增**（复用 0018 列 + 0016 `idx_outbox_unprocessed` 部分索引）✔ |
| API 全量测试 | **429 passed / 45 files**（+14）✔ |
| 覆盖率门控（overall ≥80/70；domain ≥90/85） | 98.85 / 91.35；`src/domain` 100/100 ✔ |
| shared / web 测试 | 6 ✔ / 40 ✔ |
| typecheck（shared + api + web） | 通过 ✔ |
| lint | 0 error / 0 warning ✔ |

新增/扩展测试：outbox domain 校验、claimNextOutboxEvent 仅领未处理、markProcessed 写 processed_at、markFailed retry_count+1 且 processed_at 保持 null、relay no-op 成功处理、未注册 event_type→markFailed、relay start 幂等不重复建 timer、relay 不触碰业务表、`GET outbox-events` 过滤、`GET :id` 404、`POST :id/process` 处理+已处理 409+不存在 404、`GET jobs/:id/events` 返回该 job 事件。

**裁决：GO** —— outbox relay 骨架具备可观测/可手动处理/可失败重试，且严格闭环于 `outbox_events`（不碰 execution_jobs / 业务表 / audit hash chain）；Phase 2 真实投递与 Runtime 接入的前置接缝（Handler Registry + 隔离层清单）已就位。
