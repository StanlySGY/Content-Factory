# Spike-001 审计包（Audit Package）

> 唯一对外审查文件 · 单文件即可完成审查
> 阶段：Spike-001 — Claude Adapter 链路验证（`AgentGateway → ClaudeAdapter → Claude Code`）
> 日期：2026-06-04 · 执行方式：Claude Code CLI headless 真实调用
> 原始来源（保留，未删除）：`docs/spikes/spike-001-claude-adapter.md`（设计）、`spike-001-result.md`（原始结果）、`spike-001-review.md`（评审分析）
> 本包为聚合视图；如有差异以来源文档为权威。

---

# Executive Summary

**结论：⚠️ CONDITIONAL PASS**

> 一句话：`AgentGateway → ClaudeAdapter → Claude Code` 链路真实打通，6/6 能力全部通过，统一 Adapter 抽象成立；但暴露 2 个 Major 契约调整点（**模型必须显式指定**、**getStatus 须 Adapter 自维护**），须在 S4 真实接入前固化，故为有条件通过而非完全通过。

| 维度 | 结果 |
| --- | --- |
| 链路打通 | ✅ 真实跑通（CLI headless）|
| 能力通过率 | 6 / 6 PASS |
| 契约可实现性（agent §4.2 九方法）| 7 ✅ / 2 ⚠️ / 0 ❌ |
| Critical 发现 | 0 |
| Major 发现 | 2（AF-1 模型必填、AF-2 getStatus 语义）|
| 真实成本 | ≈ $0.198（4 次成功调用，Haiku 4.5）|

---

# Environment

| 项 | 值 |
| --- | --- |
| Node | v22.19.0 |
| npm | 11.7.0 |
| Claude Code | CLI 2.1.162 |
| SDK 版本 | **未使用**（本次走 CLI headless 路径；Agent SDK `@anthropic-ai/claude-agent-sdk` 仍为设计态，未验证）|
| 模型 | `claude-haiku-4-5-20251001`（显式指定；默认 opus-4-8[1m] 因 1M 上下文返回 400）|
| 鉴权 | 订阅 OAuth（`ANTHROPIC_API_KEY` 未设置）|
| 运行环境 | Linux 6.6.114.1-microsoft-standard-WSL2（WSL2）|
| 工作目录 | `/tmp/spike-001`（scratch，不提交）|

---

# Capability Validation

| # | 能力 | 验证方式 | 证据 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | Prompt | `claude -p "<prompt>"` | prompt 送达，input_tokens 计入 | **PASS** |
| 2 | Response | JSON `result` 字段 | `result:"pong"`/`"OK"`/`"42"`，is_error=false | **PASS** |
| 3 | Session Create | JSON `session_id` | 多次生成有效 session_id（如 `3543e26a-…`）| **PASS** |
| 4 | Session Resume | `--resume <sid>` 跨进程 | 轮A记"42"→轮B独立进程 resume→`result:"42"`，同 session_id | **PASS** |
| 5 | History | transcript JSONL 检索 | `~/.claude/projects/-tmp-spike-001/<sid>.jsonl` 6 条有序 user/assistant | **PASS** |
| 6 | Streaming | `--output-format stream-json --verbose` | 14 事件流（init→assistant 增量→result `"1\n2\n3"`）| **PASS** |

> 关键证据（节选）：
> - 能力 3+2：`{"is_error":false,"result":"pong","session_id":"f78b2df7-…"}`
> - 能力 4：轮B `{"result":"42","session_id":"3543e26a-…"}`（resume 同 id，上下文跨进程保留）
> - 能力 6：14 行 stream-json，含 3 次 `api_retry`（瞬时自愈）
>
> 全部 6 项 **PASS**，无 PARTIAL/FAIL。

---

# Architecture Findings

| ID | 级别 | 发现 | 影响 |
| --- | --- | --- | --- |
| AF-1 | **Major** | 默认模型（opus-4-8[1m]）返回 API 400「请启用 1m 上下文」；须显式指定模型方可用 | Adapter 不能依赖 Provider 默认模型，启动前必须强制注入模型 |
| AF-2 | **Major** | CLI headless 两次调用间无活进程，`getStatus` 无 Provider 端实时查询接口 | 状态须由 Adapter 依流生命周期（init→running / result→completed / is_error→failed）+ 持久终态自维护；契约语义须澄清（=R3 抽象泄漏的具体形态，可补偿、非阻塞）|
| AF-3 | Minor | 每次调用自动加载 ~38–40k token 上下文（CLAUDE.md 自动发现），~$0.05/次、首次 ~58s | 违背最小上下文；生产 Adapter 须以 ContextPack 为唯一上下文、关闭自动发现（`--bare` 需 API Key）|
| AF-4 | Minor | 历史双存储：Claude Code 自身 JSONL transcript + 我方 agent_messages | `normalizeOutput` 须映射 transcript→agent_messages；应用侧为权威，Provider 为副本 |
| AF-5 | Minor | streaming 出现 3 次 `api_retry`（自愈）| Adapter 事件归一化须捕获 retry 并纳入可观测/审计 |
| AF-6 | Minor | `stream-json` 需配 `--verbose` | Adapter 启动参数固定项 |

