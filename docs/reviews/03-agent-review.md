# Agent Review

> 审查域：03 Agent　|　规则：[00-review-master.md](./00-review-master.md)
> 严重级别映射（对齐主控文档 §3）：Major ≈ High，Minor ≈ Medium/Low。
> 问题编号前缀：AGENT。

## 审查时间

- 日期：2026-06-03
- 审查者：首席架构师（Claude）
- 轮次：第 1 轮

## 审查范围

- 主审：`docs/04-agent/agent-architecture.md`
- 交叉核对：
  - `docs/00-project/project-constitution.md`（含全局沙箱约束：严禁 Codex/Gemini 写文件系统）
  - `docs/02-architecture/system-architecture.md`
  - `docs/05-mcp/mcp-architecture.md`
  - `docs/03-database/database-design.md`
- 重点维度：扩展性、WSL 兼容、Session 设计、Tool 设计、MCP 绑定、Skill 绑定、Agent 生命周期。
- 审查方式：仅文档静态审查。

## 重点领域评估

| 重点 | 结论 | 关键发现 |
| --- | --- | --- |
| 扩展性 | 有缺口 | Adapter 注册/发现机制未定义；Provider 枚举与数据驱动扩展张力（AGENT-005）；能力匹配规则缺失（AGENT-006） |
| WSL 兼容 | 有风险 | 执行宿主假设未定 + 密钥跨边界传递未规定（AGENT-007）；编码/进程树终止未涉及（AGENT-011） |
| Session 设计 | 有缺口 | 依赖不存在的持久化表 + 缺 provider 原生会话句柄（AGENT-004）；超时/并发分组未定义（AGENT-010） |
| Tool 设计 | 不通过 | 原生 Built-in Tool 治理缺失，§9.1 与 §9.3 自相矛盾（AGENT-001，Critical） |
| MCP 绑定 | 不通过 | 绕过 MCPGateway，且存在双路径，违反 MCP 网关隔离（AGENT-002） |
| Skill 绑定 | 有缺口 | 双路径 + 依赖未设计的 Skill 体系 + 命名漂移（AGENT-008） |
| Agent 生命周期 | 有缺口 | §6 与 §16 状态词表不一致，混淆 Profile 与 Session（AGENT-003） |

## Critical Issues

### AGENT-001 Agent 原生 Tool 无治理机制，且 §9.1 与 §9.3 自相矛盾

- 级别：Critical
- 位置：`agent-architecture.md` §9.1 Tool 分类（Built-in Tool：Agent 自带读写文件、执行命令）对比 §9.3 原则（"Agent 不直接访问业务内部实现，只通过 Tool Router 调用受控能力"）；并对比宪法/全局约束"严禁 Codex/Gemini 对文件系统写操作"、§19 安全要求"Agent 所有命令执行必须受权限策略限制"
- 问题：
  - §9.1 承认 Agent 拥有自带的文件/命令工具，这类工具在 Agent 进程内执行，**天然不经过 Tool Router 与 Permission Policy**；而 §9.3 又声称所有能力都经 Tool Router 受控。两者直接矛盾。
  - 文档未给出任何机制约束 Agent 原生工具：沙箱、允许目录、命令白名单、只读挂载、网络隔离等。
  - 这意味着设计当前**无法保证**宪法要求的权限/沙箱控制（如禁止 Codex 写文件系统），存在重大安全边界缺口。
- 影响：阻断性安全风险。Agent 系统的控制平面在最关键的"原生工具"维度失效，所有上层权限/审计可被 Agent 自带工具绕过。
- 处置：必须在进入 Agent 运行时开发前补齐设计。

## Major Issues

### AGENT-002 MCP 绑定绕过 MCPGateway 且存在双路径

- 级别：Major
- 位置：§11.1 集成结构（`MCPBridge --> MCPRegistry / RiskPolicy / MCPServer`）、§9.2 Tool 调用链路（`ToolRouter --> MCP`）对比 `mcp-architecture.md` §2（"业务层、Agent、Skill、插件不得直接连接 MCP Server"，统一经 MCPGateway）
- 问题：
  - Agent §11.1 让 MCPBridge 直接连 MCPRegistry / RiskPolicy / MCPServer，未经过 MCP 文档强制的唯一入口 MCPGateway。
  - Agent 内部同时存在两条 MCP 路径：§9.2 经 ToolRouter，§11 经 MCPBridge，二者均不指向 MCPGateway。
