# Sprint-2 就绪审计（Sprint-2 Readiness Audit）

> 日期：2026-06-05 · 类型：进入 Sprint-2 前的完整架构审计（**只读**）· 基线：`170a33c`（已推送 origin/main）
> 约束遵守：未改 src/apps/packages、未改/新建迁移、未新增业务代码或 API、未进入 Sprint-2。结论以源文档与 Sprint-1 实现为证据。
> 审计范围：development-roadmap §5 · database-design（§5/§7/§8/§9/§10）· agent-architecture · api-overview §4.2 · sprint-1-audit-package · sprint-1.5-stabilization-audit；旁证 spike-001-audit-package · architecture-audit-package（L/R 出处）· decision-log（ADR-006/007/015/019/020/021）· 0002/0003 迁移 + `schema.ts`/`client.ts`/`status.ts`/`task.service.ts`。
> 同主题既有评审（结论一致、互补）：[sprint-2-architecture-readiness-review](./sprint-2-architecture-readiness-review.md)（7 问深审）、[sprint-2-readiness-review](./sprint-2-readiness-review.md)（A/B/C/D 就绪）。本文聚焦 ADR-006/007/015 复核 + 4 张矩阵 + L 系风险重评。**三文档存在内容重叠（文档债），建议择一为准，见 §Go/No-Go 末注。**

---

# Executive Summary

**结论：🟡 CONDITIONAL GO（有条件放行）**

Sprint-2 设计层完备自洽，**无设计级阻塞**。ADR-006/007/015 决策齐备且可实现；Sprint-1 已奠基可复用的集中状态机 / 事务+审计 / RLS 上下文模式；Spike-001 已将真实 Provider 风险（L5/R3）收口至低位（且属 S4，与 S2 无关）。**允许进入 Sprint-2**，前提是在编码状态机/迁移**之前**解除 2 项 Critical（首日决策/验证，非缺陷）。

| 审计项 | 结论速览 |
|--------|----------|
| ① ADR-006 四层机 | 🟢 权威源唯一可达；4 处未来双源风险已识别（见 State Authority Matrix）；S2 由**新建 domain 状态机模块**成为 workflow/stage 唯一权威 |
| ② ADR-007 循环外键 | 🟡 用户所指"asset_versions↔stage_runs"**实为单向非循环**；真实循环对有**两处**（content_assets↔asset_versions、workflow_runs↔stage_runs）；迁移层（node-pg-migrate 原生 SQL）**支持** DEFERRABLE；须实测、须调迁移顺序（ALTER 补回指针 FK）|
| ③ ADR-015 schema_version | 🟢 S2 须为 6 个 JSON 契约字段强制 schema_version（见 JSON Contract Matrix）；S1 已证模式 |
| ④ Workflow Engine | 🟢 schema **数据驱动、支撑任意 N 阶段**（含 6 阶段 MVP）；无关键字段缺失（仅 2 处 Minor：无 error_data 列、Review 阶段执行依赖 S3）|
| ⑤ Asset Version | 🟡 只追加/指针/血缘/去重设计完整；**缺 DB 级 append-only 强制**（仅文档规则）|
| ⑥ API 契约 | 🟡 用户所列 4 端点**不足**——roadmap 定义 6 个，缺 2 个资产读端点（S2 前端"资产版本列表"必需）|
| ⑦ Risk Matrix v2 | L1 已解除；L2 高→中；L3 高→中；L4 中（未变，待实测+发现两处）；L5 高→低（Spike-001，且属 S4）|

**风险数量**：🔴 Critical 2 · 🟠 Major 5 · 🟡 Minor 4（详见 Risk Matrix v2）。

---

# State Authority Matrix（① ADR-006 四层状态机集中化）

**审计问题**：是否存在多个状态机定义来源？是否存在未来双源风险？S2 应由哪个模块成为唯一权威？

**权威矩阵**（每个状态/指针的唯一真相源；非权威源不得反向写）：

