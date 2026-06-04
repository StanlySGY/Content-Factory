# Agent 角色矩阵（Agent Roles）

> 文档类型：Agent 角色定义与映射矩阵
> 最高约束：`docs/00-project/project-constitution.md`
> 关联：`docs/04-agent/agent-architecture.md`（§5 支持范围 / §7 Session / §4.4 能力匹配）、`docs/07-workflow/content-workflow.md` §7（多 Agent 协作）、`docs/03-database/database-design.md` §5.12（`agent_profiles`）、`docs/04-agent/agent-capability-matrix.md`
> 用途：收敛 Agent 角色的职责、典型阶段、能力需求、输入输出与权限姿态，作为工作流阶段「按能力选 Agent」（agent §4.4）的依据。补全 agent §20 与 workflow §12 引用的角色矩阵。

## 1. 核心原则

- **角色是能力契约，不绑定 Provider**：阶段声明角色 + 能力需求，由 Gateway 按能力匹配选择 Agent（agent §4.4），工作流不写死具体 Provider（db §9.4 / workflow §11）。
- **角色不拥有业务规则**：Agent 是阶段执行者，业务规则在领域层与工作流定义（constitution / workflow §1）。
- **role 字段为开放字符串**：`agent_profiles.role`（db §5.12）为 `varchar(80)` 开放标识，db 中 `researcher/planner/writer/reviewer` 为示例，完整角色集以本矩阵为准。

## 2. 角色定义矩阵

角色源自 workflow §7.1，对齐内容生产九阶段（workflow §3）。

| 角色 | 职责 | 典型阶段 | 能力需求（关键）| 主要输出资产 |
| --- | --- | --- | --- | --- |
| Planner | 选题拆解、大纲规划、流程决策建议 | 选题、大纲 | 结构化推理、需求理解 | `topic_brief`、`outline` |
| Research | 搜索、整理、引用、事实核查 | 调研 | MCP 搜索工具、来源追溯 | `research_report` |
| Writer | 初稿生成、结构化写作 | 写作 | 长文生成、遵循大纲 | `draft` |
| Editor | 语言润色、风格统一 | 润色 | 文本改写、风格一致性 | `polished_draft` |
| Visual | 配图方案、图片提示词、Alt 文本 | 配图 | 多模态/视觉、MCP 图片工具 | `image_plan`、`image_asset` |
| Layout | 渠道排版、格式检查 | 排版 | 格式化、模板适配 | `layout_draft` |
| Reviewer | 质量、事实、风险、合规审查 | 审核 | 评估、质量门禁、不直接改稿 | `review_records`（非 content_assets）|
| Publishing | 发布准备、渠道提交、发布记录 | 发布准备 | 渠道适配、授权校验 | `publish_records`（非 content_assets）|

> 资产类型对齐 db §5.9 受控词表与 workflow §3；审核/发布产出落独立表（`review_records`/`publish_records`），不入 `content_assets`。

## 3. 角色 → 阶段映射（MVP 执行深度）

依 ADR-017 九阶段裁剪，MVP 执行深度分层：

| 阶段 | 主角色 | MVP 执行深度 |
| --- | --- | --- |
| 选题 | Planner（+ 人工）| 必建，纳入演示路径 |
| 调研 | Research | 必建 |
| 大纲 | Planner / Writer | 必建 |
| 写作 | Writer | 必建 |
| 润色 | Editor / Reviewer | 阶段保留，可配置可跳过 |
| 配图 | Visual（+ 人工）| 阶段保留，可配置可跳过 |
| 排版 | Layout（+ 插件 / 人工）| 阶段保留，可配置可跳过 |
| 审核 | Reviewer（+ 人工）| 必建 |
| 发布准备 | Publishing（+ 人工）| 必建 |

> MVP（S4）为壳层：Agent 执行为模拟（mock），真实多 Agent 自动执行为 MVP 后阶段（roadmap §2.2 / ADR-016）。角色定义先行，执行延后。

## 4. 角色 → 能力需求（用于 Agent 选择）

阶段声明能力需求，Gateway 从 `active` 且健康的 `AgentProfile` 候选中按能力匹配（agent §4.4）。各角色硬性能力需求：

| 角色 | 输入类型 | 输出类型 | 必需工具/MCP/Skill 范围 | 约束 |
| --- | --- | --- | --- | --- |
| Planner | 需求/调研摘要 | 结构化大纲/选题卡 | 通常无需写文件 | 只读上下文 |
| Research | 关键词/选题 | 调研报告 + 来源 | MCP 搜索类工具 | 外部内容标 `untrusted`（ADR-013）|
| Writer | 大纲/调研 | 长文初稿 | Platform 资产读写（受授权）| 不绕过已通过大纲 |
| Editor | 初稿/审查意见 | 润色稿 + 修改摘要 | 文本处理 | 不改变事实含义 |
| Visual | 润色稿/视觉风格 | 配图方案/图片 | MCP 图片工具 | 版权可追溯、高风险人工确认 |
| Layout | 润色稿/配图 | 排版稿 | 渠道模板（配置/插件）| 只处理呈现，不改事实 |
| Reviewer | 全部阶段资产 | 审查结论/门禁结果 | 质量门禁 Skill（见 quality-gates）| 不直接改终稿（workflow §7.4）|
| Publishing | 审核通过稿 | 发布记录 | 渠道适配/授权 | 发布显式授权 + 审计（ADR-022）|

> 候选筛选 → 优先级排序（匹配度/偏好/成功率/成本）→ 回退策略 → 可解释（记录候选集与落选原因），均见 agent §4.4。

## 5. 角色与权限姿态

- **最小权限**：角色仅获当前阶段必要的 Tool/Skill/MCP 范围与文件/网络权限（agent §15 / mcp §8）。
- **写权限**：默认只读；仅 Writer/Editor 等在阶段显式授权时开放受限写入；受全局约束的 Provider（Codex/Gemini）强制只读（agent §9.4，见能力矩阵）。
- **高风险**：Visual 的版权风险、Publishing 的外部发布为高风险动作，须风险策略 + 人工确认（ui §20 / mcp §8.4）。
- **审查独立性**：Reviewer 只产出结论与建议，不直接修改最终内容（workflow §7.4）。

## 6. 数据映射

| 角色概念 | 数据表/字段 |
| --- | --- |
| Agent 角色配置 | `agent_profiles.role`（db §5.12，开放字符串）|
| 角色能力声明 | `agent_profiles.capability_schema` |
| 角色约束/输出要求 | `agent_profiles.constraint_schema` |
| 角色执行实例 | `agent_sessions`（db §5.19）|
| 角色阶段绑定 | `stage_runs.agent_profile_id`（db §5.7，FK 见 ADR-020）|

## 7. 关联文档

- Agent 架构与能力匹配：`docs/04-agent/agent-architecture.md`
- Provider 能力矩阵：`docs/04-agent/agent-capability-matrix.md`
- 多 Agent 协作与并行汇聚：`docs/07-workflow/content-workflow.md` §7
- 质量门禁 Skill：`docs/06-skill/quality-gates.md`
