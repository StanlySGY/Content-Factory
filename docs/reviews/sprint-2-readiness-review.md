# Sprint-2 就绪审查（Sprint-2 Readiness Review）

> 日期：2026-06-05 · 阶段：Sprint-2 启动前设计审查（只读）· 基线：`170a33c`（已推送 origin/main）
> 性质：**设计审查**——未写业务代码、未改 src/apps/packages、未改迁移、未启动 S2 开发。结论以源文档/Sprint-1 实现为证据，权威以源文档为准。
> 审读范围：development-roadmap §5 · database-design（§5/§7/§8/§9/§10）· agent-architecture · api-overview §4.2 · sprint-1-audit-package · sprint-1.5-stabilization-audit；旁证 architecture-audit-package（R2/R4/R7 出处）· decision-log（ADR-006/007/015/020）· system-architecture §15 · 0002/0003 迁移 + Sprint-1 实现。
> 配套深审：同目录 [`sprint-2-architecture-readiness-review.md`](./sprint-2-architecture-readiness-review.md)（7 问视角，结论一致）。

---

## A. Sprint-2 目标与范围

### A.1 Sprint-2 目标

让内容任务可**启动标准工作流、推进阶段、保存阶段产出并形成资产版本**（roadmap §5.1）。最小可运行结果：可启动工作流、推进阶段、保存阶段资产版本（roadmap §3）。同时落地三项跨 Sprint 风险决策：**R2 状态机集中引擎、R4 DEFERRABLE 循环外键、R7 JSON schema_version**（architecture-audit §8.3）。

### A.2 Sprint-2 范围（做什么）

| 类别 | 交付 | 依据 |
|------|------|------|
| 数据库（8 表）| `workflow_definitions` · `workflow_stages` · `workflow_stage_dependencies` · `workflow_runs` · `stage_runs` · `context_packs` · `content_assets` · `asset_versions` | roadmap §5.3 |
| 领域 | 工作流运行状态机（db §8.2）、阶段运行状态机（db §8.3）；状态流转集中引擎（R2/ADR-006）| roadmap §5.2/§5.4 |
| 约束 | 工作流定义版本不可覆盖；资产版本只追加；DEFERRABLE 循环外键（R4）；JSON 契约含 schema_version（R7）；`workflow_stage_dependencies` 落地 + 发布时无环校验 | roadmap §5.3 / ADR-007/015/018 |
| API（6）| `POST /tasks/:id/workflow-runs`、`GET /workflow-runs/:id`、`POST /stage-runs/:id/start`、`POST /stage-runs/:id/complete`、`GET /tasks/:id/assets`、`GET /assets/:id/versions` | api §4.2 / roadmap §5.4 |
| 前端 | 工作流时间线、阶段详情面板、阶段产出录入表单、资产版本列表、内容中心工作流状态列 | roadmap §5.5 |

### A.3 Sprint-2 不做什么（边界）

| 不做 | 归属 | 依据 |
|------|------|------|
| 审核闭环（`review_records`、approve/request-revision）| S3 | roadmap §6 |
| Dashboard 聚合、文章编辑页、版本对比 | S3 | roadmap §6 |
| 真实 Agent 执行（`agent_sessions`/`agent_messages` 运行）| S4/后续 | ADR-016/021 · agent §15.3 |
| 公众号工作台、发布、`publish_records` | S4 | roadmap §7 |
| `content_assets.status` 全集——S2 仅落 `draft`/`archived`，`review_pending`/`approved`/`rejected`/`stale` 留 S3 | S3 | roadmap §5.3 / db §5.9 |
| `stage_runs.agent_profile_id` 外键（S2 仅保留列）| S4 | ADR-020 |
| 工作流可视化拖拽设计器（MVP 用配置/JSON 编辑）| P1 | ADR-018 |
| Skill/插件真实执行 | 后续 | ADR-016 |

### A.4 Sprint-2 验收标准