| 状态 / 指针 | 唯一权威源 | 驱动方向（db 依据）| 非权威 / 呈现源 | S2 落点 |
|------------|-----------|-------------------|-----------------|---------|
| `content_tasks.status` | DB CHECK 值域 + domain `content-task/status.ts` 转换 | 任务领域机（§8.1）| 前端 `StatusBadge` / `TaskDetailPage.ACTIONS`（仅触发，权威在后端；D1 已收口）| S1 已建；S2 接入 running/waiting_review |
| `workflow_runs.status` | DB CHECK + **S2 新建 domain workflow 机** | db §8.2 | content-workflow §4.1 业务进度图（文档明示**非权威**）| **S2 新建＝唯一权威** |
| `workflow_runs.current_stage_run_id` | `stage_runs`（权威），此为冗余指针 | 阶段推进时回填 | 自身仅加速展示 | S2 |
| `stage_runs.status` | DB CHECK + **S2 新建 domain stage 机** | db §8.3；`approved`/`revision_required` 由 `review_records.decision` 同事务驱动（§8.4）| `gate_result`（快照，非权威）；`agent_sessions.status`（运行时，非权威，agent §7.3）| **S2 新建＝唯一权威** |
| `review_records.decision` | `review_records` 表 | db §8.4 **单一真相源** → 驱动 `stage_runs.status` | `stage_runs.status` 不反向写回 | S3 |
| `content_assets.current_version_id` | `content_assets` 指针（DEFERRABLE）| 资产版本新增时回填 | `current_version` 整数（展示冗余，**非权威**，§9.2）| S2 |
| `content_assets.status` | DB CHECK（S2 子集 draft/archived）| 资产领域规则 | — | S2 子集；S3 扩展 |
| (运行时) `agent_sessions.status` | `agent_sessions`（agent §16.2）| **运行时态，非业务权威**（agent §7.3）| 不得驱动 workflow/stage | S4 |

**多源定义来源核查**：当前**无多个并存的权威定义**。ADR-006"四层"= 任务/工作流/阶段/审查；Agent Session 机（agent §16.2）经 agent §7.3 明示为运行时态、非业务权威，**不构成第 5 台权威机**。content-workflow §4.1 为呈现视图、已标注非权威。

**未来双源风险（须在 S2 防范）**：

| # | 双源风险 | 缓解 |
|---|----------|------|
| DS-1 | UI 动作表（`ACTIONS`）复制转换规则 vs domain 机（**D1 即此风险实体化**：UI 曾擅自含 draft→cancelled）| S2 令 UI 仅触发、不拥有规则；理想由 domain 机**导出 allowed transitions** 给前端（配合 MN-4 泛型引擎）|
| DS-2 | `gate_result` 快照 vs `review_records.decision` | db §8.4 明示 decision 权威；S2 写 gate_result 不得用其驱动 stage 终态（除非 C-1 裁定自动门禁，仍须经集中机）|
| DS-3 | `workflow §4.1` 业务进度图 vs `db §8.2` | 前端进度展示须派生自 `workflow_runs.status`，不另存业务态 |
| DS-4 | 冗余指针 `current_stage_run_id` / `current_version` vs 权威表 | 实现以权威表/指针为准，冗余字段仅展示 |

**S2 唯一权威结论**：`workflow_runs.status`、`stage_runs.status` 的唯一权威 = **S2 新建的 domain 状态机模块**（DB CHECK 约束值域 + 集中转换函数 `assertTransition`），UI / `gate_result` / `agent_sessions` 均非权威。强烈建议（MN-4）抽取泛型 `makeStateMachine(transitions)` 供四台机复用，杜绝 D1 类手写漂移。

---

# Workflow Architecture Review（④ Workflow Engine 6 阶段 MVP）

**审计问题**：`workflow_runs` / `stage_runs` 是否足以支撑 6 阶段 MVP（Planning / Research / Writing / Review / Polish / PublishReady）？是否缺失关键字段？

**数据驱动结论**：阶段由 `workflow_stages` **数据行**定义（`key`/`name`/`position`/`executor_type`/`input_schema`/`output_schema`/`gate_schema`，db §5.5），`stage_runs` 引用阶段定义实例化。**阶段集是 workflow_definition 配置，而非 schema/代码约束 → 任意 N 阶段（含 6 阶段）原生支撑，无需改表**。

**用户 6 阶段 ↔ 文档 9 阶段映射**（ADR-017：9 阶段完整建模 + 执行子集）：

| 用户 MVP 阶段 | 文档阶段（workflow §2）| 资产类型 |
|--------------|----------------------|----------|
| Planning | 选题（+大纲）| topic_brief（/outline）|
| Research | 调研 | research_report |
| Writing | 写作 | draft |
| Polish | 润色 | polished_draft |
| Review | 审核 | （结论入 review_records）|
| PublishReady | 发布准备 | （记录入 publish_records）|

