# Sprint-5 Phase 2 — Real Adapter Entry Checklist

> 接入真实 Agent / MCP / LLM / Publisher 前的准入清单。标注每项：**[已满足] Phase 1.x 已就位 / [缺失] 待补 / [必须] 接真实外部系统前硬性前置**。
> 基线：Phase 1.x 冻结（`fc001fb`→`32fd423`，见 release-gate 文档）。

## 1. 真实 Agent Runtime 准入

- [缺失][必须] `IAgentRuntime` 的真实实现（LLM 调用 + tool-calling），替换 `AgentMockRuntime`。
- [已满足] Runtime Contract（RuntimeRequest/Response envelope、错误分类、retryable、durationMs）已冻结，Real Adapter 直接产出真实 RuntimeResponse。
- [已满足] 结果落点（execution_results 账本）与 outbox 关联（result_id）已就位。
- [缺失][必须] LLM 错误 → RuntimeErrorType 的真实映射表（限流/超时/鉴权/内容策略）。
- [缺失] 多轮会话 / agent_messages 模型（若需要）。

## 2. 真实 MCP Runtime 准入

- [缺失][必须] `IMCPRuntime` 真实实现：stdio / HTTP / SSE / WS transport + 工具分发，替换 `MCPMockRuntime`。
- [已满足] Adapter Factory 路由（getRuntime(type)）作为替换点。
- [缺失][必须] MCP `risk_level` 驱动的隔离/确认策略接入（见 §7）。
- [缺失] transport 连接生命周期管理、超时/取消。

## 3. Publisher Runtime 准入

- [缺失][必须] `IPublisherRuntime` 真实实现（外部平台发布）。
- [缺失][必须] publish_records 数据模型（db §5.21，当前缺失）+ 版本锚定。
- [缺失] preview / 发布准备 / 审批流。
- 注：**Publisher 仍未交付，且与 Real Adapter 是不同产品线，不得混淆**（见 roadmap）。

## 4. Runtime Isolation 前置

- [缺失][必须] 真实超时**中断**（AbortController / 进程取消）——Phase 1.7 仅 Mock 模拟超时，无真实中断。
- [缺失][必须] 资源限额（CPU/内存/时长/并发）。
- [缺失][必须] 沙箱 / 进程隔离（外部进程 MCP、不可信工具）。

## 5. Secret / Credential Policy 前置

- [缺失][必须] 凭证经引用注入（ADR-010），**不入库、不入日志、不入 result/request 快照**。
- [缺失][必须] 凭证按 `sensitivity_level` 作用域化（context_packs 已建模传播控制，ContextBuilder 为强制点）。
- [已满足] request_snapshot 当前仅含 Mock payload；接真实前须确保 secret 不落快照（审计点）。

## 6. Timeout / Retry / Rate Limit 策略

- [已满足] 确定性退避重试 + max_attempts + next_run_at；retryable 语义。
- [缺失][必须] 真实 rate limit 处理（rate_limited → 退避，区分供应商配额）。
- [缺失] 退避参数针对真实 runtime 压测定标（当前 1s–60s 为骨架默认）。

## 7. Manual Approval / High-risk Tool Confirmation

- [缺失][必须] MCP `risk_level=high` 工具的人工确认 / 强制沙箱闸门。
- [缺失] 审批态在 execution 侧的表达（当前 job 状态机仅 pending/running/success/failed，无 awaiting_approval）。

## 8. Sandbox / Process Isolation

- [缺失][必须] 外部进程 MCP 的进程隔离与崩溃遏制。
- [缺失] 网络出口策略（allowlist）。

## 9. Observability / Result Ledger 使用规范

- [已满足] execution_results 只追加账本 + 每 attempt 快照 + summary；outbox 事件流 + result_id 指针。
- [已满足] ops health 指标（stale / backlog / failed / latest_result_at）。
- [缺失] 真实 runtime 的指标维度（错误类型分布、耗时分位、成本）；账本归档/保留策略。

## 10. Rollback / Kill Switch

- [已满足] feature flag（EXECUTION_WORKER_ENABLED / OUTBOX_RELAY_ENABLED）默认关闭。
- [缺失][必须] Real/Mock Adapter 经 Factory 可即时切换（降级回 Mock）的 kill switch。
- [已满足] 无 DB 迁移的阶段可代码回滚；Real Adapter 接入须保证可快速停摆。

## 11. 结果回写（execution → Control Plane）

- [缺失][必须] relay 真实 handler：消费 result_id/subject，**幂等**回写控制平面（stage_runs/assets/reviews，经 ADR-006 状态机，不旁路）。
- [缺失][必须] relay 并发领取保护（claimed_at / 租约）——Phase 1.6 遗留。
- [缺失] at-least-once 投递的幂等对账（idempotencyKey 已就位，消费侧待建）。

## 12. 最小 Phase 2 Spike 建议

1. **Agent Real Adapter spike（最小闭环）**：单一 LLM provider 的 `IAgentRuntime` 实现 + 隔离层（超时中断 + 凭证作用域化）+ 错误映射；经 Bridge 创建 job → worker 真实执行 → 结果落账本。**不回写控制平面**（先证执行，再证回写）。
2. **Relay 回写 spike**：实现一个真实 handler，按 result_id/subject 幂等回写**单一** stage_run 状态（经状态机），含并发领取保护。
3. 两个 spike 独立验证后再合流；Publisher 单独立项，不混入。

---

## 已满足 vs 缺失 汇总

- **已由 Phase 1.x 满足**：Runtime Contract、Adapter Factory 替换点、结果账本 + 观测、退避重试/超时契约/stale 恢复、feature flag、ops 控制面 + runbook、控制平面隔离边界。
- **接真实外部系统前必须完成**：Runtime 隔离（真实超时中断/资源限额/沙箱）、secret/credential policy、真实错误映射、high-risk 确认闸门、kill switch、relay 真实回写 + 并发领取保护。
- **仍缺失（非 Real Adapter 阻塞，但需规划）**：Publisher + publish_records、审批态建模、账本归档、成本/指标维度。
