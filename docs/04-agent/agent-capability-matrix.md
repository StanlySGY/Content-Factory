# Agent 能力矩阵（Agent Capability Matrix）

> 文档类型：Provider 能力支持矩阵
> 最高约束：`docs/00-project/project-constitution.md`
> 关联：`docs/04-agent/agent-architecture.md`（§5 支持范围 / §9.4 原生工具治理 / §12 WSL / §15 配置）、`docs/04-agent/agent-roles.md`、`docs/00-project/decision-log.md`（ADR-003 开放 Provider 标识）
> 用途：定义 Claude Code、Codex、Gemini CLI、OpenCode 四个当前支持 Provider 的能力维度，作为能力匹配（agent §4.4）与 Agent Profile 配置（db §5.12）的参照。Provider 为开放字符串标识（ADR-003），本矩阵为当前内置集，新增 Provider 经 Adapter 注册补充。

## 1. Provider 概览

| Provider | 接入方式 | 主要用途 | 适配重点（agent §5.1）|
| --- | --- | --- | --- |
| Claude Code | CLI / SDK / harness | 规划、编码、审查、文档、复杂任务执行 | Session、Tool、Skill、MCP、文件上下文 |
| Codex | CLI / API wrapper | 后端实现、代码生成、测试建议 | 只读上下文、patch 输出、沙箱限制 |
| Gemini CLI | CLI | 前端、视觉、多模态、替代分析 | 命令行会话、文件输入、结构化输出 |
| OpenCode | CLI | 代码执行、编辑辅助、轻量 Agent 任务 | 会话进程、输出标准化、权限控制 |

## 2. 能力维度矩阵

> ✅ 支持 ／ ⚠️ 受限或条件支持 ／ ❌ 不支持或默认禁止。能力以 Adapter 声明的 `AgentCapability` 为准（agent §4.3），下表为内置默认基线。

| 能力维度 | Claude Code | Codex | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- |
| 接入方式 | CLI / SDK / harness | CLI / API wrapper | CLI | CLI |
| 文件写入 | ⚠️ 阶段授权可写 | ❌ 强制只读（§9.4）| ❌ 强制只读（§9.4）| ⚠️ 受权限控制 |
| Built-in Tool（原生工具）| ✅ | ⚠️ 受沙箱约束 | ⚠️ 受沙箱约束 | ⚠️ 受权限控制 |
| Platform Tool（经 Tool Router）| ✅ | ✅ | ✅ | ✅ |
| MCP 工具（经 MCPBridge→Gateway）| ✅ | ⚠️ 视配置 | ⚠️ 视配置 | ⚠️ 视配置 |
| Skill（经 SkillBridge）| ✅ | ⚠️ 视配置 | ⚠️ 视配置 | ⚠️ 视配置 |
| 流式输出 | ✅ | ⚠️ 视封装 | ✅ | ✅ |
| 结构化输出 | ✅ | ✅（patch/结构化）| ✅ | ⚠️ 经输出标准化 |
| 多模态/视觉 | ⚠️ 视模型 | ❌ | ✅ | ❌ |
| 持久会话恢复（`provider_session_ref`）| ✅ | ⚠️ 视封装 | ⚠️ 视封装 | ⚠️ 视封装 |
| WSL 运行 | ✅ | ✅ | ✅ | ✅ |
| 沙箱/权限治理（§9.4）| 进程层强制 | 进程层强制（只读）| 进程层强制（只读）| 进程层强制 |

> 文件写入：Codex/Gemini 受全局约束强制只读、禁止写文件系统（agent §9.4），由运行时（Process Runner/沙箱层/WSL Bridge）强制位置，不依赖 Agent 自律。

## 3. Provider → 内容生产角色适配

将 Provider 原生能力映射到内容生产角色（见 `agent-roles.md` §2）。⭐ 推荐主力 ／ ○ 可胜任 ／ —— 不适配。

| 角色 | Claude Code | Codex | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- |
| Planner（选题/大纲）| ⭐ | ○ | ○ | —— |
| Research（调研/核查）| ⭐ | ○ | ○ | —— |
| Writer（写作）| ⭐ | ○ | ○ | —— |
| Editor（润色）| ⭐ | ○ | ○ | —— |
| Visual（配图/多模态）| ○ | —— | ⭐ | —— |
| Layout（排版/格式）| ○ | ○ | ○ | ○ |
| Reviewer（审查/门禁）| ⭐ | ○ | ○ | —— |
| Publishing（发布准备）| ○ | —— | —— | ○ |

> 适配为默认建议，非硬绑定。最终由阶段能力需求 + 候选筛选 + 优先级排序决定（agent §4.4）；同一角色可切换不同 Provider（agent §2 可替换原则）。

## 4. 默认权限姿态

| 维度 | Claude Code | Codex | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- |
| 文件系统 | 阶段授权受限写 | 只读 | 只读 | 受限（按配置）|
| 网络 | 默认禁出网，授权放行 | 默认禁出网 | 默认禁出网 | 默认禁出网 |
| 命令执行 | 白名单 | 白名单（严格）| 白名单（严格）| 白名单 |
| 敏感数据 | 默认不可见 | 默认不可见 | 默认不可见（外部 Provider，受 sensitivity 传播限制）| 默认不可见 |

> `sensitivity_level=sensitive` 上下文默认禁止注入外部 Provider（含 Codex/Gemini），必经脱敏/裁剪（db §9.3 / ADR-013）。所有 Provider 权限经 `agent_profiles.permission_policy`（agent §14.2）与配置层级（agent §15.1）叠加取最小。

## 5. 配置映射

| 矩阵概念 | 数据/配置落点 |
| --- | --- |
| Provider 标识 | `agent_profiles.provider`（db §5.12，开放字符串）|
| 能力声明 | `agent_profiles.capability_schema` |
| 运行方式（cli/sdk/remote/wsl）| `agent_sessions.runtime`（db §5.19）|
| 持久会话句柄 | `agent_sessions.provider_session_ref` |
| 权限策略 | `agent_profiles.permission_policy`（agent §14.2）|
| 配置快照 | `agent_sessions.profile_snapshot`（db §9.4）|

## 6. 扩展（新增 Provider）

新增 Aider / Cursor Agent / RooCode 等按 agent §17 流程：实现 `AgentAdapter` → 声明开放 Provider 标识并注册 `AdapterRegistry` → 声明 `AgentCapability` 与权限模板 → 注册 Profile → 适配器测试。新增 Provider 在本矩阵追加一列，不修改业务代码（ADR-003）。

> 验证要求：依 ADR-021，S4 壳层前至少以 1 个真实 Provider（建议 Claude Code）跑通端到端链路，验证能力声明与抽象契约一致。

## 7. 关联文档

- Agent 架构：`docs/04-agent/agent-architecture.md`
- Agent 角色矩阵：`docs/04-agent/agent-roles.md`
- 决策记录：`docs/00-project/decision-log.md`
