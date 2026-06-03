# Architecture Review

> 审查域：01 架构　|　规则：[00-review-master.md](./00-review-master.md)
> 严重级别映射（对齐主控文档 §3）：Major ≈ High，Minor ≈ Medium/Low。
> 问题编号前缀：ARCH。

## 审查时间

- 日期：2026-06-03
- 审查者：首席架构师（Claude）
- 轮次：第 1 轮

## 审查范围

- 主审：`docs/02-architecture/system-architecture.md`
- 交叉核对：
  - `docs/00-project/project-constitution.md`
  - `docs/01-product/product-requirements.md`
  - `docs/03-database/database-design.md`
  - `docs/04-agent/agent-architecture.md`
  - `docs/05-mcp/mcp-architecture.md`
  - `docs/07-workflow/content-workflow.md`
- 审查维度：一致性、完整性、可实现性、合规性、可观测与安全。
- 审查方式：仅文档静态审查，未运行代码（当前仓库无实现代码）。

审查清单结果：

- [x] 分层职责清晰
- [x] 业务规则归属领域层（文字层面成立，但见 ARCH-002 图示矛盾）
- [x] Agent / MCP / Skill / 插件通过网关或适配层接入
- [x] 无跨模块直接依赖内部实现
- [~] 数据流闭环（核心闭环成立，认证/实时通道缺失，见 ARCH-003、ARCH-007）
- [x] 时序图与模块关系图自洽
- [x] Mermaid 图语法可渲染
- [~] 可替换 / 可观测 / 最小必要（可观测性在架构层不足，见 ARCH-006）
- [~] 与相邻文档一致（存在死链与命名漂移，见 ARCH-001、ARCH-008）

## Critical Issues

无。

架构整体分层合理，未发现违反项目宪法核心约束、会导致系统性失败或重大安全风险的阻断性问题。

## Major Issues

### ARCH-001 后续细化文档链接与实际文件名不一致（死链）

- 级别：Major
- 位置：`system-architecture.md` §13 后续细化文档
- 问题：§13 引用的文件名与实际已创建文件不符，形成死链：
  - `docs/03-database/data-model.md` → 实际为 `database-design.md`
  - `docs/04-agent/agent-roles.md` → 实际为 `agent-architecture.md`
  - `docs/05-mcp/tool-contracts.md` → 实际为 `mcp-architecture.md`
  - `docs/07-workflow/content-pipeline.md` → 实际为 `content-workflow.md`
  - `docs/06-skill/skill-registry.md`、`docs/09-api/api-overview.md` → 尚未创建
- 影响：违反"开发前必须优先读取相关文档"的可导航前提；§9/§10/§11 内文引用同样指向这些不存在的文件。
- 关联：`docs/README.md` 的"典型文档"列也使用同一批通用名，存在同源不一致（属导航文档，单独跟踪）。

### ARCH-002 高层架构图与依赖倒置描述自相矛盾

- 级别：Major
- 位置：`system-architecture.md` §2 总体架构图 `Domain --> DB` 对比 §4.2 后端分层图 `AppService --> Repository → Adapter → DB`
- 问题：§2 高层图将领域层直接连到数据库（`Domain --> DB`），而 §4.2 明确采用 Repository 接口 + Adapter 的依赖倒置。两处对"领域层是否直接依赖持久化"给出相反信号。
- 影响：可能诱导实现期让领域层直接耦合具体存储，违反宪法"可替换""分层隔离"原则。

### ARCH-003 缺少认证与授权边界

- 级别：Major
- 位置：`system-architecture.md` §2、§4（仅有 `Policy[权限与策略]` 节点）
- 问题：文档有"权限与策略"，但未描述身份认证入口、用户身份来源、会话机制、鉴权在哪一层执行，以及项目（租户）隔离如何落地。
- 影响：认证/鉴权属 MVP 必备能力；缺失将导致 API 层与应用层职责模糊。产品文档将多租户列为 P3，但单项目下的认证仍需在架构层定义。

### ARCH-004 缺少运行时与部署拓扑

- 级别：Major
- 位置：全文（§2、§6/§7 仅描述逻辑层，未描述物理运行模型）
- 问题：系统核心是编排本地 CLI Agent（Claude Code / Codex / Gemini CLI / OpenCode），但未说明：后端服务与 Agent CLI 的运行位置关系、进程边界、是单体还是服务拆分、Agent 进程在服务端还是用户端执行。
- 影响：这是决定可实现性的关键架构约束（Agent 文档已涉及 WSL/Process Runner，但系统架构未给出承载边界），直接影响部署、安全与权限模型。

### ARCH-005 缺少并发、幂等与竞态控制

