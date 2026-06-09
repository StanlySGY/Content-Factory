# Productization-P2.2 Publisher Real Release（审计）

> 范围：在 P2.1 MCP Real Runtime 之后，为 execution layer 增加默认关闭、显式启用、受审批/预览/allowlist 保护的 Publisher HTTP release runtime，并补齐版本锚定的 `publish_records` 控制表。
> 目标：让 `publisher` execution job 在满足 gate 时可调用真实发布端点；结果进入 `execution_results` / `outbox_events`，发布状态进入 `publish_records`；不改 Workflow / Review / Agent / MCP 状态机。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Productization-P2.2 |
| Runtime | `PublisherRealRuntime` |
| 默认状态 | 关闭，fail-closed |
| Transport | HTTP POST JSON |
| 控制表 | `publish_records` |
| 版本锚定 | `asset_version_id` DB trigger 不可变 |
| Control Plane | 不改 Workflow / Review / Agent / MCP 状态机 |

---

## 2. 架构图

```text
POST /api/publish-records
  -> publish_records(status=pending, asset_version_id pinned)

execution_jobs(type=publisher, payload.publishRecordId)
  -> ExecutionWorker.tickJob()
     -> publish_records pending -> publishing
     -> RuntimeRequest(jobType=publisher)
     -> MockRuntimeAdapterFactory(adapterMode=real)
        -> PublisherRealRuntime
           -> env endpoint registry
           -> channel allowlist
           -> EXECUTION_NETWORK_ALLOWLIST host check
           -> approval + preview + publishRecordId guard
           -> PublisherReleaseHttpClient POST JSON
     -> execution_results append-only ledger
     -> outbox_events execution_job.success/failed
     -> publish_records published/failed
```

P2.2 闭环表：

| 表 | 行为 |
|---|---|
| `publish_records` | 可变发布状态表，锚定 asset version |
| `execution_jobs` | 作业生命周期 |
| `execution_results` | 每次 runtime attempt 只追加账本 |
| `outbox_events` | terminal event 与 result pointer |

---

## 3. Safety Gates

全部 gate 满足才会在 app 装配中注入 `PublisherRealRuntime`：

```text
EXECUTION_RUNTIME_MODE=real_enabled
EXECUTION_RUNTIME_ADAPTER_MODE=real
EXECUTION_ALLOW_REAL_RUNTIME=true
EXECUTION_ALLOW_NETWORK=true
EXECUTION_REDACT_SNAPSHOTS=true
EXECUTION_NETWORK_ALLOWLIST=publisher.example.test
EXECUTION_PUBLISHER_REAL_RUNTIME_ENABLED=true
EXECUTION_PUBLISHER_ENDPOINT_REGISTRY=publisher://wechat=https://publisher.example.test/release
EXECUTION_PUBLISHER_CHANNEL_ALLOWLIST=wechat_mp
```

Readiness API：

```text
GET /api/execution/ops/publisher-real-runtime-readiness
```

只读 env-derived 配置，不发网络。

---

## 4. publish_records 设计

新增迁移：

```text
db/migrations/0026_publish_records.js
```

字段：

| 字段 | 说明 |
|---|---|
| `content_task_id` | FK `content_tasks` |
| `content_asset_id` | FK `content_assets` |
| `asset_version_id` | FK `asset_versions`，不可变 |
| `execution_job_id` | nullable FK `execution_jobs` |
| `channel` | 发布渠道 |
| `status` | `pending/publishing/published/failed/withdrawn` |
| `external_ref` | 外部平台引用 |
| `idempotency_key` | unique |
| `published_at` | 成功发布时间 |
| `error_data` | 失败信息 |
| `metadata` | 非核心扩展 |

不可变约束：

```text
BEFORE UPDATE OF asset_version_id
  -> RAISE EXCEPTION 'asset_version_id is immutable'
```

这保证已发布记录不会因资产 current version 变化而漂移。

---

## 5. API

```text
POST /api/publish-records
GET  /api/publish-records/:id
GET  /api/publish-records?task_id=&status=&channel=
GET  /api/execution/ops/publisher-real-runtime-readiness
```

API 只提供最小控制面，不接 Publisher UI，不替换既有 API。

---

## 6. Runtime Contract

执行前必须满足：