> 省略配图/排版（roadmap §9 标注可配置可跳过），属合法 MVP 子集。

**字段充分性核查**：
- `workflow_runs`（db §5.6）：id / content_task_id / workflow_definition_id / workflow_version / current_stage_run_id / status / started_at / completed_at / created_at / updated_at → **运行追踪充分** ✅
- `stage_runs`（db §5.7）：含 status / `attempt_count`（重试）/ `parent_stage_run_id`（重做血缘）/ `parallel_group`（并行）/ `gate_result`（门禁快照）→ **阶段追踪、重试/重做/并行充分** ✅
- 并行/禁跳/重试-重做语义：`workflow_stage_dependencies`（join_all/join_any，db §5.5.1）+ workflow §5.4/§7.5 完整。

**缺失/隐患**：
- 🟡 Minor：`workflow_runs` / `stage_runs` **无 `error_data` 列**（对照 `tool_invocations` 有 error_data，db §5.17）。`failed` 态的失败详情只能落 `gate_result`（语义不符）或审计。建议 S2 评估为 stage_runs 增 `error_data jsonb`（**本审计不改表，仅建议**）。
- 🔴 **Review 阶段执行依赖 S3**（= C-1）：6 阶段中 Review 是门禁阶段。db §8.3 要求 `running → waiting_review → approved` 才离开，`approved` 仅由审查（db §8.4）产生，而审查能力在 S3。**workflow_runs/stage_runs schema 足以支撑 6 阶段定义与运行创建，但跨 Review/waiting_review 门禁的推进在 S2 无解，须先裁定推进语义**（见 Risk Matrix C-1）。

## ADR-007 循环外键复核（Circular FK Re-validation）（②）

**纠错（以 db 为据）**：用户所指"`asset_versions` ↔ `stage_runs` 循环依赖"**经核实为单向、非循环**——`asset_versions.source_stage_run_id → stage_runs.id`（db §5.10）存在，但 `stage_runs` **无**指向 `asset_versions` 的外键（db §5.7）。真实的循环外键对有**两处**：

| 循环对 | 正向 FK | 反向（指针）FK | ADR-007 是否点名 |
|--------|---------|----------------|------------------|
| **#1 资产** | `asset_versions.content_asset_id → content_assets.id`（NOT NULL，§5.10）| `content_assets.current_version_id → asset_versions.id`（nullable，§5.9）| ✅ 已点名 |
| **#2 工作流** | `stage_runs.workflow_run_id → workflow_runs.id`（NOT NULL，§5.7）| `workflow_runs.current_stage_run_id → stage_runs.id`（nullable，§5.6 注"延迟约束"）| ❌ **未点名** |

**当前 ORM 是否支持？** ✅ **支持**。证据：`schema.ts` 是纯类型镜像，**不建模任何 FK**（无 `.references()`，首行注"DB 真相以 db/migrations 为权威"，sprint-1.5 审计已确认 Drizzle 不建模 CHECK/FK）。**循环外键完全由 node-pg-migrate 原生 SQL（`pgm.sql`）创建**（见 0002/0003 模式），PostgreSQL 16 原生支持 `DEFERRABLE INITIALLY DEFERRED`；运行期插入经 `db.transaction()`（`client.ts` runInProject），延迟约束在 COMMIT 时校验，Drizzle 不感知、不冲突。ADR-019 亦确认"R4 由 node-pg-migrate 原生 SQL 在 S2 落地"。

**是否必须使用 DEFERRABLE INITIALLY DEFERRED？** **推荐但非绝对必须**。两条可行路径：
1. **DEFERRABLE INITIALLY DEFERRED**（推荐）：对每个循环的指针 FK（`current_version_id` / `current_stage_run_id`）声明延迟约束，可单事务内插入双方、COMMIT 时统一校验，最干净。
2. **nullable 指针 + 应用层两步回填**（ADR-007 后果备选）：两指针本就 nullable（§5.6/§5.9），可先插父（指针 NULL）→ 插子（引用父）→ UPDATE 父指针；此路径**不需要 DEFERRABLE**。
→ 二者皆可；**因迁移层支持 DEFERRABLE，建议采路径 1**；但须在 S2 Phase 1 **实测**（项目从未验证，= C-2 / L4）。

