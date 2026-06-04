# Spike-001 评审分析（Review）

> 类型：Spike 分析层（findings + 契约缺口 + 设计反馈 + 风险重估）
> 日期：2026-06-04
> 输入：`spike-001-result.md`（原始执行）、`spike-001-claude-adapter.md`（设计）
> 裁决汇总见：`docs/reviews/spike-001-audit-package.md`
> 说明：本文件不修改任何设计文档；设计变更仅作建议记录，待文档维护窗口处理。

## 1. 总体判断

`AgentGateway → ClaudeAdapter → Claude Code` 链路**真实打通**，6 项能力全部通过。统一 `AgentAdapter` 抽象（agent §4.2）在 Claude Code 上**基本成立**，但暴露 2 个 Major 契约调整点（模型必填、`getStatus` 语义），需在 S4 真实接入前固化。无 Critical。

→ 裁决：**CONDITIONAL PASS**（能力全通过 + 契约需小幅修订）。

## 2. 架构发现（Findings）

### AF-1（Major）默认模型不可用，模型必须显式指定
- **现象**：未指定 `--model` 时，默认模型（opus-4-8[1m]）返回 API 400「请启用 1m 上下文」；指定 `claude-haiku-4-5-20251001` 后正常。
- **影响**：Adapter 不能依赖 Provider 默认模型；`startSession`/`validateConfig` 必须强制注入模型。
- **契约映射**：agent §15.2「模型配置」当前为可选项之一，应升为**必填校验**。

### AF-2（Major）getStatus 无 Provider 端实时查询，须 Adapter 自维护
- **现象**：CLI headless 是「请求→响应→进程退出」模型；两次调用之间**无活进程**可查询状态。状态信息内嵌在每次结果（`is_error`/`stop_reason`/`terminal_reason`）与流式 `init/result` 事件中。
- **影响**：契约 `getStatus(session)`（agent §4.2）若假定「随时向 Provider 查会话状态」则不成立。状态须由 Adapter 依据**流生命周期 + 持久化终态**派生并维护（映射 agent §16.2：init→running，result→completed，is_error→failed）。`persistent`/`background` 会话（agent §7.2）若需长活进程级状态，须改用 Agent SDK 的 `ClaudeSDKClient`（本次未验证）。
- **结论**：这是 R3「抽象泄漏」的具体形态——**可补偿、非阻塞**，但契约语义须澄清。

### AF-3（Minor）上下文自动发现抬高成本，须隔离 ContextPack
- **现象**：每次调用加载 ~38–40k token（全局/项目 CLAUDE.md 自动发现 + 缓存创建），即便 prompt 仅 10 token，单次仍 ~$0.05、首次 ~58s。
- **影响**：违背「最小上下文」（agent §9.4/§6.2）。生产 Adapter 必须以 `ContextPack` 为唯一上下文，关闭 Provider 端 CLAUDE.md 自动发现。
- **约束**：`--bare` 可跳过自动发现，但要求 `ANTHROPIC_API_KEY`（OAuth 不可用）；故需在「API Key + --bare」与「OAuth + 受控上下文」间决策（关联 ADR-010、arch §14.3）。

### AF-4（Minor）历史双存储，须映射 transcript → agent_messages
- **现象**：Claude Code 自身以 JSONL transcript 持久化历史（cwd 编码路径 `~/.claude/projects/-tmp-spike-001/<sid>.jsonl`）。
- **影响**：我方 `agent_messages`（db §5.20）为应用侧权威；Provider transcript 为副本来源。`normalizeOutput` 须将 transcript/流事件映射为 `agent_messages`（role/sequence/content_type）。RK-4 由此澄清：**历史可取**，归属应用侧权威 + Provider 副本。

### AF-5（Minor）流式中出现 api_retry，须纳入可观测
- **现象**：streaming 调用出现 3 次 `system/api_retry`（瞬时，自动恢复，最终成功）。
- **影响**：Adapter 的事件归一化应捕获 retry 事件并计入可观测/审计，避免静默。