- **测试矩阵**：工作流/阶段状态机全合法+非法转换矩阵（ADR-006 后果）；资产版本追加规则单测；启动工作流/完成阶段/生成资产版本集成测试；工作流时间线/阶段完成表单前端测试（roadmap §5.6）。
- **关键回归**：**禁止跳过未完成阶段进入后续阶段**（roadmap §5.6 / workflow §11）。
- **不变量实测**：工作流定义版本不可覆盖；资产版本只追加不覆盖；非法流转 → 409。
- **R4 落地证据**：两处循环外键 DEFERRABLE 在同事务父子互引插入成立的集成测试。
- **可追溯**：阶段产出、状态流转均持久化 + 写审计事件，无仅存聊天上下文的关键数据（roadmap §2.3 / db §10.1）。
- **覆盖率**：核心领域 ≥90%、整体 ≥80%（roadmap §4.6/§8.4）。

---

## B. Sprint-2 风险识别

> 评级：🟢 就绪（决策齐备，可实现）／🟡 有条件（须前置决策或验证）／🔴 阻断（编码前必须解除）。

### B.1 R2 — 状态机集中化（ADR-006）→ 🟢 就绪

- **现状**：Sprint-1 已奠基可复用模式——`domain/content-task/status.ts` 以 `TRANSITIONS` 表 + `assertTransition/canTransition`（非法→`InvalidTransitionError`→409）集中单实体机；`task.service` 以 `runInProject` 事务内编排"变更 + 同事务审计"。
- **S2 增量**：新增 workflow_runs（db §8.2）、stage_runs（db §8.3）两台机；审查机 S3。Agent Session 机（agent §16.2）为运行时态、非业务权威（agent §7.3），不在 ADR-006 四层内、S2 不涉。
- **残余风险**：当前为"每实体内联手写"，四台机结构重复易漂移 → 见 MN-4（建议抽泛型转换器 + 测试矩阵）。

### B.2 R4 — DEFERRABLE 循环外键（ADR-007）→ 🔴 阻断

- **现状**：node-pg-migrate 原生 SQL 支持 `DEFERRABLE`（ADR-019 确认"R4 由原生 SQL 在 S2 落地"）；S1 无循环外键，**DEFERRABLE 行为从未实测**（architecture-audit L4"S2 实现前验证"）。
- **关键风险**：循环外键有**两处**，ADR-007 仅点名一处 → 见 C-2（Critical）。

### B.3 R7 — JSON schema_version（ADR-015）→ 🟢 就绪

- **现状**：S1 已验证——`requirement_data` 经 TypeBox `RequirementDataSchema` 强制 `schema_version`，拒绝未知版本（content-task 单测 `rejects wrong requirement schema_version`）。
- **S2 增量**：`definition_schema`/`input_schema`/`output_schema`/`gate_schema`（workflow_stages）、`gate_result`（stage_runs）、`metadata`（asset_versions）、`data`/`source_refs`（context_packs）**均须含 `schema_version` 并在 API 边界校验、拒未知版本**（db §6.4）。
- **残余风险**：低，模式已证。落地为实现工作量。

### B.4 资产版本体系 → 🟡 有条件

- **就绪**：只追加、`UNIQUE(content_asset_id, version)`、`current_version_id`（DEFERRABLE 指针，权威）、`source_stage_run_id` 血缘、`checksum` 去重（db §5.10/§9.2）设计完备。
- **风险**：① append-only 仅文档规则、缺 DB 级强制（MJ-3）；② 第二处循环外键随之（C-2）；③ S2 `content_assets.status` 子集 CHECK 待定（MJ-4）。

### B.5 工作流运行体系 → 🟡 有条件

- **就绪**：生命周期/状态机清晰（db §8.2）；`workflow_version` 快照防漂移（db §9.1）；创建实例 + 初始阶段同事务（db §10.1）。
- **风险**：① 活跃实例唯一性无约束（MJ-1）；② `workflow_runs` 无 project_id，隔离须 join（MJ-2）；③ `current_stage_run_id` 循环外键（C-2）。

### B.6 阶段运行体系 → 🔴 阻断

- **就绪**：状态机（db §8.3）、并行（`parallel_group` + 依赖图 join_all/join_any）、禁止跳阶段（依赖图 finish_to_start）、重试/重做二义消解（workflow §5.4）设计完备。
- **风险**：**跨 `waiting_review` 门禁的 S2 推进语义未定**（审核在 S3）→ 见 C-1（Critical）；连带 `stage_runs.status` CHECK 子集（MJ-4）、并发竞态乐观锁（MJ-5）。