- 级别：Major
- 位置：`system-architecture.md` §4.1（编排层仅列"重试、超时、失败"）、§8 工作流架构
- 问题：存在多 Agent 并行（工作流 §7.3）与后台 Session（Agent §7.2），但架构未描述阶段执行幂等性、状态版本/乐观锁、重复完成防护、并发推进同一工作流的冲突处理。
- 影响：缺乏并发模型易导致状态机被并发写坏、重复产出、审核与阶段状态不一致。

## Minor Issues

### ARCH-006 架构层可观测性不足

- 级别：Minor
- 位置：§2、§12
- 问题：有 Audit 与 LogStore，但未描述贯穿 Orchestrator → Agent → MCP 的关联 ID / 链路追踪 / 指标。
- 影响：宪法"可观测"与产品 NFR 落地依据不足。

### ARCH-007 前端实时更新通道未定义

- 级别：Minor
- 位置：§3 前端架构（仅 APIClient → Server）
- 问题：UI 设计与 Agent `stream()`、后台 Session 隐含实时执行状态推送，但架构未说明 WebSocket / SSE 等推送通道。

### ARCH-008 组件命名漂移

- 级别：Minor
- 位置：§2、§9 用 `SkillRuntime`/`PluginRuntime`；Agent 文档用 `SkillBridge`/`Skill Bridge`
- 问题：同一能力在文档间命名不统一，易在实现期造成概念分裂。

### ARCH-009 依赖尚未设计的 Skill 体系

- 级别：Minor
- 位置：§2 Extensions（含 SkillRuntime）
- 问题：架构引用 Skill 运行时，但 `docs/06-skill` 尚为空，存在前置依赖未定义。

### ARCH-010 高层图未体现 MCP 多调用方路径

- 级别：Minor
- 位置：§2（仅 `Orchestrator --> MCPGateway`）
- 问题：MCP 文档为多调用方模型（Agent/Skill/Plugin/Workflow → MCPGateway），高层图仅画出编排器一条路径。高层简化可接受，建议加注说明以免误解为唯一入口。

## 建议修改

> 以下为修复方向，仅记录于本报告，不修改原始设计文档。

| 问题 | 建议 |
| --- | --- |
| ARCH-001 | 将 §13 及内文链接更正为实际文件名；对未创建的 Skill / API 文档标注"待创建"；同步修正 `docs/README.md` 典型文档列。 |
| ARCH-002 | 修改 §2 高层图为 `Domain --> Repository`（或 `App/Repository --> 持久化`），与 §4.2 统一为依赖倒置；明确"领域层只依赖 Repository 接口"。 |
| ARCH-003 | 新增"身份与访问控制"小节：认证入口、身份传递、鉴权执行层、项目级隔离边界；在 API 层标注鉴权与输入校验职责。 |
| ARCH-004 | 新增"运行时与部署拓扑"小节：明确后端与 Agent CLI 的运行关系、进程边界、单体/模块化划分，与 Agent §12 WSL 机制衔接。 |
| ARCH-005 | 新增"并发与一致性"小节：阶段执行幂等键、`workflow_runs`/`stage_runs` 状态版本或乐观锁、并发推进与重复完成防护策略。 |
| ARCH-006 | 在 §12 增加可观测性决策：关联 ID 贯穿编排与外部调用、指标与追踪落点。 |
| ARCH-007 | 在 §3 增加实时通道说明（执行状态、Agent 输出流的推送机制）。 |
| ARCH-008 | 统一术语，建议固定为 `SkillRuntime`/`PluginRuntime` 或 `SkillBridge`，并在 Agent 文档同步。 |
| ARCH-009 | 在 §13 标注 Skill 体系为前置依赖，待 `docs/06-skill` 设计完成后回链。 |
| ARCH-010 | §2 高层图加注或补线，体现 MCPGateway 的多调用方入口。 |

## 最终结论

**结论：有条件通过（Conditional Pass）。**

- 架构分层、解耦策略、数据流与时序设计整体成立，符合项目宪法核心约束，无 Critical 阻断项。
- 放行条件（进入开发前应处理）：
  1. ARCH-002：消除 §2 与 §4.2 的依赖方向矛盾（影响实现正确性，优先级最高）。
  2. ARCH-001：修正死链，恢复文档可导航性。
  3. ARCH-003 / ARCH-004 / ARCH-005：补齐认证边界、运行时拓扑、并发一致性三处架构缺口（可在架构文档增补小节，不阻塞 Sprint 1 启动，但需在 Sprint 2 工作流落地前完成）。
- Minor 问题（ARCH-006 ~ ARCH-010）登记并择机处理，不阻塞开发。
- 统计：Critical 0，Major 5，Minor 5，已修复 0。

## 审查记录

| 日期 | 审查者 | 动作 | 说明 |
| --- | --- | --- | --- |
| 2026-06-03 | Claude | 首轮审查 | 完成架构静态审查，记录 0 Critical / 5 Major / 5 Minor，结论有条件通过 |