### AF-6（Minor）stream-json 需 --verbose
- **现象**：`--output-format stream-json` 需配 `--verbose` 方输出完整事件流。
- **影响**：Adapter 启动参数固定项，记入实现指引。

## 3. 契约逐项可实现性（对照 agent §4.2）

| 契约方法 | 可实现性 | 说明 |
| --- | --- | --- |
| provider() | ✅ | 返回 "claude_code" |
| discover() | ✅ | `claude --version` + 鉴权探测 |
| validateConfig() | ⚠️ | **须新增模型必填校验**（AF-1）|
| startSession() | ✅ | `claude -p` 启动，从 init/result 捕获 session_id |
| sendMessage() | ✅ | prompt 入参 / `--resume` 续轮 |
| stream() | ✅ | `--output-format stream-json --verbose` |
| stopSession() | ✅ | 进程级终止（CLI 单次调用自然退出）|
| getStatus() | ⚠️ | **须 Adapter 自维护**，非 Provider 实时查询（AF-2）|
| normalizeOutput() | ✅ | JSON/JSONL → AgentMessage；含 transcript 映射（AF-4）|

→ 9 方法中 **7 ✅ / 2 ⚠️ / 0 ❌**。抽象成立，2 处需补偿。

## 4. 设计变更建议（Required Design Changes，仅记录不执行）

| 文档 | 章节 | 变更 | 原因 |
| --- | --- | --- | --- |
| agent-architecture.md | §15.2 配置类型 | 模型配置升为**必填**，Adapter 启动前校验 | AF-1：默认模型 1m 上下文 400 |
| agent-architecture.md | §4.2 / §7.3 / §16.2 | 澄清 `getStatus` 语义：状态由 Adapter 依流生命周期+持久终态派生，非 Provider 实时查询 | AF-2：headless 两调用间无活进程 |
| agent-architecture.md | §9.4 / §6.2 | 明确 Adapter 须以 ContextPack 为唯一上下文，关闭 Provider 端 CLAUDE.md 自动发现 | AF-3：自动上下文抬高成本 |
| agent-architecture.md | §18 数据映射 | 补 transcript→agent_messages 映射约定 | AF-4：历史双存储 |
| agent-capability-matrix.md | §2 能力维度 | 「持久会话恢复」Claude Code 由 ⚠️ 上调为 ✅（已实证 resume 跨进程）| 能力 4 实证通过 |
| decision-log.md | ADR-021 | 状态更新为「已验证（CLI 路径）」；SDK 路径仍待验 | 本 Spike 执行完成 |

> 上述变更须在文档维护窗口统一应用（本 Spike 不改设计文档，遵守既定约束）。

## 5. 风险重估

| 风险 | 原评级 | 新评级 | 依据 |
| --- | --- | --- | --- |
| R3 抽象泄漏 | High | **Medium** | 6/6 能力通过，契约 7✅/2⚠️/0❌；缺口可补偿、非阻塞，但需固化契约修订 |
| ADR-021 真实 Provider 端到端验证 | 计划（未执行）| **已验证（CLI）** | 真实跑通 Claude Code 全链路；SDK 路径与第二 Provider 仍待验 |
| RK-1 鉴权 | High | Low | 订阅 OAuth 可用；headless 成功 |
| RK-4 历史可取性 | 中 | 已澄清 | transcript 可读 + 应用侧 agent_messages 权威 |

## 6. 未覆盖项（诚实声明）

- **Agent SDK 路径未验证**：本次仅验 CLI；SDK（`@anthropic-ai/claude-agent-sdk`）的 `query()`/`ClaudeSDKClient` 仍为设计态。
- **第二 Provider 未验证**：Codex/Gemini CLI 的抽象一致性未测（关系到 R3 的跨 Provider 泛化）。
- **持久/后台会话（persistent/background）未验证**：长活进程级 `getStatus`/心跳/孤儿清理（agent §7.4）未测。
- **WSL 专项**：本次在 WSL 内运行成功，但路径沙箱/进程树终止/编码（agent §12.5）未做专项压力验证。
- 以上构成 Spike-002 的候选范围。