### B.7 审查体系 → 🟡 有条件（S3 表，S2 前瞻）

- **就绪**：`review_records` 属 S3；S2 须保证其依赖的 `asset_versions` 可独立寻址——已满足（`id` + `(asset_id,version)` 唯一 + `source_stage_run_id`）。审查"是否通过"以 `review_records.decision` 为单一真相源、同事务驱动 `stage_runs.status`（db §8.4/ADR-006）。
- **风险**：① 审核能力缺位直接造成 C-1（阶段无法越门）；② `review_records` 绑资产非版本，审核-版本漂移（MN-1，S3 修）；③ 阶段机无 `rejected`/`terminated` 终态，须以 `revision_required`+新 stage_run / 工作流级 terminated 映射（workflow §4.1，S3 注意）。

---

## C. 设计漏洞（Critical / Major / Minor）

### 🔴 Critical（2）— S2 编码前必须解除

**C-1　阶段推进语义未定（审核能力在 S3，无法越过 waiting_review 门禁）**
- **风险描述**：db §8.3 要求阶段经 `running → waiting_review → approved` 才离开，`approved` 仅由审查产生（db §8.4），而审查（review_records + approve 端点）在 S3（roadmap §6）。依赖激活（workflow §7.5）要求上游 `approved` 后才激活下游。agent-architecture 确认 S2 阶段为人工完成、无 Agent 自动驱动。
- **影响**：S2 无法使任一阶段达 `approved`，**无法推进到下游阶段**，与 S2"推进阶段"目标（roadmap §3/§5.2）冲突；并阻塞 `stage_runs.status` CHECK 子集（MJ-4）与 `complete` 端点目标态的确定。
- **建议**：S2 首日裁定推进语义。**推荐"自动门禁"**：`complete` 在"无人工 reviewer 配置"时由领域层依 `gate_schema`/`gate_result` 自动判定 approve、激活下游；S3 在其上叠加人工 `review_records`。最贴合 ADR-006（结论驱动 stage 状态）、不改 §8.3、S3 零返工。备选：S2 仅演示单阶段执行 + 资产版本，多阶段推进延至 S3（牺牲 S2 演示完整度）。

**C-2　R4 循环外键有两处且 DEFERRABLE 未实测（ADR-007 仅点名一处）**
- **风险描述**：循环外键有两对——`content_assets.current_version_id ↔ asset_versions.content_asset_id`（db §5.9/ADR-007 已点名）与 **`workflow_runs.current_stage_run_id ↔ stage_runs.workflow_run_id`**（db §5.6 注"延迟约束"，**ADR-007 未点名**）。两处均依赖 DEFERRABLE，但项目从未实测。
- **影响**：若遗漏第二处或 DEFERRABLE 行为不符预期，运行态/资产迁移将因循环外键无法建表或同事务插入失败；数据完整性与可回滚性受损。
- **建议**：S2 第一项迁移即对两处建 `DEFERRABLE INITIALLY DEFERRED` FK，配集成测试验证"同事务先插父后回填指针"成立；DEFERRABLE 异常则回退 ADR-007 后果方案（应用层两步提交）。文档侧更新 ADR-007 纳入第二处（待批准）。

### 🟠 Major（5）— S2 实现期解决，纳入 DoD

**MJ-1　活跃 workflow_run 唯一性无约束**
- 描述：DB 无约束阻止同 `content_task_id` 并存多个非终态 `workflow_runs`；db §4.2 仅文字"通常只有一个活跃实例"。
- 影响：重试/双击 `POST .../workflow-runs` 重复建活跃实例，状态分裂、阶段归属歧义。
- 建议：部分唯一索引 `(content_task_id) WHERE status IN (非终态集)`，或创建端点幂等键（ADR-022）。

**MJ-2　运行态表无 project_id，项目隔离须经 join 强制**
- 描述：`workflow_runs`/`stage_runs`/`content_assets`/`asset_versions` 无 project_id（db §5.6–5.10），经 content_task 间接归属。S1 两种隔离手段（audit RLS 谓词、content_tasks 仓储显式谓词）均不直接适用。
- 影响：若仓储漏判，可凭 id 跨项目读写运行态/资产数据（越权）。符合 ADR-009 范围（仅敏感快照表强制携带 project_id），但隔离责任完全落到应用层。
- 建议：运行态仓储每次查询**强制 join content_tasks 注入项目作用域**；配"凭 id 跨项目访问被拒"集成测试。