**是否需要迁移顺序调整？** ✅ **需要**。循环外键无法在建表 DDL 中按依赖顺序一次声明双向 FK。标准做法：**先建两表（仅声明正向 NOT NULL FK + 指针列暂不加 FK），再 `ALTER TABLE ADD CONSTRAINT` 补回指针 FK（DEFERRABLE）**。此模式与 ADR-020（`stage_runs.agent_profile_id` 先列后 FK）一脉相承。两处循环对均需此顺序处理。

## JSON Contract Matrix（③ ADR-015 schema_version）

**审计问题**：哪些 JSON 字段必须增加 `schema_version`？

依据 db §6.4 + ADR-015（关键 JSON 契约须内含 `schema_version`，演进据此判兼容）。下表标注 S2 范围内字段：

| JSON 字段 | 表 | Sprint | schema_version | 依据 |
|-----------|-----|--------|----------------|------|
| `definition_schema` | workflow_definitions | **S2** | ✅ **必须** | db §6.4 / ADR-015 |
| `input_schema` | workflow_stages | **S2** | ✅ **必须** | db §6.4 / ADR-015 |
| `output_schema` | workflow_stages | **S2** | ✅ **必须** | db §6.4 / ADR-015 |
| `gate_schema` | workflow_stages | **S2** | ✅ **必须** | db §6.4 / ADR-015 |
| `condition_schema` | workflow_stage_dependencies | **S2** | ✅ **必须**（存在时；nullable）| db §5.5.1（条件依赖 schema）|
| `metadata` | asset_versions | **S2** | ✅ **必须** | db §6.4 列举 metadata |
| `gate_result` | stage_runs | **S2** | 🟡 建议 | 结果快照非契约，建议带版本以便演进 |
| `data` / `source_refs` | context_packs | **S2** | 🟡 建议 | 上下文快照，建议带版本（§9.3）|
| `requirement_data` | content_tasks | S1 | ✅ 已实现 | `RequirementDataSchema` 已强制并拒未知版本 |
| `capability_schema`/`permission_schema` 等 | agent/mcp/plugin | S4 | ✅ 必须（届时）| ADR-015 |

**结论**：S2 须为 **6 个"必须"字段**在 API 边界以 TypeBox schema 校验 `schema_version` 并拒绝未知版本（复用 S1 `requirement_data` 已证模式）；3 个"建议"字段宜一并带版本。

---

# Asset Version Review（⑤）

**审计问题**：只追加策略 / 不可修改策略 / 审计关联策略 是否完整？

| 策略 | 设计 | 完整性 | 证据 |
|------|------|--------|------|
| **只追加** | `asset_versions` 版本从 1 单调递增，`UNIQUE(content_asset_id, version)`；每次生成/修改/修订新建版本 | 🟢 设计完整 | db §5.10 / §9.2 / §6.5 |
| **不可修改** | "不允许更新正文引用，只允许追加新版本"；`checksum` 防重复写入；`current_version_id`（DEFERRABLE 指针）移动而旧版本保留 | 🟡 **规则完整但缺 DB 强制** | db §9.2 / §11 |
| **审计关联** | 阶段产出须同事务写 content_assets + asset_versions + 审计（db §10.1）；`audit_events` 多态 `(subject_type, subject_id)` 支持 asset 主体；`source_stage_run_id` 锚定产出阶段血缘 | 🟡 模式具备，**S2 须落地资产审计写入** | db §10.1 / §5.18 / §5.10 |

**关键缺口（🟠 Major MJ-3）**：不可修改目前**仅文档规则、无 DB 级强制**。对照 `audit_events` 以触发器 `cf_audit_immutable` + 权限层撤销 cf_app U/D 双重强制（0003/0004），`asset_versions` 无任何 DB 兜底——持 cf_app 凭据可直接 `UPDATE`/`DELETE` 历史版本。**建议 S2 grants 迁移撤销 cf_app 对 `asset_versions` 的 UPDATE/DELETE**（成本低，与既有 audit 模式一致；本审计不改迁移，仅建议）。

**循环外键**：`content_assets ↔ asset_versions` 为 ADR-007 循环对 #1，处理见上方"ADR-007 循环外键复核"。

**审计关联待落实**：S2 实现阶段完成端点时，资产/版本创建须经 `recordAudit(tx, …)` 同事务写审计（复用 `task.service` 模式），`subject_type` 取 content_asset / asset_version，保证过程可追溯率（roadmap §2.3）。

---

# API Gap Analysis（⑥）

**审计问题**：S2 API（POST /workflow-runs、GET workflow-runs、POST stage-runs/start、POST stage-runs/complete）是否足够？

