# 08 MVP 审查

> 状态：已完成　|　最近更新：2026-06-03　|　规则：[00-review-master.md](./00-review-master.md)

## 1. 审查对象

- `docs/10-development/development-roadmap.md`
- 关联：`docs/01-product/product-requirements.md`（§2.3 量化指标、§7 P0-P3、§7.5 DoD）、`docs/03-database/database-design.md`（25 表全集 + 状态机）、`docs/02-architecture/system-architecture.md`

## 2. 审查目标

验证 MVP 拆分与 Sprint 计划是否遵循最小可运行优先，依赖顺序合理，各 Sprint 要素完整、可交付。

## 3. 审查清单

- [x] MVP 范围聚焦核心价值闭环（但 Skill/插件越级，见 MVP-003）
- [x] Sprint 1-4 目标递进，最小可运行优先
- [x] Sprint 间依赖顺序合理（除 MVP-002 外键迁移排序）
- [x] 每个 Sprint 含目标、任务、数据库、前端、后端、测试、风险
- [ ] 数据库交付与数据库设计一致（MVP-001 缺 workflow_stage_dependencies）
- [ ] 跨 Sprint 外键迁移可行（MVP-002）
- [ ] 测试 / 验收与 PRD DoD 对齐（MVP-004/005）
- [ ] MVP 出口度量 PRD §2.3 硬性指标（MVP-005）

## 4. 发现的问题

| ID | 级别 | 类型 | 问题 | 位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| MVP-001 | Major | DB 一致性 | S2 交付 workflow_stages 与"禁止跳阶段"回归，但未交付 `workflow_stage_dependencies`（依赖权威表），规则无数据载体 | roadmap §5.3 ↔ db §5.5.1 | 待修复 |
| MVP-002 | Major | 迁移排序 | `stage_runs.agent_profile_id` FK 指向 `agent_profiles`，但 stage_runs 在 S2、agent_profiles 在 S4，迁移引用未建表 | roadmap §5.3 vs §7.3 | 待修复 |
| MVP-003 | Major | 范围/优先级冲突 | S4 将 skill/plugin 表纳入 MVP，PRD §7.3 明确为 P2；与"最小可运行优先""主用户闭环无关延后"相悖 | roadmap §7.3 ↔ PRD §7 | 待修复 |
| MVP-004 | Major | DoD 对齐 | PRD §7.5 规定任务创建后置 `ready`，但 S1 未规定初始状态与 draft→ready 确认流转归属 | roadmap §4.3 ↔ PRD §7.5 | 待修复 |
| MVP-005 | Major | Sprint 完整性 | 缺工时/周期估算；各 Sprint 验收未对接 PRD §2.3 硬指标（可追溯率 100%、扩展达成）作为出口门槛 | roadmap 全篇 ↔ PRD §2.3 | 待修复 |
| MVP-006 | Minor | 完整性 | `publish_records` 标为可选/可用审计替代，将丢失"已发布版本不漂移"保证（DB §5.21 asset_version_id） | roadmap §7.3 | 待修复 |
| MVP-007 | Minor | 一致性 | S3 称 content_assets.status"完善"，但 S2 已落地该表，未澄清各 Sprint 落地的 status 子集 | roadmap §6.3 | 待修复 |
| MVP-008 | Minor | 完整性 | `/api/assets/:id/compare`、`/api/tasks/:id/editor-state` 无对应表，应注明为只读计算端点 | roadmap §6.4 | 待修复 |
| MVP-009 | Minor | 完整性 | 跨 Sprint 前端引用 AppShell/SidebarNav/TopBar/ContextPanel，未指明布局壳层基线 Sprint | roadmap §8.2 | 待修复 |
| MVP-010 | Minor | 一致性 | MVP 列九阶段工作流，S2 仅笼统建模、§9 演示仅四阶段，未明确 MVP 必建子集 | roadmap §2.1/§9 | 待修复 |

## 5. 修复建议

- **MVP-001**：S2 DB 清单显式加入 `workflow_stage_dependencies`（MVP 可仅 `finish_to_start` 线性依赖，但表与无环校验须落地），支撑"禁止跳阶段"回归。
- **MVP-002**：写明 S2 迁移 `agent_profile_id` 暂不加 FK（仅留列），S4 建表后补外键；或将 `agent_profiles` 提前到 S2。记录该排序决策保证可回滚。
- **MVP-003**：S4 仅保留 Agent Profile + MCP 配置/日志 + 公众号发布准备；Skill/插件移至 MVP 后阶段，或降级为空表占位并标注非 MVP 验收项。
- **MVP-004**：S1 明确"创建默认 draft，需求确认置 ready"并补对应单测/集成测试，逐条对齐 PRD §7.5 GWT 用例。
- **MVP-005**：§3 补每 Sprint 估算与并行/串行假设；§9 里程碑将 PRD §2.3 硬指标（可追溯率、扩展零业务代码改动）列为 MVP 出口门槛。
- **MVP-006~010**：`publish_records` 不列为可选至少建表；澄清各 Sprint status 子集；标注只读计算端点；布局壳层归入 S1；明确 MVP 必建阶段子集。

## 6. 最终结论

有条件通过 —— Sprint 拆解结构完整、依赖排序可行、MVP"先可运行"方向正确，无 Critical；需先修复阶段依赖表缺失（MVP-001）、外键迁移排序（MVP-002）、Skill/插件越级（MVP-003）、任务初始状态对齐（MVP-004）后作为开发基线。

## 7. 审查记录

| 日期 | 审查者 | 动作 | 说明 |
| --- | --- | --- | --- |
| 2026-06-03 | 工程管理评审 | 完成审查 | 0 Critical / 5 Major / 5 Minor；结论有条件通过 |