| 检查 | 不满足时 |
|---|---|
| `action=publish` | `blocked`, `networkUsed=false` |
| `preview` 存在 | `blocked`, `networkUsed=false` |
| `approved=true` 且 `approvalRef` 存在 | `blocked`, `networkUsed=false` |
| `publishRecordId` 存在 | `blocked`, `networkUsed=false` |
| `targetRef` 在 registry 内 | `permission_denied`, `networkUsed=false` |
| `channel` 在 allowlist 内 | `permission_denied`, `networkUsed=false` |
| endpoint host 在 `EXECUTION_NETWORK_ALLOWLIST` 内 | `permission_denied`, `networkUsed=false` |

HTTP 请求体：

```json
{
  "action": "publish",
  "channel": "wechat_mp",
  "content": {},
  "preview": { "previewId": "preview-1", "checksum": "sha256:abc" },
  "approvalRef": "approval-1",
  "publishRecordId": "<publish_record_id>",
  "publisherRequestId": "<deterministic id>"
}
```

`publisherRequestId` 使用 `targetRef/channel/previewId/idempotencyKey` 确定性生成。

---

## 7. 错误映射

| 外部结果 | Runtime errorType | retryable |
|---|---|---|
| `2xx` 且存在 `externalRef` | success | false |
| `429` | `rate_limited` | true |
| `401/403` | `permission_denied` | false |
| `5xx` / 网络异常 | `external_unavailable` | true |
| Abort / timeout | `timeout` | true |
| 缺审批/预览/记录 id | `blocked` | false |

Runtime metadata 包含：

```text
adapterMode=publisher_real
networkUsed
processSpawned=false
targetRef
channel
endpointHost
```

快照经 `redactRuntimeSnapshot()` 脱敏；测试覆盖 `Bearer`、`sk-*`、`api_key` 不进入 result ledger/outbox。

---

## 8. Worker 联动

| 时间点 | publish_records |
|---|---|
| publisher job 被处理且 `publishRecordId` 有效 | `pending -> publishing`，写 `execution_job_id` |
| runtime success | `published`，写 `external_ref` / `published_at` |
| terminal failed | `failed`，写 `error_data` |
| retryable 且仍有 attempts | 保持 `publishing`，等待后续 terminal |

终态更新与 job 状态、execution result、outbox terminal event 在同一事务内写入。

---

## 9. 边界

| 表 / 状态机 | P2.2 行为 |
|---|---|
| `workflow_runs` / `stage_runs` | 不写 |
| `review_records` | 不写 |
| `agent_sessions` / `tool_invocations` | 不写 |
| `audit_events` | 不读、不替代 hash chain |
| `publish_records` | 只由 publish-record API 与 publisher worker path 修改 |

---

## 10. 非目标

- 不做完整公众号运营平台。
- 不做素材上传 / 图文草稿管理 / 撤回执行。
- 不接 Publisher UI。
- 不默认开启真实发布。
- 不引入 Redis / MQ。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不删除/修改 `execution_results` 历史。

---

## 11. 验证

新增测试：

```text
apps/api/test/unit/publish-record.test.ts
apps/api/test/unit/publisher-real-runtime.test.ts
apps/api/test/integration/productization-p2-2-publish-records-api.test.ts
apps/api/test/integration/productization-p2-2-publisher-real-runtime-api.test.ts
```

覆盖：

- publish record 创建校验与状态机。
- `asset_version_id` 不可变 DB trigger。
- idempotency key 409。
- readiness 默认 blocked，显式 gate 后 ready。
- endpoint registry / channel allowlist / host allowlist。
- 缺审批、缺 publishRecordId、channel 未 allowlist 均在网络前阻断。
- publisher job 经 worker 成功发布并更新 `publish_records`。
- publisher endpoint 失败时 job failed 且 `publish_records.failed`。
- 不写 `review_records` / `workflow_runs`。
- result/outbox 不泄漏 secret。

---

## 12. 下一步

P2.2 后不再继续增加无限 Phase。建议进入 Final RC：

| 项 | 目标 |
|---|---|
| Production preflight | 汇总 Agent/MCP/Publisher/writeback readiness |
| 文档收口 | 最终生产候选报告与启用/回滚矩阵 |
| 验证收口 | API coverage、shared/web、typecheck、lint、migration roundtrip |
| 边界确认 | 默认关闭、allowlist、redaction、append-only ledger、publish version pinned |
