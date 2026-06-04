# 开发前检查清单（Pre-Development Checklist）

> 来源：`docs/reviews/release-candidate-review.md`（Release Candidate 设计评审报告）
> 生成日期：2026-06-04　|　最近更新：2026-06-04（Sprint 0 执行后勾选）
> 用途：进入 MVP 开发（Sprint 0/1）前必须核对的事项清单
> 分级：**必须完成**（不做则阻塞开发或导致返工/范围失控）｜**建议完成**（强烈建议，可早期 Sprint 并行）｜**可选完成**（P1/P2，列出以备追踪）
> 硬约束：RC 报告识别的全部未解决风险（C1–C3 放行前置 + R1–R7 架构风险）均已纳入本清单，见末尾 §4 覆盖核对表。

## Sprint 0 完成快照（2026-06-04）

- ✅ **文档类 Must/Should 全部交付**：api-overview / setup / skill-registry / agent-roles / quality-gates，并新增 decision-log、agent-capability-matrix。
- ✅ **实现边界声明固化**：插件/Skill 仅建表、9 阶段裁剪、设计器降级 → decision-log ADR-016/017/018。
- ✅ **安全 + 架构决策固化**：RLS / 哈希链 / 确认令牌 / 脱敏 / 沙箱 / 状态机集中化 / 循环外键 / 真实 Provider 验证 → decision-log ADR-006~013/021，落点见 setup §3。
- ⏳ **实现类项（安全强制点、状态机、ORM 验证、真实链路）保持未勾选**：决策已固化，验收（自动化测试）随对应 Sprint 实现落地，下方逐项标注落地 Sprint。
- 🔸 **待确认**：应用技术栈（ADR-019）需开发者确认，影响 ORM/DEFERRABLE 验证（R4）。

勾选语义：`[x]` = 验收达成（文档/声明类）；`[ ]` 且标注「决策固化→SX」= 决策已定但实现验收在该 Sprint 完成。

---

## 1. 必须完成（Must）

开发启动前的硬性前置；任一未完成都可能阻塞 Sprint 1 或引发后期重构。

### 1.1 关键文档补齐（来源：RC §1 C1 / Phase 1 §2.4）

- [x] **创建 `docs/09-api/api-overview.md`（API 契约）** ✓ Sprint 0 已创建
  验收：覆盖 MVP 核心资源接口契约、鉴权、统一错误结构、实时通道端点。已整合 roadmap 各 Sprint 端点为统一契约视图。
- [x] **创建 `docs/10-development/setup.md`（DB 选型与迁移）** ✓ Sprint 0 已创建
  验收：锁定 PostgreSQL ≥14、迁移分期与规约、WSL 注意事项、环境变量与凭证约定、就绪判据。

### 1.2 MVP 实现边界声明（来源：RC §1 C2 / Phase 3 §4.3）

> 已固化于 `decision-log.md`（权威决策记录），界线写死，防止范围蔓延。

- [x] **插件系统 + Skill 体系 MVP 仅建表 + 配置 UI，不实现真实执行** ✓ ADR-016
- [x] **MVP 公众号图文 9 阶段裁剪方案**（6 必建 + 润色/配图/排版可配置可跳过）✓ ADR-017（对齐 roadmap §9）
- [x] **工作流设计器 MVP 降级为配置/JSON 编辑**，可视化画布列 P1 ✓ ADR-018

### 1.3 安全强制点（来源：RC §1 C3 / 终审放行条件 / R1 / R5）

> Sprint 0 已固化决策并映射 Sprint 落点（setup §3）；自动化测试随实现落地。

- [ ] **R1｜RLS 奠基（高风险，首版即做）**：敏感表 MVP 即启用 RLS 或强制 `project_id` 谓词，单项目也走谓词。
  验收：跨项目访问被拒的自动化测试 + 告警。｜**决策固化 ADR-009 + setup §3 → 实现于 S1 起逐表**
- [ ] **R5｜审计哈希链首版即上（高约束，不可延后）**：`audit_events` 实现 `sequence_no` + `prev_hash` + `entry_hash` + append-only。
  验收：断链/断号校验 + 篡改检测测试。｜**决策固化 ADR-008 + setup §3 → 实现于 S1（首版）**
- [ ] **确认令牌防 TOCTOU**：四元组绑定 + 短 TTL + 执行前重算 digest 比对。
  验收：热加载/输入变更令牌失效测试。｜**决策固化 ADR-011 → 实现于 S4（高风险确认链路）**
- [ ] **统一脱敏管道**：强制管道；`*_digest` 不可逆（SHA-256）、摘要前先脱敏。
  验收：密钥/敏感正文不入库不入摘要测试。｜**决策固化 ADR-012 → 实现于 S1 起**
- [ ] **沙箱强制位置**：工作目录白名单根、默认只读 + 禁网、WSL 路径规范化。
  验收：路径越界/沙箱逃逸拦截测试。｜**决策固化（agent §9.4 / setup §5.2）→ 实现于 S4（Agent 执行）**
- [ ] **将上述安全点全部落为对应 Sprint 的 DoD + 自动化测试项**（C3 总括）。
  验收：每个安全强制点至少 1 个自动化测试，纳入 CI。｜**Sprint 0 已在 setup §3 完成 Sprint 映射 → 测试随实现落地**

### 1.4 架构风险硬项（来源：RC Phase 5 §6）

- [ ] **R2｜状态机集中化（高风险）**：四套状态机用集中引擎/统一转换函数，禁止散落手写。
  验收：状态流转测试矩阵。｜**决策固化 ADR-006 → 实现于 S2（状态机模块）**