**MJ-3　asset_versions 缺 DB 级 append-only 强制**
- 描述：与 `audit_events`（触发器 `cf_audit_immutable` + 撤销 cf_app U/D，见 0003/0004）不同，资产版本"不可覆盖"目前仅文档规则（db §6.5/§11），无 DB 强制。
- 影响：持 cf_app 凭据可直接 UPDATE/DELETE 历史版本，破坏版本不可变与可追溯。
- 建议：S2 grants 迁移撤销 cf_app 对 `asset_versions` 的 UPDATE/DELETE（成本低，与既有 audit 模式一致）。

**MJ-4　S2 状态 CHECK 值集子集未定**
- 描述：db 未像 content_tasks 那样枚举 S2 各表 CHECK 值集。`content_assets.status` S2 仅 draft/archived（roadmap §5.3）；`workflow_runs`/`stage_runs` 是否落 §8.2/§8.3 全集待定（与 C-1 强耦合）。
- 影响：CHECK 写错会放行不可达态或拒绝合法态；与 C-1 决策不一致则约束与代码冲突。
- 建议：随 C-1 裁定确定子集（仿 content_tasks S1 子集→S3 扩展模式）；另补 `dependency_type`/`executor_type`/`workflow_definitions.status` CHECK。

**MJ-5　并行阶段/异步回写竞态须乐观锁**
- 描述：arch §15.1/§15.2 明示并发场景（并行阶段、后台 Session 异步回写、多用户同项目）并要求"单记录更新用乐观锁（版本号或 updated_at 校验）"。S2 表均有 `updated_at` 但无强制。
- 影响：并行阶段完成/回写竞态导致状态覆盖、半完成态。
- 建议：状态转换 + 单记录更新以 `updated_at` 乐观锁，冲突 409（arch §15.2）。

### 🟡 Minor（4）— 建议优化 / 前瞻

**MN-1　review_records 绑 content_asset_id 而非 asset_version_id（审核-版本漂移）**
- 描述：review 关联资产（可变指针）而非版本（不可变快照）；发布端正确锚 `asset_version_id`（db §5.21），审核端粒度不一致。
- 影响：常规改版后无法判定"批准的是哪一版"。回滚路径由 workflow §5.5（stale 不得审核）部分缓解。
- 建议：S3 建 `review_records` 时增 `asset_version_id`；S2 保证 asset_versions 可独立寻址（已满足，勿回退）。

**MN-2　创建/完成端点幂等键缺失**
- 描述：`workflow-runs` 创建、`stage-runs/:id/complete` 为有副作用写，ADR-022/api §2.5 要求幂等键。
- 影响：S2 无外部副作用，风险中低；但与 MJ-1 叠加致重复建实例。
- 建议：支持 `Idempotency-Key`（与 MJ-1 二选一或并用）。

**MN-3　缺 GET /stage-runs/:id 单阶段详情端点**
- 描述：UI 阶段详情面板（roadmap §5.5）无独立端点。
- 影响：可由 `GET /workflow-runs/:id` 内嵌阶段满足；若面板需独立刷新则不足。
- 建议：按 UI 实际需要决定是否补；非阻断。

**MN-4　R2 状态机无泛型转换器，四台机易手写漂移**
- 描述：S1 状态机为每实体内联手写；ADR-006 要求"集中引擎/统一转换函数，禁止散落手写"。
- 影响：四台机结构重复，新增/修改易不一致漂移（正是 D1 同类隐患）。
- 建议：抽泛型 `makeStateMachine(transitions)` 供四台机复用 + 全转换测试矩阵。

---

## D. Sprint-2 实施顺序

> 原则：先解 Critical → 再建依赖图先行的迁移 → 后落领域状态机 → 再做应用/API → 末做前端/回归。

