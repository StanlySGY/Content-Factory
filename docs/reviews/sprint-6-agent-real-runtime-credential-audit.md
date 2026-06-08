# Sprint-6 Agent Real Runtime Provider Credential MVP（审计）

> 范围：在 Sprint-6 Agent Real Runtime MVP 应用级闭环之后，为 real HTTP client 增加显式注入的 transport-boundary credential resolver。
> 一句话目标：**secret material 只允许出现在 transport 调用内存边界，不进入 RuntimeRequest、HTTP request snapshot、execution_results、outbox_events 或控制面表。**

---

## 1. 阶段定位

| 项目 | 结论 |
|---|---|
| 是否新增 Phase 2.x | 否 |
| Sprint-6 路线 | Agent Real Runtime |
| 本阶段 | Provider Credential MVP |
| 默认行为 | 无 resolver 时保持旧行为：transport 只看到 `authorization_ref` |
| 显式测试装配 | `RealAgentProviderHttpClient(policy, transport, credentialResolver)` |
| 生产 secret store | 未接入 |
| 外部网络 | 未使用真实外部 I/O |

---

## 2. 架构图（文字）

```text
ExecutionWorker
  -> AgentRealRuntime
     -> buildAgentRealProviderTransportRequest()
        headersRef.Authorization = secret://llm/openai-compatible
        request snapshot = redacted/reference-only
     -> RealAgentProviderHttpClient.send()
        validate request: no plain secret material
        resolve endpoint + allowlist
        optional credentialResolver.resolve(ref)
          -> returns material only to client boundary
        transport.send({
          headers: { Authorization: "Bearer <material>" }
        })
     -> RuntimeResponse
        metadata/output contain no material
     -> execution_results + outbox_events
        contain no material and no credential ref

No stage_runs write
No content_assets/review_records write
No audit_events write
No production secret store
```

---

## 3. 实现内容

| 文件 | 变更 |
|---|---|
| `apps/api/src/application/runtime/credential-resolver.ts` | `ResolvedRuntimeCredential` 支持 `resolved: boolean` 与可选 `material`，用于 transport-only resolver |
| `apps/api/src/application/runtime/agent-provider-real-http-client.ts` | `RealAgentProviderHttpClient` 新增可选 `IRuntimeCredentialResolver`；有 resolver 时只把 material 注入传给 transport 的 headers |
| `apps/api/test/unit/agent-provider-real-http-client.test.ts` | 覆盖 material 只进 transport boundary、resolver mismatch 在 transport 前失败、默认无 resolver 行为不变 |
| `apps/api/test/integration/sprint6-agent-real-runtime-credential-api.test.ts` | 覆盖 app/API/worker/ledger/outbox 闭环：transport 看到 Bearer material，但 DB 快照不持久化 |

---

## 4. 边界确认

| 边界 | 结果 |
|---|---|
| RuntimeRequest payload | 不含 plain material |
| Agent provider request snapshot | 仍为 ref / redacted |
| Transport headers | 显式 resolver 测试下含 `Authorization: Bearer <material>` |
| RuntimeResponse | 不含 material |
| `execution_results` | 不含 material / Bearer / credential ref |
| `outbox_events` | 不含 material / Bearer / credential ref |
| Sprint-4 Control Plane | 不写 `stage_runs` / assets / reviews / audit |
| 默认行为 | 无 resolver 时旧测试保持通过 |
| mismatch resolver | transport 前失败，避免把错误 material 送出 |

---

## 5. TDD 记录

| 步骤 | 结果 |
|---|---|
| RED 1 | HTTP client 单测期望 transport 收到 `Bearer sk-test-transport-only`，实际仍为 `authorization_ref` |
| GREEN 1 | `RealAgentProviderHttpClient` 增加可选 resolver，并只在 transport boundary 替换 headers |
| RED 2 | worker/API 集成闭环增加 DB non-persistence 断言 |
| GREEN 2 | 调整测试输入避开既有 secret-like 文本校验，闭环通过 |

关键失败摘要：

```text
expected Authorization: Bearer sk-test-transport-only
received authorization_ref: secret://llm/openai-compatible
```

---

## 6. 非目标

- 不读取生产 secret。
- 不接真实 secret store。
- 不新增 env secret material。
- 不做真实外部 provider network call。
- 不启用 MCP / Publisher real adapter。
- 不写 `stage_runs` / `content_assets` / `review_records`。
- 不写 `audit_events`。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不新增 DB migration。
- 不做 UI。

---

## 7. 后续路线

| 路线 | 建议顺序 | 说明 |
|---|---:|---|
| Agent Real Runtime Production Transport Gate | 1 | 将当前 fake/local transport boundary 扩展为生产 transport 前的 allowlist、quota、cost、observability gate |
| Workflow Stage Writeback MVP | 2 | 首次打开控制面写入，必须证明 audit 同事务与幂等 |

