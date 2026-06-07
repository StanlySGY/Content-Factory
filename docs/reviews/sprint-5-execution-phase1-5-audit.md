# Sprint-5 Execution Phase 1.5 — 异步执行骨架加固（审计）

> 范围：在不改动 Sprint-4 Control Plane（Agent / MCP / Workflow / Review / Audit / Append-only / 权限模型）前提下，
> 为 Phase 1 的 Mock Execution Worker 补齐最小生产级可靠性：**超时、重试、失败隔离、可观测字段、可恢复锁**。
> 一句话目标：**让异步执行骨架具备可靠的失败恢复与重试能力，为 Phase 2 真实 Runtime 接入做好前置保护。**
> 仍不引入真实执行（无 LLM / 无 MCP transport / 无 Publisher 发布 / 无 Redis·MQ）。

---

## 1. Phase 1 vs Phase 1.5 差异

| 维度 | Phase 1（骨架） | Phase 1.5（加固） |
| --- | --- | --- |
| 生命周期字段 | status / attempt_count / locked_at / idempotency_key | + **max_attempts / last_error / next_run_at / finished_at** |
| 失败处理 | 任意失败/blocked/抛错 → 直接 `failed` 终态 | 按**重试策略**：可重试 → `pending` + 退避；耗尽 → `failed` + finished_at |
| 领取条件 | `status='pending'`（FOR UPDATE SKIP LOCKED） | + `next_run_at IS NULL OR <= now()`（退避窗口内不领） |
| 卡死保护 | 无（崩溃 → 作业永久 `running`） | **recoverStaleRunningJobs**：锁超时 → 按策略回退/失败 |
| 错误可观测 | outbox payload 内 error 字符串 | + 落 `last_error` 字段；outbox + `error/retry_count` 列（待 relay） |
| Outbox 事件 | created / success / failed | + **running / retry_scheduled / lock_timeout** |
| 控制面 API | POST、GET list(status)、GET by id | + GET list **(status & type)**、**POST /:id/tick** 手动触发 |
| 状态机 | pending→running→success/failed | + **running→pending**（退避重试回退；success/failed 仍终态） |

**未变（严格保持）**：execution_jobs 仍为独立异步基座——无 `project_id`、无 FK、不与任何业务表 join；与控制平面 append-only trace 表分工不变。

---

## 2. Job 状态变化图

```
            create (attempt_count=0)
                  │  outbox: created
                  ▼
            ┌──────────┐   claim: status→running, attempt_count+1, locked_at=now
            │ pending  │───────────────────────────────────────────────┐
            └──────────┘   (仅当 next_run_at 为空或已到期)  outbox: running │
                  ▲                                                       ▼
   retry_scheduled│                                                 ┌──────────┐
   next_run_at=   │                                                 │ running  │
   backoff(n)     │                                                 └────┬─────┘
                  │                            ┌──── mock runtime ───────┤
                  │                            ▼ success                 ▼ failed/blocked/throw
                  │                      ┌──────────┐            shouldRetry(attempt<max)?
                  │                      │ success  │             ├─ yes → pending（退避，见左）
                  │  finished_at         └──────────┘             └─ no  → failed + finished_at
                  │                       outbox: success                   outbox: failed
                  │
                  └──◄── stale-lock recovery：running 且 locked_at < now-lockTimeout
                          → 按 shouldRetry 回退 pending / 置 failed；last_error='execution lock timeout'
                            outbox: lock_timeout
```

终态：`success` / `failed`（无合法后继，不可再被 claim）。

---

## 3. Retry / Timeout / Stale-lock 策略

### 3.1 重试（Domain：`domain/execution/retry-policy.ts`，纯函数、确定性、无外部 queue/scheduler）
- `shouldRetry(job)` = `attempt_count < max_attempts`（attempt_count 在 claim 时已自增）。
- `calculateNextRunAt(n)` = `now + min(BASE·2^(n-1), MAX)`，**确定性指数退避**（BASE=1s，MAX=60s）；可注入 `now` 便于测试。
- `markExecutionFailure(job, error)` 编排：可重试 → `pending` + next_run_at；耗尽 → `failed` + finished_at。
- 默认 `max_attempts=3`（DB 默认；创建时可选覆盖，CHECK `> 0`）。

### 3.2 超时与失败隔离（Worker：`application/execution-worker.ts`）
- adapter 抛错被捕获为 `failed` 结果，**绝不吞错**——错误进入 `last_error` 与 outbox。
- 每次状态变化在**同一事务**内写 `execution_jobs` 更新 + `outbox_events`（原子）。
- `start/stop` 仍受 feature flag（`EXECUTION_WORKER_ENABLED`）控制；周期 `cycle = recoverStale → tick`。
- cycle 边界对 infra 抖动做容错（下周期重试），防止定时器 unhandled rejection 中断 worker；**作业级错误已落库，不被掩盖**。