**核查**：用户所列 **4 端点**对照 roadmap §5.4 / api §4.2 的**6 端点**——**不足**：

| 端点 | 来源 | 用户列出 | 缺口判定 |
|------|------|----------|----------|
| `POST /api/tasks/:id/workflow-runs` | api §4.2 | ✅ | 写审计；须防重（见 GAP-2）|
| `GET /api/workflow-runs/:id` | api §4.2 | ✅ | 宜内嵌阶段列表 |
| `POST /api/stage-runs/:id/start` | api §4.2 | ✅ | — |
| `POST /api/stage-runs/:id/complete` | api §4.2 | ✅ | 写产出+审计单事务 |
| `GET /api/tasks/:id/assets` | api §4.2 | ❌ **遗漏** | **GAP-1：S2 前端"资产版本列表"必需** |
| `GET /api/assets/:id/versions` | api §4.2 | ❌ **遗漏** | **GAP-1：查看资产版本链路必需** |

**Gap 清单**：
- **GAP-1（须补，Major→已在 roadmap 定义）**：缺 `GET /tasks/:id/assets` 与 `GET /assets/:id/versions`；roadmap §5.5 交付物含"资产版本列表"，无此二读端点则前端无法展示。**非新增需求，是用户清单遗漏；以 roadmap 6 端点为准**。
- **GAP-2（Minor MN-2）**：`POST /workflow-runs`、`/stage-runs/:id/complete` 为有副作用写，缺幂等键（ADR-022 / api §2.5）；叠加活跃实例无唯一约束（MJ-1）易重复建实例。
- **GAP-3（Minor MN-3）**：无 `GET /stage-runs/:id` 单阶段详情；可由 `GET /workflow-runs/:id` 内嵌满足，按 UI 需要决定是否补。
- **REST 合规**：`start`/`complete` 为动作子资源（RPC 风格），符合 api §1"写不直接改状态、经领域机"，**非违规**。
- **无重复端点**。

**结论**：S2 API 正确集合为 **roadmap 的 6 端点**（用户 4 + 遗漏的 2 个资产读端点）；另建议补幂等键。无 REST 违规、无冗余。

---

# Risk Matrix v2（⑦ 重评 L2 / L3 / L4 / L5）

> 基线 L 系来自 architecture-audit-package §6。重评纳入 Sprint-1/1.5 交付与 Spike-001 成果。

| ID | 风险 | 原评级 | **v2 评级** | 变化依据 | 对 S2 影响 |
|----|------|--------|-------------|----------|-----------|
| L1 | 应用技术栈未确认（ADR-019）| 中 | **✅ 已解除** | ADR-019 Sprint-1 确定（TS+Node/Fastify+React/Vite+Drizzle+node-pg-migrate）| 无 |
| L2 | 安全强制点未实现+测试 | 高 | **🟡 中** | S1 已实测：审计哈希链/append-only/RLS(audit)/脱敏（sprint-1 审计 §3.2）；**残余确认令牌/沙箱属 S4** | S2 须将审计扩到 workflow/stage/asset 事件；新表无 project_id，隔离经 join（MJ-2）|
| L3 | 四层状态机集中引擎未实现（R2）| 高 | **🟡 中** | S1 已奠基模式（`status.ts` 集中机，1/4 机）；S2 建 workflow/stage 两台 | 残余：无泛型引擎易手写漂移（MN-4，D1 已是实例）|
| L4 | 循环外键 DEFERRABLE 未实测（R4）| 中 | **🟡 中（未降）** | L1 已解除使其可动工，但**仍未实测且发现两处循环对**（ADR-007 仅点名一处）| **= C-2，S2 Phase 1 阻断** |
| L5 | 真实 Provider 端到端未验证（R3/ADR-021）| 高 | **🟢 低** | Spike-001 真实跑通 Claude Code CLI（6/6 能力，0 Critical，2 Major 可补偿）；R3 High→Medium、ADR-021 已验证(CLI) | **与 S2 无关**（S2 无 Agent 执行，阶段人工完成）；残余 SDK/第二 Provider 属 Spike-002/S4 |

**新增 S2 风险（本审计识别）**：

