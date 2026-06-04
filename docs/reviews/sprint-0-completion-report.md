# Sprint 0 就绪准备完成报告

> 报告类型：Sprint 0（开发前准备）完成报告
> 日期：2026-06-04
> 范围：仅开发前准备（文档 + 决策固化），**未编写任何业务代码**
> 依据：`docs/reviews/pre-development-checklist.md`（Must 项）、`docs/reviews/release-candidate-review.md`
> 结论速览：✅ **允许进入 Sprint 1**（文档/决策类前置全闭环；实现类前置决策已固化、落点已映射）

---

## 1. 完成内容

### 1.1 目标达成

Sprint 0 目标为「不开发业务系统，只完成开发前准备」，已达成：

- 按检查清单创建全部缺失的关键文档（Must §1.1 + Should 文档项）。
- 将 RC 评审的全部实现边界与安全/架构决策**固化为权威决策记录**（Must §1.2 + §1.3/§1.4 决策部分）。
- 完成新建文档对产品/架构/数据库/Agent/Workflow 的引用一致性检查。
- 更新检查清单勾选，生成本报告。

### 1.2 检查清单处置情况

| 清单分组 | 项数 | Sprint 0 处置 |
| --- | --- | --- |
| Must §1.1 关键文档 | 2 | ✅ 全部创建 |
| Must §1.2 实现边界声明 | 3 | ✅ 全部固化（ADR-016/017/018）|
| Must §1.3 安全强制点 | 6 | ⏳ 决策固化 + Sprint 落点映射；测试随实现 |
| Must §1.4 架构风险硬项 | 3 | ⏳ 决策/计划固化；实现于 S2/S4 |
| Should 文档项 | 4 | ✅ 全部创建（含 Sprint 0 设立）|
| Should R6/R7 | 2 | ⏳ 决策固化（R7=ADR-015）；实现于 S2/S4 |
| Could P1/P2 | 6 | ◻ 按计划延后 |

> 说明：§1.3/§1.4 的「实现类」项在 Sprint 0 不写业务代码的约束下，完成形式是**决策固化 + Sprint 落点映射**（写入 decision-log 与 setup §3），其自动化测试验收在对应 Sprint 实现期达成。这是 Sprint 0 的正确边界，非遗漏。

## 2. 新增文档

本次共新增 **7 份文档**（5 份清单要求 + 2 份主动补充），均为新建，**未修改任何既有设计文档**。

| # | 文档 | 类型 | 来源要求 | 核心内容 |
| --- | --- | --- | --- | --- |
| 1 | `docs/09-api/api-overview.md` | API 契约 | Must §1.1 / 用户要求 1 | 通用约定（鉴权/错误/分页/幂等/实时通道）+ 4 Sprint 端点统一视图 + 追溯端点 |
| 2 | `docs/10-development/setup.md` | 环境/DB | Must §1.1 / 用户要求 1 | PostgreSQL≥14 选型、迁移分期与规约、安全强制点 DB 落点、WSL、环境凭证、就绪判据 |
| 3 | `docs/06-skill/skill-registry.md` | Skill 注册 | Should / 用户要求 1 | 注册模型、SkillBridge→SkillRuntime 单路径、生命周期、调用记录、MVP 边界 |
| 4 | `docs/06-skill/quality-gates.md` | 质量门禁 | Should / 用户要求 1 | 门禁与状态机关系、门禁结果契约、九阶段门禁定义、与审查记录关系 |
| 5 | `docs/04-agent/agent-roles.md` | Agent 角色矩阵 | Should / 用户要求 1 | 8 角色定义、角色→阶段→能力需求映射、权限姿态、数据映射 |
| 6 | `docs/00-project/decision-log.md` | 决策记录 | 用户要求 2 | 22 条 ADR：业务/DB/Agent/MCP/安全/MVP 边界/技术栈/迁移决策 |
| 7 | `docs/04-agent/agent-capability-matrix.md` | 能力矩阵 | 用户要求 3 | Claude Code/Codex/Gemini CLI/OpenCode 能力维度 + 角色适配 + 权限姿态 |

> 文档 6、7 为用户本次明确要求（要求 2、3），同时补强了 RC 评审建议；文档 1–5 对应检查清单 Must/Should。

## 3. 一致性检查结果

按用户要求 4，检查新建文档对**产品 / 架构 / 数据库 / Agent / Workflow** 的引用正确性：

### 3.1 文件路径引用

- 新建 7 份文档中提取的全部 `docs/**/*.md` 路径引用（13 条去重）**全部解析成功**，无悬空路径。

### 3.2 章节号引用

逐一比对 5 个领域文档的实际章节标题：

| 领域文档 | 被引用章节（抽样）| 核对结果 |
| --- | --- | --- |
| 产品 product-requirements | §2.3 / §6.7 / §6.9 / §7.3 / §7.5 | ✅ 全部存在 |
| 架构 system-architecture | §2 / §3.2 / §12 / §13.1~13.3 / §14.3 / §15.2~15.3 / §16 | ✅ 全部存在 |
| 数据库 database-design | §5.5 / §5.7 / §5.9 / §5.11 / §5.12 / §5.15 / §5.17 / §5.21 / §6.4 / §8.1 / §8.3 / §8.4 / §9.3 / §9.4 / §10.1 | ✅ 全部存在 |
| Agent agent-architecture | §4.3 / §4.4 / §9.4 / §9.5 / §10.1 / §10.2 / §12.4 / §12.5 / §14.2 / §15.1 / §17 / §20 | ✅ 全部存在 |
| Workflow content-workflow | §3 / §4.1 / §4.2 / §5.4 / §5.5 / §7.1 / §7.4 / §8 / §11 / §12 | ✅ 全部存在 |

