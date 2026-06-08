# Sprint-6 Agent Real Runtime Production Transport Gate（审计）

> 范围：在 Sprint-6 Agent Real Runtime Provider Credential MVP 之后，为 `agent:real` 的生产 transport 启用建立显式 gate。
> 一句话目标：**让 production transport 只有在 allowlist、credential resolver、quota/cost readiness 和 observability metadata 全部满足时才可进入 transport；当前仍不发真实外部网络。**

---

## 1. 阶段定位

| 项目 | 结论 |
|---|---|
| 是否新增 Phase 2.x | 否 |
| Sprint-6 路线 | Agent Real Runtime |
| 本阶段 | Production Transport Gate |
| 默认行为 | fail-closed |
| 外部网络 | 未发真实外部请求 |
| 生产 secret store | 未接入 |
| 控制面写入 | 未打开 |

---

## 2. 架构图（文字）

```text
AgentRealRuntime
  -> buildAgentRealProviderTransportRequest()
  -> RealAgentProviderHttpClient.send()
     -> validate request contains no plain secret
     -> production transport gate
        - real HTTP enabled
        - network enabled
        - endpoint mapped
        - host allowlist non-empty and matched
        - credential ref present
        - credential resolver present
        - quota policy ready
        - cost metrics ready
     -> credentialResolver.resolve()
     -> injected fake/local transport in tests only
  -> RuntimeResponse.metadata
     - productionTransportGate snapshot
     - providerRequestId
     - httpStatusCode
     - providerDurationMs
     - costEstimate.source=not_calculated
  -> execution_results / outbox_events

No real OpenAI call
No production secret store
No stage_runs/assets/reviews/audit_events write
```

---

## 3. 实现内容

| 文件 | 变更 |
|---|---|
| `apps/api/src/application/runtime/agent-real-production-transport-gate.ts` | 新增 gate snapshot 与 assert，稳定输出缺失项 |
| `apps/api/src/application/runtime/agent-provider-real-http-client.ts` | 在 transport 前执行 production gate；默认要求 credential resolver；保留显式非生产 passthrough 兼容开关 |
| `apps/api/src/application/runtime/agent-real-runtime.ts` | 成功 metadata 增加 gate snapshot、provider duration、HTTP status 与 cost source |
| `apps/api/src/domain/execution/runtime-safety.ts` | 脱敏白名单补充 `credentialResolverPresent`，避免布尔可观测字段被误脱敏 |
| `apps/api/test/unit/agent-real-production-transport-gate.test.ts` | 新增 gate 纯单测 |
| `apps/api/test/unit/agent-provider-real-http-client.test.ts` | 覆盖无 resolver production gate 在 transport 前阻断 |
| `apps/api/test/unit/agent-real-runtime.test.ts` | 覆盖 runtime metadata 中的 gate/observability 字段 |
| `apps/api/test/integration/sprint6-agent-real-runtime-credential-api.test.ts` | 覆盖 API/worker/ledger 闭环落库 metadata，且不持久化 secret material/ref |

---

## 4. Gate 规则

| 检查 | 缺失项 | 阻断点 |
|---|---|---|
| real HTTP enabled | `real_http_enabled` | transport 前 |
| network allowed | `allow_network` | transport 前 |
| allowlist 非空 | `network_allowlist` | transport 前 |
| endpoint mapped | `endpoint_mapped` | transport 前 |
| credential ref present | `credential_ref` | transport 前 |
| credential resolver present | `credential_resolver` | transport 前 |
| quota policy ready | `quota_policy` | transport 前 |
| cost metrics ready | `cost_metrics` | transport 前 |

`credential_resolver` 缺失映射为 `auth_failed` / non-retryable；网络或端点缺失映射为 non-retryable fail-closed 错误。

该规则会让旧的 disabled transport harness 默认失败点从“调用 disabled transport 后返回 `connection_failed`”前移到“production gate 发现缺少 credential resolver 并返回 `auth_failed`”。这是刻意的收紧：生产路径必须先满足凭证解析边界，才允许进入 transport。

---

## 5. 边界确认

| 边界 | 结果 |
|---|---|
| 真实外部 provider | 未调用 |
| 生产 secret material | 未读取 |
| Transport fake/local 注入 | 仅测试显式装配 |
| Runtime snapshot | 不含 plain secret |
| `execution_results` | 只追加 gate/observability metadata |
| `outbox_events` | 仍只记录 execution 事件 |
| `stage_runs` | 不写 |
| `content_assets` / `review_records` | 不写 |
| `audit_events` | 不写、不替代 |
| MCP / Publisher real adapter | 未启用 |

---

## 6. TDD 记录

| 步骤 | 结果 |
|---|---|
| RED 1 | `agent-real-production-transport-gate.test.ts` 引用不存在模块失败 |
| RED 2 | `RealAgentProviderHttpClient` 无 resolver 时仍调用 transport |
| RED 3 | `AgentRealRuntime` metadata 缺少 gate/provider duration |
| GREEN | 新增 gate 模块、HTTP client 前置检查、runtime metadata |
| 回归 | 相关 unit/integration 测试通过 |

---

## 7. 非目标

- 不新增 Phase 2.x。
- 不调用真实 OpenAI / LLM / MCP / Publisher。
- 不新增生产 secret store。
- 不读取 env secret material。
- 不打开 Workflow Stage Writeback。
- 不写 `stage_runs` / `content_assets` / `review_records` / `audit_events`。
- 不新增 DB migration。
- 不做 UI。

---

## 8. 下一步

| 路线 | 建议 |
|---|---|
| Sprint-6 Agent Real Runtime | 进入 provider response contract hardening：统一真实 provider 成功/错误 envelope 与 retry 分类 |
| Sprint-6 完成条件 | Agent real runtime 可在显式 fake/local production gate 下稳定闭环，且真实外部网络仍默认关闭 |
| 后续 Sprint-7 | 再考虑 Workflow Stage Writeback MVP，首次打开控制面写入必须单独审计 |
