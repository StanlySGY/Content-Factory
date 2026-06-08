# Sprint-5 Execution Phase 2.16 — Relay Writeback Readiness / Idempotent Handler Skeleton（审计）

> 范围：在 Phase 2.15 Agent Real Adapter Minimum Closed-loop Spike 之后，新增 execution relay 消费侧的 writeback readiness contract。
> 一句话目标：**让 terminal outbox event 可以被解析成幂等 writeback plan，但当前仍默认 disabled no-op，不真实回写 Sprint-4 Control Plane。**

---

## 1. Phase 2.15 vs Phase 2.16 差异

| 维度 | Phase 2.15 | Phase 2.16 |
|---|---|---|
| Real Adapter | 可注入 fake/local client 形成 worker ledger/outbox 闭环 | 不改 runtime adapter |
| Relay | 只验证 outbox no-op relay | 新增 terminal execution event 的 writeback readiness handler |
| Writeback | 无 handler contract | 有 `result_id + subject` 输入解析和幂等 plan |
| Control Plane | 不回写 | 仍不回写，plan 明确 `sideEffectAllowed=false` |
| 幂等 | job idempotency / result ledger 已就位 | 新增 writeback idempotency key 规划 |
| DB | 无迁移 | 无迁移；不新增 claimed_at/lease 字段 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、runtime adapter 默认关闭边界。

---

## 2. 架构图（文字）

```text
outbox_events(event_type=execution_job.success|execution_job.failed)
  payload.result_id
  payload.subject
     -> OutboxRelay.processEvent()/tick()
        -> createExecutionWritebackReadinessHandler(db)
           -> getExecutionResult(result_id)
           -> validate event/result linkage
              - event.aggregate_type == execution_job
              - event.aggregate_id == result.execution_job_id
              - result.id == payload.result_id
              - subject from event payload or result.subject_snapshot
           -> buildExecutionWritebackPlan()
              - idempotencyKey = sha256(event/result/subject)
              - mode = disabled_noop
              - enabled = false
              - sideEffectAllowed = false
              - controlPlaneWrite.planned = false
        -> handler returns without side effects
        -> OutboxRelay markProcessed()

No stage_runs/assets/reviews writes
No workflow state transition
No audit event write
No join with business tables
No real external delivery
```

---

## 3. Writeback Input Contract

`ExecutionWritebackInput` 由两部分组成：

| 字段 | 来源 | 规则 |
|---|---|---|
| `event` | `outbox_events` | 仅支持 `execution_job.success` / `execution_job.failed` |
| `event.payload.result_id` | terminal outbox payload | 必须存在 |
| `event.payload.subject` | bridge subject metadata | 优先使用 |
| `result` | `execution_results` | 仅按 `result_id` 读取，不 join business tables |
| `result.subject_snapshot` | worker ledger | event 无 subject 时作为 fallback |

校验失败时 handler 抛出 `ValidationError`，relay 将事件 `markFailed()`，`processed_at` 保持 `null`，`retry_count + 1`。

---

## 4. Idempotency Plan

`buildExecutionWritebackIdempotencyKey()` 使用以下字段构造稳定 key：

- `eventType`
- `eventId`
- `resultId`
- `executionJobId`
- `attemptNo`
- `subjectType`
- `subjectId`

当前 key 只用于 readiness plan，不落库、不驱动真实消费去重。真实 writeback 前仍需要持久化消费账本或业务侧幂等约束。

---

## 5. Disabled No-op Plan

生成的 plan 固定为：

```json
{
  "mode": "disabled_noop",
  "enabled": false,
  "sideEffectAllowed": false,
  "controlPlaneWrite": {
    "planned": false,
    "table": null,
    "operation": null
  }
}
```

含义：

- handler 可以证明 event/result/subject 的输入已足够形成后续回写意图。
- handler 当前不会修改任何控制面表。
- relay 可以安全处理该 event，并只更新 `outbox_events.processed_at`。

---

## 6. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| `stage_runs` | 不读、不写；测试验证 row count 不变 |
| `workflow_runs` / `reviews` / `assets` | 不读、不写 |
| audit hash chain | 不读、不写 |
| execution_results | 只读 `getExecutionResult(result_id)` |
| outbox_events | relay 生命周期更新 `processed_at/error/retry_count` |
| DB migration | 无 |
| 外部网络/MQ | 无 |
| 真实回写 | 禁止 |

---

## 7. 测试与验证

新增测试：

- `execution-writeback-readiness.test.ts`（unit）
  - 构造 deterministic disabled no-op writeback plan。
  - 缺 `result_id` 或 result/event 不匹配时拒绝。
  - success/failed 两类 terminal event 均有 readiness handler。
- `execution-writeback-readiness.test.ts`（integration）
  - bridge → worker → success outbox → writeback readiness handler → processed。
  - handler 不触碰 `stage_runs`。
  - 缺 `result_id` 的 terminal event 被 markFailed，`processed_at` 保持 null。

定向验证：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-readiness.test.ts \
  test/integration/execution-writeback-readiness.test.ts
```

结果：5 passed / 2 files。

---

## 8. 非目标

- 不真实回写 `stage_runs`。
- 不真实创建 `content_assets` / `asset_versions`。
- 不真实创建 `review_records`。
- 不旁路 ADR-006 状态机。
- 不写 audit hash chain。
- 不新增 outbox lease/claimed_at DB 字段。
- 不实现持久化 writeback ledger。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 9. Phase 2.17 建议

下一步建议进入 **Outbox Lease / Concurrent Relay Claim Readiness**：

1. 新增 outbox claim lease 字段或独立消费账本迁移。
2. `claimNextOutboxEvent()` 从事务内临时锁升级为持久租约，支持 worker crash 后恢复。
3. 增加 claim owner / claimed_at / claim_expires_at / retry visibility timeout。
4. 继续不回写控制面，先证明 relay 并发与恢复语义。