| ID | 等级 | 风险 | 影响 | 建议 |
|----|------|------|------|------|
| **C-1** | 🔴 Critical | 跨 `waiting_review` 门禁的 S2 推进语义未定（审核在 S3）| S2 无法推进多阶段工作流；卡 stage 状态 CHECK 子集与 complete 端点目标态 | Phase 1 裁定；推荐"自动门禁"（无 reviewer 时按 gate_schema 自动 approve，S3 叠加人工）|
| **C-2** | 🔴 Critical | R4 两处循环外键且 DEFERRABLE 未实测（ADR-007 漏 workflow_runs↔stage_runs）| 迁移建表/同事务插入可能失败；可回滚性受损 | Phase 1 实测两处 DEFERRABLE + 调迁移顺序（ALTER 补指针 FK）；更新 ADR-007 |
| MJ-1 | 🟠 Major | 活跃 workflow_run 唯一性无约束（db §4.2 仅文字）| 重试/双击重复建活跃实例，状态分裂 | 部分唯一索引 `(content_task_id) WHERE status∈非终态` 或幂等键 |
| MJ-2 | 🟠 Major | 运行态表无 project_id，隔离须经 join | 漏判则凭 id 跨项目越权 | 仓储强制 join content_tasks；配跨项目访问被拒测试 |
| MJ-3 | 🟠 Major | asset_versions 缺 DB 级 append-only 强制 | cf_app 可改/删历史版本 | grants 撤 cf_app 对 asset_versions 的 U/D |
| MJ-4 | 🟠 Major | S2 状态 CHECK 子集未定（与 C-1 耦合）| CHECK 写错放行不可达态/拒合法态 | 随 C-1 定子集 + 补 dependency_type/executor_type CHECK |
| MJ-5 | 🟠 Major | 并行阶段/异步回写竞态需乐观锁 | 状态覆盖、半完成态 | `updated_at` 乐观锁，冲突 409（arch §15.2）|
| MN-1 | 🟡 Minor | review_records 绑资产非版本（S3）| 审核-版本漂移 | S3 增 asset_version_id |
| MN-2 | 🟡 Minor | 创建/完成端点缺幂等键 | 重复副作用 | Idempotency-Key（ADR-022）|
| MN-3 | 🟡 Minor | 缺 GET /stage-runs/:id | 阶段面板独立刷新不便 | 按需补，或 workflow-run 内嵌 |
| MN-4 | 🟡 Minor | R2 无泛型状态机转换器 | 四台机手写易漂移（D1 类）| 抽 `makeStateMachine` + 测试矩阵 |

**统计**：🔴 Critical **2** · 🟠 Major **5** · 🟡 Minor **4**。

---

# Go / No-Go Decision

## 🟡 CONDITIONAL GO（有条件放行）

**判定**：Sprint-2 数据模型 / 四层状态机权威 / 资产版本策略 / 工作流引擎 / 约束与索引设计**完备、自洽、可实现**；ADR-006/007/015 决策齐备；L1 已解除，L2/L3 降至中、L5 降至低（且属 S4），Spike-001 已验证真实 Provider 链路。**无设计级阻塞，允许进入 Sprint-2**。

**放行前置（S2 Phase 1，编码状态机/迁移之前必须完成）**：
1. **解 C-1**：裁定阶段推进语义（推荐自动门禁），锁定 `stage_runs`/`workflow_runs` 状态 CHECK 子集（连带 MJ-4）。
2. **解 C-2**：实测两处循环外键 DEFERRABLE（含迁移顺序 ALTER 补指针 FK），确认通过或确定两步回填备选。

**纳入 S2 DoD（非阻断）**：MJ-1（活跃唯一/幂等）、MJ-2（运行态项目隔离 join + 越权测试）、MJ-3（asset_versions 撤 U/D）、MJ-5（乐观锁）、MN-4（泛型状态机 + 测试矩阵）、GAP-1（补 2 个资产读端点）。

**阻塞项汇总（若未解则 No-Go）**：仅 **C-1、C-2** 两项；二者为首日决策/验证，非设计缺陷，解除后即可全速实现。

> **文档收敛建议**：本目录现有三份 S2 评审（architecture-readiness / readiness-review / 本 readiness-audit），结论一致但内容重叠形成文档债。建议择本审计为 ADR/矩阵权威、保留 architecture-readiness 为深审附录，归并或删除 readiness-review，避免未来双源漂移。**因本任务仅允许新增本文件、禁止改他文件，归并待你指令。**

---

> 本审计为只读交付：仅新增本文件，未改任何代码/数据库/迁移，未创建迁移，未进入 Sprint-2，未提交、未推送。停止，等待下一步指令。
