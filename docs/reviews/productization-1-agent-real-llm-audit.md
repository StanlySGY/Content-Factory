# Productization-1 Agent Real LLM External Call MVP（审计）

> 范围：Sprint-10 冻结后，经 owner 明确扩 scope，新增第一条产品化路线。
> 目标：让 `agent` execution job 在显式生产配置下可通过 OpenAI-compatible HTTP transport 调用外部 LLM；默认仍 fail-closed。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Productization-1 |
| 是否继续 Phase 2.x | 否 |
| 支持 job type | 仅 `agent` |
| MCP / Publisher | 不接真实外部调用 |
| 默认行为 | 仍 mock / blocked |
| 控制面回写 | 不新增，不自动写回 |

---

## 2. 架构图

```text
POST /api/execution/jobs (type=agent, credential_ref=env://...)
  -> execution_jobs pending

POST /api/execution/jobs/:id/tick
  -> ExecutionWorker
     -> MockRuntimeAdapterFactory(adapterMode=real, realAgentRuntime=...)
     -> AgentRealRuntime
        -> RealAgentProviderHttpClient
           -> EnvRuntimeCredentialResolver
              -> reads env material only at transport boundary
           -> FetchAgentProviderHttpTransport
              -> POST OpenAI-compatible /v1/chat/completions
        -> normalize OpenAI-compatible response
     -> same transaction:
        - execution_jobs success/failed
        - execution_results append-only
        - outbox_events terminal event

No secret material in DB snapshots
No stage_runs/assets/reviews writeback
No MCP / Publisher external call
```

---

## 3. 新增能力

| 文件 | 作用 |
|---|---|
| `apps/api/src/application/runtime/credential-resolver.ts` | 新增 `EnvRuntimeCredentialResolver`，仅解析 `env://VAR_NAME`，metadata 不包含 secret material |
| `apps/api/src/application/runtime/agent-provider-real-http-client.ts` | 新增 `FetchAgentProviderHttpTransport`，用 `fetch` 发 OpenAI-compatible POST，headers 不进入快照 |
| `apps/api/src/app.ts` | 在显式 env gate 满足时自动装配 `AgentRealRuntime + RealAgentProviderHttpClient + Fetch transport + Env resolver` |
| `apps/api/src/config/env.ts` | 新增 `AGENT_OPENAI_COMPATIBLE_ENDPOINT` 对应的非敏感 endpoint 配置 |
| `apps/api/test/integration/productization-agent-real-llm-api.test.ts` | 以注入 fetch 验证闭环，不进行外网调用 |

---

## 4. 启用条件

必须同时满足：

```text
EXECUTION_RUNTIME_MODE=real_enabled
EXECUTION_RUNTIME_ADAPTER_MODE=real
EXECUTION_ALLOW_REAL_RUNTIME=true
EXECUTION_ALLOW_NETWORK=true
EXECUTION_SECRET_STORE_ENABLED=true
EXECUTION_SECRET_INJECTION_ENABLED=true
EXECUTION_NETWORK_ALLOWLIST=<provider host>
AGENT_OPENAI_COMPATIBLE_ENDPOINT=https://<provider host>/v1/chat/completions
```

job payload 必须携带：

```json
{
  "credential_ref": {
    "provider": "openai_compatible",
    "key_ref": "env://CONTENT_FACTORY_OPENAI_KEY",
    "scope": "project"
  }
}
```

默认缺任一 gate 时，不会注册产品化 Agent real runtime。

---

## 5. Secret 边界

| 边界 | 规则 |
|---|---|
| env resolver | 只在 `resolve()` 返回给 HTTP client 时暴露 material |
| HTTP request snapshot | 仅保存 `authorization_ref`，不保存 Bearer token |
| fetch transport snapshot | 只保存响应 status/body/非敏感响应 headers |
| execution_results/outbox | 测试验证不包含 API key / Bearer |
| config env | endpoint/allowlist 可配置，secret value 不写入 `Env` 对象 |

---

## 6. 验证

新增测试：

```text
pnpm --dir apps/api exec vitest run \
  test/unit/env-runtime-credential-resolver.test.ts \
  test/unit/fetch-agent-provider-http-transport.test.ts \
  test/integration/productization-agent-real-llm-api.test.ts
```

覆盖：

- env credential resolver 成功/缺失/非 env ref fail-closed。
- fetch transport 真实 request shape、provider response snapshot、fetch failure 映射。
- buildApp 显式 env 装配 agent real runtime。
- worker closed-loop 写入 execution_results/outbox。
- secret material 不进入持久化快照。

---

## 7. 非目标

- 不做 MCP 真实 transport。
- 不做 Publisher 真实发布。
- 不自动注册 workflow writeback handler。
- 不做多轮 agent memory / tool-calling。
- 不引入 OpenAI SDK。
- 不引入 Redis / MQ。
- 不改 Sprint-4 Control Plane 状态机。
- 不把 secret material 落库或写入 outbox。

