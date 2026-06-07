# Sprint-5 Execution Layer Design — Control Plane → Data Plane Bridge

> 只读架构设计，无代码/DB 实现。基线：Sprint-4 Control Plane（`95b0d62`，已冻结）+ Sprint-5 handoff（`5302e43`）。
> 目标：定义真实执行层（Data Plane）如何接入现有 Mock-first 控制平面，**不回改 Sprint-4**。

---

## 0. 关键问题：当前系统为什么「不能直接做 real execution」？

Sprint-4 的每一次写入都遵循同一范式（db §10.1）：

```
runInProject(db, projectId, async (tx) => {
   ...repo 写入（同一 PG 事务）...
   recordAudit(tx, ...)        // 同事务审计（哈希链）
})  // 单事务提交或全回滚
```

真实执行（LLM 调用、MCP transport、对外发布）有四个属性，与该模型**根本冲突**：

1. **长耗时**：LLM/工具调用以秒~分钟计。塞进 `runInProject` 会让 PG 事务持有连接与行锁直到调用返回 → 连接池耗尽、`statement_timeout` 中止、审计哈希链串行点争用。
2. **外部副作用不可回滚**：LLM 已生成、MCP 已执行、文章已发布后，DB 事务回滚**无法撤销外部动作** → 出现「DB 回滚但副作用已发生」的不一致。
3. **易失败**：若审计与执行同事务，执行失败触发回滚，会把**本应记录失败的 trace 一并回滚**——失败不可观测。
4. **生命周期不匹配**：append-only 的 `agent_sessions`/`tool_invocations` 当前在插入时即写**终态**；真实执行需要 `pending→running→success/failed` 的可变生命周期。

**结论**：真实执行必须从请求事务中解耦——异步化（job queue + outbox），并用**可变的执行作业记录**承载生命周期、**不可变 append-only 记录**承载最终结果。这是本设计的中枢。

---

## 1. Runtime Layer 总体架构

```
┌────────────── CONTROL PLANE（Sprint-4，不变）──────────────┐
│ Config / Workflow 状态机 / Review / Asset / 项目隔离 / 权限 │
│ 写入 = 同步单事务 + 同事务审计                              │
└───────────────┬────────────────────────────────────────────┘
                │ 触发执行：在状态变更同事务内写 OUTBOX 一行（不直接调用执行）
                ▼
        ┌─────────────── EXECUTION QUEUE ───────────────┐
        │ outbox relay → execution_jobs（可变，SKIP LOCKED 拉取）│
        └───────────────┬───────────────────────────────┘
                        ▼
        ┌─────────────── RUNTIME ADAPTERS ──────────────┐
        │ IAgentRuntime / IMCPRuntime / IPublisherRuntime │
        │            { MockAdapter | RealAdapter }        │
        └───────────────┬───────────────────────────────┘
                        ▼
              EXTERNAL SYSTEMS（LLM API / MCP servers / 公众号平台）
                        │ 完成后（独立异步事务）
                        ▼
        append-only 结果 + 审计：agent_sessions / tool_invocations / publish_records / audit_events
```

执行入口（Control Plane 侧只「请求」不「执行」）：
- **Agent**：stage_run 需 Agent 产出时 → 请求 Agent 执行作业。
- **MCP**：工具调用请求 → MCP 执行作业。
- **Publisher**：review approved 的 asset_version → 发布作业。

**mock → real 替换**：控制平面只依赖 Runtime *端口*；当前 `AgentRuntimeMockService`/`McpRuntimeMockService` 降级为 `MockAdapter`，真实实现为 `RealAdapter`，经配置/DI 切换。Mock 保留为测试/降级适配器。

---

## 2. Execution Flow（三条执行链）

### A. Agent Execution Flow
```
agent_profile(active) ──► [Control] 创建 execution_job(pending,kind=agent) + outbox（同事务）
   ► relay ► queue ► worker 取(running)
   ► IAgentRuntime.execute(profile_snapshot, input)   // 真实 LLM / tool-calling
   ► 完成（异步事务）：append agent_session(result) + 若调用工具则 append tool_invocation + audit + job→success/failed
```

### B. MCP Execution Flow
```
mcp_tool(enabled, server active) ──► [Control] 创建 execution_job(pending,kind=mcp) + outbox
   ► worker(running) ► IMCPRuntime.invoke(server endpoint, manifest, request)   // stdio/HTTP/SSE/WS
   ► 完成：append tool_invocation(request/response_snapshot, status) + audit(tool_invocation.created) + job 终态
```

### C. Publisher Flow（依赖未交付的 Publisher 控制平面）
```
asset_version + review approved ──► [Control] 创建 execution_job(pending,kind=publish) + outbox
   ► worker(running) ► IPublisherRuntime.publish(asset_version, target)   // 公众号等外部平台
   ► 完成：append publish_record(锚 asset_version_id, db §5.21) + audit + job 终态
```
> 注：Publisher 需先补 Sprint-4.3 控制平面（publish_records 表 + 配置/审批），方可接入本流。

---

## 3. 异步执行架构（关键）

### 3.1 Job Queue（必须）
- **DB-backed 作业表 `execution_jobs`**（本栈以 Postgres 为中心，零新基础设施）：worker 以 `SELECT … FOR UPDATE SKIP LOCKED` 拉取，避免外部 MQ 依赖。
- 字段（设计，非实现）：`id, project_id, kind(agent|mcp|publish), subject_ref, payload(jsonb), status, attempt_count, idempotency_key, locked_at, created_at, updated_at`。

