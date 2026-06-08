# Sprint-8 Publisher Runtime Safety MVP（审计）

> 范围：在 Sprint-7 MCP Runtime Safety MVP 后，为 `publisher` runtime 建立发布前安全模型。
> 本 Sprint 不调用真实外部发布平台、不读取生产 secret、不写 Sprint-4 Control Plane，不新增 Phase 2.x。

---

## 1. 一句话目标

让 Publisher execution job 可以在显式测试装配下走 fake/local 发布前安全 runtime，完成 preview / publish gate / rollback plan snapshot 闭环，并且结果只进入 `execution_results` 与 `outbox_events`。

---

## 2. 架构边界

```text
execution_jobs(type=publisher)
  -> ExecutionWorker
  -> MockRuntimeAdapterFactory(adapterMode=real)
  -> PublisherSafetyRuntime
  -> FakeLocalPublisherHarness
  -> execution_results + outbox_events

不会写入：
  stage_runs / content_assets / review_records / audit_events / 外部平台
```

| 边界 | 结果 |
|---|---|
| 外部发布平台 | 不调用 |
| 真实发布 | 不执行 |
| 生产 secret | 不读取 |
| Sprint-4 状态机 | 不改 |
| 新 DB 表 | 不新增 |
| Phase 2.x | 不新增 |

---

## 3. 新增模块

| 文件 | 作用 |
|---|---|
| `apps/api/src/domain/execution/publisher-runtime.ts` | Publisher action / payload / idempotent request id / rollback plan snapshot 纯域契约 |
| `apps/api/src/application/runtime/publisher-safety-runtime.ts` | PublisherSafetyRuntime + FakeLocalPublisherHarness |
| `apps/api/test/unit/publisher-safety-runtime.test.ts` | preview、approval gate、credential boundary、幂等 request id、rollback plan 单测 |
| `apps/api/test/integration/sprint8-publisher-runtime-safety-worker.test.ts` | worker 通过 execution ledger/outbox 闭环，验证不写 Sprint-4 表 |

---

## 4. Runtime 行为

| Action | 行为 |
|---|---|
| `preview` | 生成 fake preview snapshot；`externalPublished=false` |
| `publish` | 必须已有 preview 且 `approved=true` 且 `approvalRef` 存在，否则 blocked |
| `rollback_plan` | 只生成 unpublish/rollback snapshot，不执行外部操作 |

`PublisherSafetyRuntime` 要求：

- `context.policy.mode=real_enabled`
- `allowRealExecution=true`
- `allowNetwork=false`
- `credentialRef` 存在且仅作为引用
- 显式注入 `FakeLocalPublisherHarness`

---

## 5. Credential Boundary

| 项 | 规则 |
|---|---|
| `credentialRef` | 只检查引用存在 |
| secret material | 不解析、不返回、不落库 |
| snapshot redaction | `requestSnapshot` / `responseSnapshot` / outbox payload 继续经现有 redaction |
| metadata | 只记录 provider/scope，不记录 `keyRef` |

---

## 6. Idempotency

`buildPublisherRequestId()` 使用：

```text
targetRef | channel | previewId | execution idempotencyKey
```

生成稳定 `publisher-<sha256 prefix>`，用于重复 publish 请求的稳定快照标识。

---

## 7. Factory / Registry

| 项 | 结果 |
|---|---|
| 默认 `publisher:real` descriptor | `blocked` |
| blocked reason | `publisher safety runtime requires explicit local harness registration` |
| capabilities | `publisher_safety_boundary` / `preview_required` / `approval_gate` / `rollback_plan_snapshot` |
| 显式注入 | `adapterMode=real + publisherSafetyRuntime` |
| 默认 worker | 仍走 mock / blocked |

---

## 8. 测试证据

TDD RED：

- 新增测试先失败，原因是 `publisher-safety-runtime` 模块不存在。

GREEN 覆盖：

| 测试 | 覆盖 |
|---|---|
| `publisher-safety-runtime.test.ts` | preview、publish gate、credential boundary、idempotent request id、rollback plan |
| `sprint8-publisher-runtime-safety-worker.test.ts` | worker ledger/outbox 闭环、不写 stage_runs、secret redaction |
| `runtime-adapter-registry.test.ts` | 默认 publisher real blocked descriptor |

---

## 9. 非目标

- 不做真实外部发布。
- 不做真实 rollback / unpublish。
- 不新增 `publish_records` 表。
- 不读取生产 secret。
- 不写 `stage_runs` / `content_assets` / `review_records` / `audit_events`。
- 不修改 Workflow / Review / Agent / MCP 状态机。
- 不新增 Phase 2.x。

---

## 10. 下一步

进入 Sprint-9：Workflow Stage Writeback MVP。

Sprint-9 是首次打开控制面写入，必须单独审计，并且只允许 `workflow_stage_run` 单 subject，经 ADR-006 状态边与 audit 同事务保护。