### 3.3 修正项

- 发现并修正 1 处自身引用不精确：`api-overview.md` 将「可追溯率硬指标」由 PRD §7.5（DoD）改指 §2.3（指标定义处），更准确。

### 3.4 命名与语义一致性

- 组件命名（SkillRuntime/SkillBridge、MCPGateway/MCPBridge）在新文档中与 arch §2 / ADR-005 一致。
- 状态机权威（db §8.2）、审查单一真相源（review_records.decision）、资产类型受控词表、调用记录字段在新文档中均回链既有权威源，无新增矛盾。

> 结论：新建文档引用全部正确，与 5 个领域既有设计**零语义冲突**，仅自修正 1 处精度问题。

## 4. 遗留风险

Sprint 0 未消除、需在后续 Sprint 关注的项：

| # | 遗留项 | 等级 | 性质 | 落地计划 |
| --- | --- | --- | --- | --- |
| L1 | **应用技术栈未最终确认**（ADR-019 为「建议待确认」）| 中 | 需开发者决策 | 影响 R4 的 ORM DEFERRABLE 验证；Sprint 1 启动前确认 |
| L2 | **安全强制点尚未实现 + 测试**（RLS/哈希链/确认令牌/脱敏/沙箱）| 高 | 实现类，决策已固化 | 按 setup §3 落点在 S1/S4 实现并配自动化测试（终审硬条件）|
| L3 | **四层状态机集中引擎未实现**（R2）| 高 | 实现类，决策已固化 | S2 实现状态机模块 + 流转测试矩阵 |
| L4 | **循环外键 DEFERRABLE 未实测**（R4）| 中 | 依赖 L1 | 技术栈确认后、S2 实现前验证 |
| L5 | **真实 Provider 端到端未验证**（R3）| 高 | 计划类 | S4 壳层前用 1 个真实 Provider 跑通 1 条链路（ADR-021）|
| L6 | **MVP 后细化文档未创建**（tool-contracts/marketplace/design-system/wireframes/部署）| 低 | P1/P2 | 对应阶段补；不阻塞 MVP |
| L7 | **§后续细化前向引用命名漂移未统一**（content-pipeline/information-architecture）| 低 | 文档维护，需改设计文档 | 文档维护窗口处理（本次按约束不改设计文档）|

> 风险定性：L2/L3/L5 为高等级但均**决策已固化、落点已明确**，属「按计划实现」而非「设计未决」；不构成进入 Sprint 1 的阻塞，但须严格纳入对应 Sprint 的 DoD 与验收门槛。

## 5. 是否允许进入 Sprint 1

### ✅ 结论：允许进入 Sprint 1

### 判定依据

1. **Sprint 0 目标全达成**：开发前文档与决策准备完成，未越界开发业务代码。
2. **Sprint 1 直接前置已就绪**：
   - Sprint 1 交付 `users`/`projects`/`content_tasks`/`audit_events` 四表与任务 CRUD API（roadmap §4）。
   - 其所需的 DB 选型（ADR-002）、迁移规约（setup §2）、任务 API 契约（api-overview §4.1）、审计哈希链落点（setup §3 / ADR-008）均已就位。
3. **零阻塞**：遗留风险中 L1（技术栈确认）是 Sprint 1 启动动作而非设计缺口；L2–L5 落在 S1 及以后实现期，已有明确落点。
4. **RC 放行条件兑现**：C1（文档）✅、C2（边界声明）✅、C3（安全点 DoD 映射）✅ 完成 Sprint 0 应尽部分。

### 进入 Sprint 1 的两个前置动作（启动当日完成）

- [ ] **确认应用技术栈（ADR-019）**：锁定后端/前端框架与 ORM，并验证 ORM 支持 DEFERRABLE（解 L1/L4）。
- [ ] **将 setup §3 安全落点写入 Sprint 1 DoD**：S1 即落地 `audit_events` 哈希链 + append-only 与首批 RLS，并配自动化测试（解 L2 的 S1 部分 / R5）。

### Sprint 1 验收须确保（提前声明，避免返工）

- 任务创建同步写入带 `entry_hash` 的审计事件（ADR-008）。
- 跨项目访问被 RLS/谓词拒绝，有自动化测试（ADR-009）。
- 核心领域逻辑测试覆盖率 ≥90%，整体 ≥80%（roadmap §4.6）。

---

## 6. 附录：交付物清单

| 交付物 | 路径 | 状态 |
| --- | --- | --- |
| API 契约 | `docs/09-api/api-overview.md` | 新建 |
| 环境与数据库搭建 | `docs/10-development/setup.md` | 新建 |
| Skill 注册规范 | `docs/06-skill/skill-registry.md` | 新建 |
| 质量门禁 | `docs/06-skill/quality-gates.md` | 新建 |
| Agent 角色矩阵 | `docs/04-agent/agent-roles.md` | 新建 |
| 技术决策记录 | `docs/00-project/decision-log.md` | 新建 |
| Agent 能力矩阵 | `docs/04-agent/agent-capability-matrix.md` | 新建 |
| 检查清单（更新勾选）| `docs/reviews/pre-development-checklist.md` | 更新 |
| 本完成报告 | `docs/reviews/sprint-0-completion-report.md` | 新建 |

> 全程未修改任何既有设计文档（00–10 域核心设计文档），仅新增文档与更新评审区跟踪文件。