- [ ] **R4｜循环外键约束确认（中风险，实现前必查）**：确认 ORM/迁移支持 `content_assets ↔ asset_versions` DEFERRABLE，否则改两步提交。
  验收：资产 + 首版本创建事务测试。｜**决策固化 ADR-007；ORM 验证待 ADR-019 技术栈确认 → S2 实现前**
- [ ] **R3｜真实 Provider 端到端验证计划（高风险）**：S4 壳层前用 1 个真实 Provider 跑通 1 条端到端链路，验证抽象不漏。
  验收：1 条真实 Provider demo 链路。｜**计划固化 ADR-021 → 执行于 S4 前**

---

## 2. 建议完成（Should）

强烈建议，可在 Sprint 0 或早期 Sprint 并行推进，不阻塞但显著降低风险。

- [x] **设立 Sprint 0（0.5~1 周）**：集中消化 §1.1 文档 + §1.2 边界声明 + §1.3 安全测试清单（来源：RC Phase 4 §5.5）✓ 本次执行
- [x] **创建 `docs/06-skill/skill-registry.md`**（Skill 注册规范）✓ Sprint 0 已创建
- [x] **创建 `docs/04-agent/agent-roles.md`**（Agent 角色矩阵）✓ Sprint 0 已创建
- [x] **创建 `docs/06-skill/quality-gates.md`**（Skill 质量门禁）✓ Sprint 0 已创建
- [ ] **R7｜JSON schema_version 强制校验（中风险）**：关键 JSON 契约字段实现 `schema_version` 校验 + 迁移规范。
  ｜**决策固化 ADR-015 → 实现于 S2（JSON 契约校验）**
- [ ] **R6｜`v_invocations` 性能预留（中风险）**：MVP 先用普通 UNION 视图，预留物化视图/分区升级路径。
  ｜**决策保留（RC R6）→ 实现于 S4（视图落地）**

> 附加交付（超出原清单，Sprint 0 主动补充）：
> - [x] `docs/00-project/decision-log.md`（技术决策记录，22 条 ADR）
> - [x] `docs/04-agent/agent-capability-matrix.md`（四 Provider 能力矩阵）

---

## 3. 可选完成（Could）

P1/P2 范围或实现期细化，MVP 不需要；列出以纳入长期追踪。

- [ ] **创建 `docs/05-mcp/tool-contracts.md`**（MCP 工具契约；市场为 P2）。
- [ ] **创建 `docs/05-mcp/marketplace.md`**（MCP 市场规范；P2）。
- [ ] **创建 `docs/08-ui/design-system.md`**（设计系统 Token；实现期细化）。
- [ ] **创建 `docs/08-ui/wireframes.md`**（页面高保真原型）。
- [ ] **填充 `docs/11-deployment/`**（部署文档；部署阶段再补，当前仅 `.gitkeep`）。
- [ ] **文档治理：统一 §后续细化文档 前向引用命名**（`content-pipeline.md`→`content-workflow.md`、`information-architecture.md`→`ui-design.md`），并对未标注「待创建」的缺失文档补标注（来源：RC Phase 1 §2.5）。
  说明：此项需改动设计文档，属文档维护动作，留待专门的文档维护窗口处理，**不在本次评审/清单生成中执行**。

---

## 4. 风险覆盖核对表

证明 RC 报告全部未解决项（前置条件 + 架构风险 + 缺失文档 + 实现边界）均已进入本清单，无遗漏。Sprint 0 列标注当前处置状态。

| RC 报告项 | 类型 | 风险/影响等级 | 本清单归属 | Sprint 0 处置 |
| --- | --- | --- | --- | --- |
| C1 — api-overview.md / setup.md | 放行前置 | 高 | §1.1（必须）| ✅ 已创建 |
| C2 — 三处实现边界声明 | 放行前置 | 高（防范围蔓延）| §1.2（必须）| ✅ ADR-016/017/018 |
| C3 — 安全强制点落 DoD + 测试 | 放行前置 | 高（终审条件）| §1.3（必须）| ⏳ 映射 setup §3，实现期测试 |
| R1 — RLS 奠基时机 | 架构风险 | 高 | §1.3（必须）| ⏳ ADR-009，S1+ |
| R2 — 三/四层状态机同步 | 架构风险 | 高 | §1.4（必须）| ⏳ ADR-006，S2 |
| R3 — S4 壳层→真实适配抽象泄漏 | 架构风险 | 高 | §1.4（必须）| ⏳ ADR-021，S4 前 |
| R4 — 循环外键延迟约束 | 架构风险 | 中 | §1.4（必须，实现前必查）| ⏳ ADR-007，待技术栈确认 |
| R5 — 审计哈希链首版即上 | 架构风险 | 中（实为硬约束）| §1.3（必须）| ⏳ ADR-008，S1 |
| R6 — v_invocations UNION 性能 | 架构风险 | 中 | §2（建议）| ⏳ S4 |
| R7 — JSON schema 演进 | 架构风险 | 中 | §2（建议）| ⏳ ADR-015，S2 |
| Phase 1 — skill-registry/agent-roles/quality-gates | 缺失文档 | 中 | §2（建议）| ✅ 已创建 |
| Phase 1 — tool-contracts/marketplace/design-system/wireframes/deployment | 缺失文档 | 低/P2 | §3（可选）| ◻ 延后 |
| Phase 1 §2.5 — 前向引用命名漂移 | 文档瑕疵 | 低 | §3（可选，文档维护窗口）| ◻ 延后 |

> 核对结论：C1–C3（3 项）+ R1–R7（7 项）全部纳入并处置。Sprint 0 已闭环全部**文档类与决策类**前置（C1/C2 + 全部 ADR 固化）；**实现类**前置（C3/R1–R5）决策已定、落点已映射，验收随对应 Sprint 实现。无未解决风险遗漏。