### 3.3 Stale-lock 恢复（Repository：`recoverStaleRunningJobs(lockTimeoutMs)`）
- 选 `status='running'` 且 `locked_at < now-lockTimeoutMs`（FOR UPDATE SKIP LOCKED）。
- 按 `markExecutionFailure` 回退 `pending` 或置 `failed`，`last_error='execution lock timeout'`，清 `locked_at`，写 `lock_timeout` 事件。
- **不 join 业务表、不触碰 Agent/MCP/Workflow/Review 状态机**。锁超时默认 30s（`EXECUTION_WORKER_LOCK_TIMEOUT_MS`）。

---

## 4. Outbox 事件类型（唯一真相源：`@cf/shared` `EXECUTION_OUTBOX_EVENTS`）

| event_type | 触发点 | payload 关键字段 |
| --- | --- | --- |
| `execution_job.created` | service.createJob | `type` |
| `execution_job.running` | claim（pending→running） | `attempt` |
| `execution_job.retry_scheduled` | 失败且可重试（→pending） | `error`, `attempt` |
| `execution_job.success` | 执行成功（→success） | `output` |
| `execution_job.failed` | 失败且耗尽（→failed） | `error`, `attempt` |
| `execution_job.lock_timeout` | stale-lock 恢复 | `recovered_to`, `last_error` |

`outbox_events` 新增 `error` / `retry_count` 列为 **Phase 2 relay 消费**预留；**当前不实现 relay 消费**（`processed_at` 恒为 NULL）。

---

## 5. 为什么仍不接入真实执行

1. **隔离未就绪**：真实 MCP（外部进程/网络）+ LLM 跨信任边界，缺超时/资源限额/凭证作用域化（沿用控制平面 `sensitivity_level` / `risk_level` 驱动），贸然接入即安全敞口。
2. **先证可靠性，再证真实性**：本阶段把「失败→恢复→重试」骨架在 **Mock 确定性结果**下验证到位（结果可控、可复现），避免真实不确定性与骨架缺陷耦合，定位困难。
3. **Mock 缝不变**：Runtime 端口（`IAgentRuntime/IMCPRuntime/IPublisherRuntime`）签名稳定，Real Adapter 是「替换适配器」而非「改骨架」——骨架先冻结才能让 Phase 2 增量最小。
4. **控制平面零回改**：执行层独立演进，不动 Sprint-4 内核，符合 handoff 既定边界。

---

## 6. Phase 2（Real Adapter）进入条件

- [ ] **Runtime 隔离层**就位：每类执行的超时、资源/并发限额、凭证按 `sensitivity_level` 作用域化注入。
- [ ] **真实结果契约**：`ExecutionResult.output` 针对 Agent（消息/工具调用轨迹）、MCP（请求/响应）、Publisher（发布记录引用）定型；append-only trace 落点确定。
- [ ] **Outbox relay 消费**：实现 at-least-once relay（消费 `processed_at`/`error`/`retry_count`），连接执行完成 → 控制平面状态推进（仍经状态机，不旁路）。
- [ ] **幂等保证**：真实副作用（外部调用）下的幂等键去重与「至少一次」语义对账。
- [ ] **背压与可观测**：worker 并发度、队列深度、失败率指标；锁超时与退避参数压测定标。
- [ ] **降级开关**：Real/Mock 适配器经端口可切换，故障可快速回退 Mock。

满足以上后，将 `MockAdapter` 旁挂 `RealAdapter`，控制平面与本骨架不变。

---

## 7. 非目标（本阶段严格不做）

- ❌ 不做真实 Agent / MCP / LLM 执行
- ❌ 不做 Publisher 实际发布
- ❌ 不引入 Redis / MQ / BullMQ（纯 DB 轮询 + SKIP LOCKED）
- ❌ 不改 Workflow / Review / Agent / MCP 状态机
- ❌ 不做 UI 改造（execution 仅 backend 控制面）
- ❌ 不消费 outbox（relay 留待 Phase 2）
- ❌ 不把 `execution_jobs` join 到任何业务表

---

## 8. 验证结果

| 项 | 结果 |
| --- | --- |
| 迁移 0018（列 + 约束 + 部分索引；列继承 0017 表级 grant） | up/down 往返通过 ✔ |
| API 全量测试 | **415 passed / 42 files** ✔ |
| 覆盖率门控（overall ≥80/70；domain ≥90/85） | 98.86 / 91.46；`src/domain` 100/100 ✔ |
| shared / web 测试 | 6 ✔ / 40 ✔ |
| typecheck（shared + api + web） | 通过 ✔ |
| lint | 0 error / 0 warning ✔ |

新增/扩展测试覆盖：retry policy 单测、失败→重试调度、max_attempts 耗尽→failed、blocked 走失败策略、抛错入 last_error、未来 next_run_at 不可领取、stale running 恢复（回退/失败/未超时不动）、终态不可领取、API type/status 过滤、手动 tick 端点（200/409/404）。

**裁决：GO** —— 异步骨架已具备超时/重试/失败隔离/可恢复锁，Sprint-4 控制平面零回改，Phase 2 真实 Runtime 接入的前置保护到位。