### 3.2 Outbox Pattern（必须）
- 控制平面在**状态变更同事务**内写一行 outbox（如「stage 进入待执行」），relay 进程将其投递为 execution_job。
- 解决**双写不一致**：避免「状态已提交但作业丢失」或「作业已发但状态回滚」。

### 3.3 Execution Status Model
- **可变作业**：`execution_jobs.status`：`pending → running → success | failed`（+ `retry`）。承载生命周期。
- **不可变结果**：`agent_sessions`/`tool_invocations`/`publish_records` 仍 append-only，于**完成时一次性写终态**。
- 二者分工：作业表（control，可变）驱动流程；结果表（trace，不可变）记录事实。**append-only 不变量得以保留**。

### 3.4 为什么不能用当前同步事务模型
见 §0：长耗时锁事务、外部副作用不可回滚、失败 trace 被回滚、append-only 与生命周期不匹配。同步模型对*控制平面*正确，对*执行*致命。

---

## 4. Runtime Adapter 设计（Ports & Adapters）

```ts
// 端口（控制/worker 仅依赖此抽象）
interface IAgentRuntime   { execute(snapshot, input): Promise<AgentResult> }
interface IMCPRuntime     { invoke(server, manifest, request): Promise<ToolResult> }
interface IPublisherRuntime { publish(assetVersion, target): Promise<PublishResult> }
```
- **MockAdapter**（现状行为：固定快照、本地判定）实现各端口 → 保留为测试/降级。
- **RealAdapter**：`LlmAgentRuntime`（LLM+tool-calling）、`McpTransportRuntime`（stdio/HTTP/SSE/WS）、`WeChatPublisherRuntime`（外部 API）。
- 选择经配置/DI；worker 注入对应 adapter。控制平面与结果表**不感知** Mock/Real 差异。

---

## 5. 系统改造路径（分阶段）

| Phase | 内容 | 验收 |
| --- | --- | --- |
| **Phase 1（最小改造）** | 新增 `execution_jobs`（可变）+ `outbox`（append-only）+ worker 骨架 + Runtime 端口接口；**仅 MockAdapter** | 异步管道端到端跑通（确定性 mock）；控制平面不回改；append-only 不变量保持 |
| **Phase 2（接入真实执行）** | `LlmAgentRuntime` + `McpTransportRuntime`（按端口替换 Mock）；超时/重试/隔离 | Agent 真实产出、MCP 真实调用，结果落 append-only + audit |
| **Phase 3（产品化）** | 先补 Sprint-4.3 Publisher 控制平面 → `WeChatPublisherRuntime` + 外部集成 | Task→…→真实发布闭环 |

> Phase 1 是「先建异步骨架、仍用 Mock」——风险最低、可独立验收，把执行边界正式实化为「队列 + 端口」。

---

## 6. 风险分析

| 风险 | 说明 | 对策 |
| --- | --- | --- |
| **同步事务崩溃** | 执行入 `runInProject` → 连接池耗尽、锁持有、statement_timeout、审计哈希链争用 | 异步化（§3）；执行绝不入请求事务 |
| **MCP/LLM 超时** | 外部调用不可控耗时/挂起 | worker 级超时 + 熔断 + 重试上限；非请求级 |
| **execution↔audit 一致性** | 执行异步，但「完成」审计须在**异步完成事务**内 append；哈希链 `sequence_no` 跨并发 writer 争用 | 完成结果 + 审计同一异步事务；评估**按 subject 分链**或串行化追加，降低全局序列争用 |
| **幂等性** | 队列至少一次投递 → 重复执行 | `execution_jobs.idempotency_key` + 结果表唯一约束去重；worker 幂等 |
| **retry / failure recovery** | 瞬时失败需重试、毒丸需隔离 | `attempt_count` + 退避；终态失败 → job=failed + append 失败结果 + audit；dead-letter |
| **外部副作用不可回滚** | publish/工具执行已发生但后续写库失败 | 先执行后记录 + 幂等键；发布走「准备记录→确认」两段，避免重复对外动作 |

---

## 7. 架构图（汇总）

```
Control Plane (Sprint-4, 不变)
        │  状态变更 + OUTBOX（同事务）
        ▼
Execution Queue  (outbox relay → execution_jobs, SKIP LOCKED, status: pending→running→success/failed)
        │
        ▼
Runtime Adapters (IAgentRuntime / IMCPRuntime / IPublisherRuntime ; Mock | Real)
        │
        ▼
External Systems (LLM API / MCP servers / 公众号平台)
        │  完成（异步事务）
        ▼
Append-only 结果 + 审计 (agent_sessions / tool_invocations / publish_records / audit_events)
```

---

## 8. 测试结果（仅引用，未修改）
- Sprint-4 Control Plane：已冻结 `95b0d62` ✔ ｜ Agent/MCP/Workflow/Audit 稳定 ✔
- Publisher：未交付 ✔ ｜ 系统当前 Mock-first ✔

## 9. 裁决
**GO（设计阶段）** —— 设计明确：控制平面同步单事务模型不可承载真实执行，必须经 **outbox + job queue + 可变作业表（生命周期）+ 不可变结果表（trace）+ Runtime 端口** 桥接到数据平面。Phase 1 先建异步骨架（仍 Mock），Phase 2 替换真实 adapter，Phase 3 产品化。Sprint-4 控制平面/状态机/审计/隔离/append-only **全部复用、不回改**。本文为设计，不含实现。