> **0 Critical**。2 Major 均为「可补偿的契约调整」，非「无法实现」。

---

# Required Design Changes

> 仅记录，**不在本 Spike 执行**（遵守"不改设计文档"约束）；待文档维护窗口统一应用。

| 文档 | 章节 | 需修改内容 | 原因 |
| --- | --- | --- | --- |
| `agent-architecture.md` | §15.2 配置类型 | 模型配置升为**必填**，`validateConfig` 启动前校验 | AF-1 |
| `agent-architecture.md` | §4.2 / §7.3 / §16.2 | 澄清 `getStatus`：状态由 Adapter 依流生命周期+持久终态派生，非 Provider 实时查询 | AF-2 |
| `agent-architecture.md` | §9.4 / §6.2 | 明确 Adapter 以 ContextPack 为唯一上下文，关闭 Provider 端 CLAUDE.md 自动发现 | AF-3 |
| `agent-architecture.md` | §18 数据映射 | 补 transcript → `agent_messages` 映射约定 | AF-4 |
| `agent-capability-matrix.md` | §2 能力维度 | 「持久会话恢复」Claude Code 由 ⚠️ 上调为 ✅（已实证 resume 跨进程）| 能力 4 通过 |
| `decision-log.md` | ADR-021 | 状态更新为「已验证（CLI 路径）」；SDK 路径与第二 Provider 待验 | 本 Spike 完成 |

---

# Risk Reassessment

| 风险/决策 | 原评级 | 最新评级 | 依据 |
| --- | --- | --- | --- |
| **R3 抽象泄漏** | High | **Medium** | 6/6 能力通过，契约 7✅/2⚠️/0❌；缺口可补偿、非阻塞，但需固化契约修订（AF-1/AF-2）|
| **ADR-021 真实 Provider 端到端验证** | 计划（未执行）| **已验证（CLI）/ Low** | 真实跑通 Claude Code 全链路；SDK 路径与第二 Provider 仍待验，残余不确定性低 |
| RK-1 鉴权 | High | Low | 订阅 OAuth headless 成功 |
| RK-4 历史可取性 | 中 | 已澄清/Low | transcript 可读 + agent_messages 权威 |

> 未覆盖（残余风险，Spike-002 候选）：Agent SDK 路径、第二 Provider（Codex/Gemini）抽象一致性、persistent/background 长活会话的 getStatus/心跳、WSL 路径沙箱专项。

---

# Git Summary

| 项 | 内容 |
| --- | --- |
| 新增文件 | `docs/spikes/spike-001-claude-adapter.md`（设计）、`docs/spikes/spike-001-result.md`（原始结果）、`docs/spikes/spike-001-review.md`（评审）、`docs/reviews/architecture-audit-package.md`（Sprint 0 遗留）、`docs/reviews/spike-001-audit-package.md`（本聚合包）|
| 修改文件 | 无（未修改任何既有设计文档；仅读取）|
| Commit ID（执行产物）| `24c775d` — 设计/结果/评审 + Sprint 0 审计包 |
| Commit Message（产物）| `docs(spike-001): execute claude adapter validation; add design, raw result, review` |
| Commit（本审计包）| 紧随其后的聚合提交 `docs(spike-001): add aggregate audit package`（哈希见提交记录）|

> scratch 验证日志（`/tmp/spike-001/*.json|*.jsonl`）按设计不提交；关键证据已内嵌 `spike-001-result.md`。

---

# Final Recommendation

| 决策 | 结论 | 依据 |
| --- | --- | --- |
| 是否允许 **Spike-002** | ✅ 允许（推荐）| 验证残余项：SDK 路径、第二 Provider（Codex/Gemini）抽象一致性、persistent/background 会话 getStatus；为 S4 真实多 Agent 接入收口 R3 |
| 是否允许 **Sprint-1** | ✅ 允许 | S1（users/projects/content_tasks/audit_events + 任务 CRUD）不依赖 Agent 执行；Spike 发现喂入 S4，不阻塞 S1 |

**推荐下一步（并行）**：

1. **进入 Sprint-1**：按 `development-roadmap.md` §4 交付任务模型；启动日先确认技术栈（ADR-019）并落地审计哈希链 + RLS（ADR-008/009）。
2. **文档维护窗口**：应用本包「Required Design Changes」6 项（重点 AF-1 模型必填、AF-2 getStatus 语义），并更新 ADR-021 状态。
3. **S4 真实接入前**：执行 Spike-002（SDK 路径 + 第二 Provider + persistent 会话），将 R3 由 Medium 收口至 Low，再固化 ClaudeAdapter 契约。

> 裁决回链：本包结论应更新 `pre-development-checklist.md` §1.4 R3 项（High→Medium，部分验证）与 `decision-log.md` ADR-021（已验证 CLI 路径）——于文档维护窗口处理。