- 影响：与 MCP 架构的网关隔离原则冲突；权限、风险确认、审计、结果标准化可能被旁路。

### AGENT-003 生命周期模型重复且状态词表不一致

- 级别：Major
- 位置：§6 Agent 生命周期状态图 对比 §16.1 Profile 状态机、§16.2 Session 状态机
- 问题：§6 将 Profile 级状态（discovered/registered/configured/available/disabled）与执行/会话级状态（assigned/starting/running/waiting_tool/waiting_review/completed）混在同一张图；§16.1 用 draft/active/disabled/degraded/archived，§16.2 用 pending/starting/running/…。三处状态词表不统一，且 §6 同时承担 Profile 与 Session 两种语义。
- 影响：实现期状态机定义易冲突，"degraded""unavailable"等状态归属不清。

### AGENT-004 Session/Message 持久化缺失且无 provider 原生会话句柄

- 级别：Major
- 位置：§7 Session 机制、§8 Message 机制、§18 数据模型映射 对比 `database-design.md`
- 问题：
  - §18 自述 AgentSession / AgentMessage 需"后续新增"`agent_sessions` / `agent_messages`，当前数据库设计中不存在这两张表，而 Session / Message 是本系统核心。
  - Session 字段缺少 `provider_session_ref`（如 Claude Code 的 SESSION_ID），无法对 CLI Agent 的原生会话做多轮续接/恢复。
- 影响：persistent/interactive/background 会话的持久化与恢复无落地依据，多轮协作不可靠。

### AGENT-005 Adapter 注册/发现机制未定义，Provider 枚举与扩展目标张力

- 级别：Major
- 位置：§4.1（AgentProvider "类型标识"）、§17 扩展流程步骤 2（"声明 AgentProvider 枚举或配置项"）
- 问题：§1 宣称"新增 Agent 无需修改业务代码"，但未定义 Adapter 如何注册/发现（插件式注册 vs 中心工厂 switch）。若以 AgentProvider 枚举 + 中心工厂分发，新增 Agent 必然改动中心代码。
- 影响：扩展性承诺可能无法兑现；新增 Aider/Cursor/RooCode 时存在中心耦合风险。

### AGENT-006 能力到 Agent 的解析/匹配规则缺失

- 级别：Major
- 位置：§4.1 AgentCapability（"用于工作流阶段匹配"）、§15 配置层级
- 问题：未定义工作流阶段（executor_type/role）如何解析到具体 AgentProfile：匹配算法、优先级、冲突与回退、无可用 Agent 时的行为均未规定。
- 影响：编排器无法确定性地选定 Agent，"新增 Agent 自动可用"缺乏机制支撑。

### AGENT-007 WSL 执行宿主假设未定，密钥跨边界传递未规定

- 级别：Major
- 位置：§12 WSL 机制（关联 ARCH-004 运行时拓扑缺口）、§15.3、§19
- 问题：
  - 未声明后端服务运行在 Windows 还是 WSL 内，而这决定路径转换方向、命令包装（是否需 `wsl.exe`）、凭证可见性。
  - §12.2 注入环境变量，但密钥如何跨 Windows↔WSL 边界传递、是否经进程参数/环境变量暴露（可被 `ps`/进程列表读取）未规定。
- 影响：WSL 落地存在不确定性与密钥泄露风险。

## Minor Issues

### AGENT-008 Skill 绑定双路径、依赖未设计体系、命名漂移

- 级别：Minor
- 位置：§9.2（ToolRouter→Skill）、§10（SkillBridge）、`docs/06-skill`（空）、架构 §2（SkillRuntime）
- 问题：Skill 同样存在 ToolRouter 与 SkillBridge 双路径；依赖尚未设计的 Skill 体系（同 ARCH-009）；SkillBridge 与 SkillRuntime 命名不一（同 ARCH-008）。

### AGENT-009 Tool 调用缺校验、大小与幂等策略

- 级别：Minor
- 位置：§9 Tool 机制
- 问题：未定义平台 Tool 的输入 Schema 校验、结果大小/截断/流式策略、副作用工具的重试幂等性（关联 ARCH-005）。

