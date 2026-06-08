# Sprint-6 Agent Real Runtime Provider Response Contract Hardening（审计）

> 范围：在 Sprint-6 Agent Real Runtime MVP、Credential Boundary、Production Transport Gate 之后，
> 固化 `agent:real` 的 OpenAI-compatible provider response envelope。
> 一句话目标：**让成功/错误/畸形 provider 响应都落入稳定、可观测、可测试的 contract；当前仍不调用真实外部网络。**

---

## 1. 阶段定位

| 项目 | 结论 |
|---|---|
| 是否新增 Phase 2.x | 否 |
| Sprint-6 路线 | Agent Real Runtime |
| 本阶段 | Provider Response Contract Hardening |
| 外部网络 | 未发真实外部请求 |
| 生产 secret store | 未接入 |
| DB migration | 无 |
| 控制面写入 | 未打开 |

---

## 2. 架构图（文字）

```text
AgentRealRuntime
  -> IAgentProviderHttpClient.send()
     -> fake/local injected transport in tests
     -> OpenAI-compatible raw success/error/malformed response
  -> openai-compatible-schema normalizer
     -> success envelope
        - schemaVersion
        - provider / model
        - providerResponseId / providerRequestId
        - finishReason
        - output.text
        - tokenUsage
     -> error envelope
        - schemaVersion
        - provider
        - httpStatusCode
        - providerErrorCode / providerErrorType
        - runtimeErrorType
        - retryable
        - providerRequestId
     -> malformed success
        - validation_error
        - retryable=false
        - providerResponseContract error envelope
  -> RuntimeResponse
     -> output.result.text remains compatible
     -> metadata.providerResponseContract
  -> execution_results / outbox_events

No real provider call
No production secret material
No stage_runs/assets/reviews/audit_events write
```

---

## 3. Contract 字段

### Success envelope

| 字段 | 说明 |
|---|---|
| `schemaVersion` | 固定为 `1` |
| `provider` | 固定为 `openai_compatible` |
| `model` | provider 原始响应模型 |
| `providerResponseId` | provider 原始响应 id |
| `providerRequestId` | provider request id，可来自 provider metadata |
| `finishReason` | 第一条 choice 的 finish reason，缺失为 `null` |
| `output.text` | 兼容既有 `output.result.text` |
| `tokenUsage` | `promptTokens` / `completionTokens` / `totalTokens` |

### Error envelope

| 字段 | 说明 |
|---|---|
| `schemaVersion` | 固定为 `1` |
| `provider` | 固定为 `openai_compatible` |
| `httpStatusCode` | provider HTTP status |
| `providerErrorCode` | provider 原始错误 code；畸形成功响应为 `malformed_response` |
| `providerErrorType` | 归一化 provider error type |
| `runtimeErrorType` | 归一化 execution runtime error type |
| `retryable` | 稳定 retry 分类 |
| `providerRequestId` | provider request id，可空 |

---

## 4. 错误分类

| 输入 | provider/runtime 分类 | retryable |
|---|---|---|
| HTTP 429 | `rate_limited` | true |
| HTTP 408 或 code 含 timeout | `timeout` | true |
| HTTP 401 / 403 | `permission_denied` | false |
| HTTP 400-499 | `validation_error` | false |
| HTTP 500+ | `external_unavailable` | true |
| 其他未知 | `unknown` | true |
| 200 但 success body malformed | `validation_error` | false |

---

## 5. 实现内容

| 文件 | 变更 |
|---|---|
| `apps/api/src/application/runtime/openai-compatible-schema.ts` | 新增 success/error envelope；新增 malformed success error envelope builder；补 retryable 分类 |
| `apps/api/src/application/runtime/agent-real-runtime.ts` | 成功 metadata 写入 `providerResponseContract`；malformed success 映射为 non-retryable validation error 并保留 contract 摘要 |
| `apps/api/src/domain/execution/runtime-safety.ts` | token usage 字段加入脱敏白名单，避免可观测指标被误脱敏 |
| `apps/api/test/unit/openai-compatible-schema.test.ts` | 覆盖 success envelope、error envelope、429/408/403/400/5xx 分类 |
| `apps/api/test/unit/agent-real-runtime.test.ts` | 覆盖 success metadata contract 与 malformed success contract error |
| `apps/api/test/integration/sprint6-agent-real-runtime-credential-api.test.ts` | 覆盖 API/worker/ledger 闭环中的 `execution_results.responseSnapshot.metadata.providerResponseContract` |

---

## 6. TDD 记录

| 步骤 | 结果 |
|---|---|
| RED 1 | `openai-compatible-schema.test.ts` 先要求 success/error envelope，旧实现缺字段失败 |
| RED 2 | `agent-real-runtime.test.ts` 先要求 runtime metadata.providerResponseContract，旧实现缺字段失败 |
| RED 3 | malformed success body 要求 non-retryable validation_error 且带 error envelope，旧实现丢失 provider contract metadata |
| GREEN | schema normalizer、runtime success metadata、malformed success mapping 补齐 |
| 相关回归 | 14 passed / 4 files |

---

## 7. 边界确认

| 边界 | 结果 |
|---|---|
| 真实 OpenAI / LLM / MCP / Publisher 调用 | 未调用 |
| 生产 secret material | 未读取、未落库 |
| credential ref | 不写入 provider response contract |
| `execution_results` | 只追加 sanitized response snapshot |
| `outbox_events` | 沿用 execution 事件，不消费外部系统 |
| `stage_runs` | 不写 |
| `content_assets` / `review_records` | 不写 |
| `audit_events` | 不写、不替代 |
| DB migration | 未新增 |
| UI | 未改 |

---

## 8. 非目标

- 不新增 Phase 2.x。
- 不接真实外部 provider。
- 不读取生产 secret。
- 不新增 secret store。
- 不实现 MCP tool calling。
- 不打开 Workflow Stage Writeback。
- 不写 `stage_runs` / `content_assets` / `review_records` / `audit_events`。
- 不修改 Sprint-4 Control Plane 状态机。
- 不做 UI 改造。

---

## 9. Sprint-6 收束说明

Provider response contract hardening 完成后，Sprint-6 的 Agent Real Runtime 已具备：

- 默认 fail-closed；
- 显式 fake/local transport closed-loop；
- credential material transport-only；
- production transport gate；
- 稳定 provider response envelope；
- ledger/outbox 可观测；
- 不触碰 Sprint-4 Control Plane。

下一步不再追加 Phase 2.x。若继续开发，应在有限 Sprint 中选择：

| 下一 Sprint | 内容 |
|---|---|
| Sprint-7 | MCP Runtime Safety MVP |
| Sprint-8 | Publisher Runtime MVP |
| Sprint-9 | Workflow Stage Writeback MVP，首次打开控制面写入 |
