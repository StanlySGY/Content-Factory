# Sprint-5 Execution Phase 2.17 — Outbox Lease / Concurrent Relay Claim Readiness（审计）

> 范围：在 Phase 2.16 Relay Writeback Readiness 之后，为 `outbox_events` 增加持久 claim lease，提升 relay 多实例并发领取与 crash recovery 的安全性。
> 一句话目标：**让 outbox relay 的 claim 从短事务锁升级为可观测、可恢复的持久租约，但当前仍不做真实控制面回写。**

---

## 1. Phase 2.16 vs Phase 2.17 差异

| 维度 | Phase 2.16 | Phase 2.17 |
|---|---|---|
| Writeback | terminal event 可解析为 disabled no-op writeback plan | 不改 writeback plan，继续 disabled no-op |
| Relay claim | `FOR UPDATE SKIP LOCKED` 只保护事务内领取 | 新增持久 lease：`claimed_at` / `claimed_owner` / `claim_expires_at` |
| 并发保护 | 多实例提交后缺少可观测租约 | 有效 lease 期间不会被 `claimNextOutboxEvent()` 重复领取 |
| Crash recovery | 依赖下一轮扫描未处理事件 | lease 到期后可被新 owner 重新领取 |
| 观测 | API 看不到 claim owner/expiry | outbox DTO 暴露 lease 字段 |
| DB | 无迁移 | 新增 `0021_outbox_lease.js` |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、runtime adapter 默认关闭边界、真实控制面回写禁用边界。

---

## 2. 架构图（文字）

```text
outbox_events(processed_at is null)
  fields:
    claimed_at
    claimed_owner
    claim_expires_at

OutboxRelay.tick(owner, leaseMs)
  -> outboxRepo.claimNextOutboxEvent()
     WHERE processed_at IS NULL
       AND (claim_expires_at IS NULL OR claim_expires_at <= now)
     ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
     UPDATE claimed_at / claimed_owner / claim_expires_at
     RETURN claimed row
  -> dispatch handler
     -> success: markProcessed()
        - processed_at = now
        - clear lease fields
     -> failure: markFailed()
        - retry_count + 1
        - error = message
        - processed_at remains null
        - clear lease fields

No Redis / MQ
No control-plane writeback
No stage_runs/assets/reviews writes
No audit hash-chain writes
No business table joins
```

---

## 3. DB Migration

新增迁移：`0021_outbox_lease.js`

| 字段 / 索引 | 说明 |
|---|---|
| `claimed_at timestamptz` | 当前 lease 写入时间 |
| `claimed_owner varchar(120)` | relay owner 标识，默认 `outbox-relay` |
| `claim_expires_at timestamptz` | lease 到期时间，过期后允许重领 |
| `idx_outbox_claimable` | `(claim_expires_at, created_at) WHERE processed_at IS NULL`，辅助 claimable 扫描 |

权限说明：复用 `outbox_events` 既有授权；本阶段只新增列与索引，不新增表，不修改 audit / control-plane grants。

---

## 4. Claim 语义

`claimNextOutboxEvent(db, { owner, leaseMs })` 的规则：

| 场景 | 结果 |
|---|---|
| 未处理且无 lease | 可领取，写入 owner/expiry |
| 未处理且 lease 仍有效 | 不可领取，返回 `null` 或领取其它可用事件 |
| 未处理且 lease 已过期 | 可被新 owner 重新领取 |
| 已处理事件 | 不可领取 |
| handler 成功 | `processed_at` 置位，lease 清空 |
| handler 失败 | `retry_count + 1`、写 `error`、`processed_at=null`，lease 清空 |

仍保留事务内 `FOR UPDATE SKIP LOCKED`，用于避免两个 relay 实例同时选择同一可领取行；持久 lease 用于事务提交后的可观测占用与 crash recovery。

---

## 5. Relay 接入

`OutboxRelay` 构造函数新增：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `owner` | `outbox-relay` | 写入 `claimed_owner` |
| `leaseMs` | `30000` | 写入 `claim_expires_at = now + leaseMs` |

`tick()` 会把 owner/leaseMs 传给 repository。`processBatch()` 复用 `tick()`，因此批处理同样走 lease claim。

说明：`processEvent(id)` 是运维手动入口，仍按指定 id 直接 dispatch；它不是自动 relay claim 的并发入口。真实控制面回写前，如需限制手动处理 active lease，需要单独立项调整 409/override 语义。

---

## 6. API / DTO 观测

`OutboxEventDTO` 新增：

| 字段 | 说明 |
|---|---|
| `claimed_at` | 当前 lease 写入时间，未领取为 `null` |
| `claimed_owner` | 当前 relay owner，未领取为 `null` |
| `claim_expires_at` | 当前 lease 到期时间，未领取为 `null` |

受影响端点：

- `GET /api/execution/outbox-events`
- `GET /api/execution/outbox-events/:id`
- `GET /api/execution/jobs/:id/events`
- `POST /api/execution/outbox-events/:id/process`

这些端点只暴露 execution plane 的 outbox 状态，不读取、不 join、不修改控制面业务表。

---

## 7. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改 |
| `stage_runs` / assets / reviews | 不读、不写、不 join |
| audit hash chain | 不读、不写、不替代 |
| execution_jobs | 不改 job 状态机 |
| outbox_events | 仅新增 lease 字段与 relay 生命周期更新 |
| Redis / MQ | 未引入 |
| 外部网络 / provider | 未调用 |
| 真实 writeback | 仍禁用 |

---

## 8. 测试与验证

新增 / 扩展测试：

| 测试 | 覆盖点 |
|---|---|
| `outbox-relay.test.ts` | 写入 durable lease；active lease 不可重复 claim；expired lease 可被新 owner 重领；processed/failed 清空 lease |
| `outbox-api.test.ts` | outbox API 暴露 lease 字段；处理后返回清空后的 lease 字段 |
| `execution-writeback-readiness.test.ts` | 更新 outbox fixture，保持 Phase 2.16 writeback readiness 类型兼容 |

定向验证已执行：

```bash
pnpm --dir apps/api exec vitest run test/integration/outbox-relay.test.ts
pnpm --dir apps/api exec vitest run test/integration/outbox-api.test.ts test/integration/outbox-relay.test.ts
pnpm --dir apps/api exec vitest run test/unit/execution-writeback-readiness.test.ts test/integration/outbox-relay.test.ts
pnpm --dir packages/shared exec vitest run
pnpm --dir apps/api typecheck
```

结果：相关测试与 typecheck 均通过。

---

## 9. 非目标

- 不实现真实 control-plane writeback。
- 不修改 `stage_runs` / workflow / review / assets。
- 不实现 writeback ledger / consumer idempotency table。
- 不实现 Redis / RabbitMQ / Kafka。
- 不实现真实 Agent / MCP / LLM / Publisher 调用。
- 不修改 audit hash chain。
- 不做 UI。

---

## 10. Phase 2.18 建议

下一步建议进入 **Writeback Ledger / Idempotent Consumer Readiness**：

1. 新增 execution-side writeback ledger 或 outbox consumer ledger，用于记录 `writeback_idempotency_key`。
2. 继续默认 disabled no-op，不真实写控制面。
3. 证明同一个 terminal event / result / subject 重复投递只生成一个消费计划。
4. 为后续真实 `stage_runs` 单 subject 回写准备幂等约束与审计材料。