### AGENT-010 Session 超时/孤儿清理/并发分组未定义

- 级别：Minor
- 位置：§7、§16.2
- 问题：未定义后台会话心跳/超时、孤儿运行会话清理；并行 Agent 多会话的父子分组关系未说明。

### AGENT-011 WSL 编码与进程树终止未涉及

- 级别：Minor
- 位置：§12
- 问题：未涉及 CRLF/LF 换行、文件编码、`wsl.exe` 子进程树的超时终止与资源回收。

### AGENT-012 后续细化文档死链

- 级别：Minor
- 位置：§20
- 问题：`agent-roles.md`、`tool-contracts.md`、`skill-registry.md`、`content-pipeline.md` 为死链（`database-design.md` 正确）。与 ARCH-001 同源。

## 建议修改

> 仅记录修复方向，不修改原始设计文档。

| 问题 | 建议 |
| --- | --- |
| AGENT-001 | 新增"Agent 原生工具治理"小节：定义沙箱模型（允许目录、只读/读写、命令白名单、网络隔离）、按 Provider 的能力降级（如 Codex/Gemini 强制只读）、在进程层而非仅 Tool Router 层强制策略；修正 §9.3 表述以承认原生工具并说明其受控方式。 |
| AGENT-002 | 将 §11 与 §9.2 的 MCP 路径统一为 `Adapter/Agent → MCPBridge → MCPGateway → …`，MCPBridge 仅作适配，不直连 Registry/Server；与 MCP 文档对齐。 |
| AGENT-003 | 拆分为两套清晰状态机：Profile 生命周期（§16.1）与 Session 执行生命周期（§16.2），将 §6 重构为引用二者的概览，统一状态词表。 |
| AGENT-004 | 在数据库设计补充 `agent_sessions`、`agent_messages` 迁移；Session 增加 `provider_session_ref` 等原生会话句柄字段与恢复语义。 |
| AGENT-005 | 定义 Adapter 插件式注册/发现机制（注册表驱动），Provider 用字符串标识 + 能力描述而非硬编码枚举分发。 |
| AGENT-006 | 定义能力匹配契约：阶段需求 → 候选 Agent → 优先级/回退/无可用处理。 |
| AGENT-007 | 与 ARCH-004 联动声明执行宿主拓扑；规定密钥经安全通道（如临时文件/受限环境）注入，禁止经命令行参数传递。 |
| AGENT-008 | 统一 Skill 单路径与命名，回链待设计的 Skill 体系。 |
| AGENT-009 | 定义平台 Tool 输入校验、结果大小/截断/流式、幂等键策略。 |
| AGENT-010 | 定义会话心跳/超时、孤儿清理、并行会话分组。 |
| AGENT-011 | 规定换行/编码规范与进程树终止策略。 |
| AGENT-012 | 修正 §20 死链。 |

## 最终结论

**结论：不通过（需修复后复审）。**

- 存在 1 个 Critical（AGENT-001）：Agent 原生工具治理缺失且自相矛盾，无法保证宪法要求的沙箱/权限控制，属安全边界阻断项。
- AGENT-002（MCP 绑定绕过网关）与 AGENT-003/004/005/006/007 共同表明：Agent 运行时的控制平面、扩展机制、会话持久化与 WSL 落地尚未达到可开发标准。
- 复审放行条件：
  1. AGENT-001 安全治理设计补齐并消除 §9.1/§9.3 矛盾（最高优先）。
  2. AGENT-002 MCP 路径统一经 MCPGateway。
  3. AGENT-004 Session/Message 持久化与原生会话句柄落地。
  4. AGENT-005 / AGENT-006 扩展与能力匹配机制定义。
  5. AGENT-007 WSL 宿主与密钥传递规定（与 ARCH-004 联动）。
- 抽象层、Adapter 契约、生命周期与 WSL 框架方向正确，修复以"补齐机制"为主，不需推翻设计。
- 统计：Critical 1，Major 6，Minor 5，已修复 0。

## 审查记录

| 日期 | 审查者 | 动作 | 说明 |
| --- | --- | --- | --- |
| 2026-06-03 | Claude | 首轮审查 | 完成 Agent 静态审查，记录 1 Critical / 6 Major / 5 Minor，结论不通过待复审 |