### Phase 1 — 解阻断与前置（S2 首日，编码前）
- **目标**：解除 C-1、C-2，锁定状态子集与循环外键方案。
- **交付物**：① C-1 推进语义裁定记录（含 stage/workflow 状态 CHECK 子集）；② DEFERRABLE 实测 spike——临时迁移对两处循环外键建 DEFERRABLE FK + 集成测试验证同事务父子互引插入。
- **验收标准**：推进语义有书面裁定；两处 DEFERRABLE 实测通过（或确定回退两步提交方案）；ADR-007 措辞更新提案就绪。

### Phase 2 — 数据库迁移（依赖图先行）
- **目标**：落地 8 张 S2 表与全部约束/索引。
- **交付物**：迁移①`workflow_definitions`/`workflow_stages`/`workflow_stage_dependencies`（唯一约束 + 无环校验落点 + executor_type/dependency_type/status CHECK）；迁移②`workflow_runs`/`stage_runs`（DEFERRABLE 循环 FK；status CHECK 按 Phase 1 子集；`agent_profile_id` 仅列 + 注释 FK 延后 S4/ADR-020）；迁移③`content_assets`/`asset_versions`（DEFERRABLE 循环 FK；content_assets.status 仅 draft/archived）+ `context_packs`；迁移④grants（cf_app 新表 S/I/U，**资产版本表撤 U/D**，MJ-3）。
- **验收标准**：`pnpm migrate:up`/`down` 双向可回滚；DEFERRABLE 实测通过；无环校验有单测；索引/唯一/CHECK 与 db §5/§7 一致。

### Phase 3 — 领域与状态机（R2 集中化）
- **目标**：落地工作流/阶段两台状态机与 JSON 契约校验。
- **交付物**：泛型状态机转换器（MN-4）+ workflow_runs/stage_runs 两台机 + 全转换测试矩阵（R2/ADR-006）；S2 各 JSON 契约 TypeBox schema（含 schema_version 校验，R7/ADR-015）。
- **验收标准**：非法流转 409；schema_version 未知版本被拒；流转矩阵覆盖全合法/非法转换并通过。

### Phase 4 — 应用服务与 API（事务一致性 + 隔离 + 并发）
- **目标**：落地 6 个 S2 端点，保证单事务一致性、项目隔离、并发安全。
- **交付物**：Workflow Service（`POST /tasks/:id/workflow-runs` 活跃唯一/幂等 MJ-1/MN-2；创建实例 + 初始 stage_runs + 审计**单事务** db §10.1；`GET /workflow-runs/:id` 内嵌阶段）；Stage State Machine + `start`/`complete`（按 Phase 1 语义推进 + 产出写 content_assets/asset_versions + 审计**单事务**；乐观锁 MJ-5）；Asset/Context 服务 + `GET /tasks/:id/assets`、`GET /assets/:id/versions`（运行态查询强制项目 join，MJ-2）。
- **验收标准**：跨项目凭 id 访问被拒（自动化测试）；**禁止跳阶段回归测试**通过（roadmap §5.6）；资产版本只追加实测；启动/完成/生成版本集成测试全绿。

### Phase 5 — 前端与回归
- **目标**：交付 S2 前端并完成整体回归。
- **交付物**：工作流时间线、阶段详情面板、阶段产出录入表单、资产版本列表、内容中心工作流状态列（roadmap §5.5）。
- **验收标准**：启动工作流→进入阶段→保存产出→生成资产版本闭环可跑通；集成+前端+覆盖率回归（domain ≥90% / 整体 ≥80%）全绿；控制台零错误。

---

## E. 审查结论

**判定：🟡 CONDITIONAL GO（有条件放行）**

Sprint-2 目标清晰、范围明确、数据模型/状态机/版本/API/约束设计完备自洽，R2/R4/R7 决策齐备，Sprint-1 已验证可复用的状态机/事务+审计/RLS 上下文基础。**允许进入 Sprint-2**，前提是 Phase 1 先解除两项 Critical（C-1 阶段推进语义、C-2 两处循环外键 DEFERRABLE 实测）——二者为"首日决策/验证"而非设计缺陷，解除后即可全速实现。5 项 Major 须纳入 S2 DoD，4 项 Minor 建议跟踪。

**无设计级阻塞**：无表结构缺失、无不可调和模型冲突。

---

> 本审查为只读交付：仅新增本文件，未改任何代码/数据库/迁移，未提交、未推送。结论待评审。
