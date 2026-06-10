# Sprint-2 启动前架构审查（Architecture Readiness Review）

> 日期：2026-06-05 · 阶段：Sprint-2 启动前只读审查 · 基线提交：`170a33c`
> 性质：**只读审查**——未写代码、未改数据库、未建迁移、未提交。所有结论以源文档/实现为证据，权威以源文档为准。
> 审读范围：development-roadmap · database-design · api-overview · agent-architecture · content-workflow（实为 `07-workflow/content-workflow.md`，无 `workflow-design.md`）· state-machine-closure · sprint-1-audit-package · sprint-1.5-stabilization-audit · architecture-audit-package（R2/R4/R7 出处）· decision-log（ADR-006/007/015/020）· system-architecture §13/§15 · 0002/0003 迁移 + Sprint-1 实现。

---

## 1. Executive Summary

**结论：🟡 CONDITIONAL GO（有条件放行）**

Sprint-2 的数据模型、状态机、版本策略、API 契约、索引/约束设计**整体完备、自洽、可支撑实现**，ADR-006/007/015/020 已为 R2/R4/R7 提供明确决策，Sprint-1 已验证可复用的状态机/事务+审计/RLS 上下文模式。**可进入 Sprint-2**，但须在编码阶段状态机**之前**先解一处阻断性语义决策（BLK-1）并完成一项前置验证（BLK-2），否则会写错 `stage_runs.status` 约束集与 complete 端点行为。

| 维度 | 结论 |
|------|------|
| workflow_runs 设计 | 🟢 健全；1 处活跃实例唯一性未约束（M3）|
| stage_runs 设计 | 🟡 状态机完备，但**跨 waiting_review 门禁的 S2 推进语义未定**（BLK-1）|
| assets / asset_versions | 🟢 append-only/版本策略完备；缺 DB 级强制（M5，加固）|
| 审核链路（review↔version↔stage）| 🟡 review 绑 `content_asset_id` 而非 `asset_version_id`，存在审核-版本漂移（M4，S3 修）|
| Sprint-2 API | 🟢 无重复/无 REST 违规；幂等与 stage 详情为 Info 级补强 |
| 数据库 FK/唯一/CHECK/索引 | 🟡 索引/唯一充分；**R4 循环外键有两处**（BLK-2）、S2 状态 CHECK 子集待定 |
| R2 状态机集中化 | 🟢 可实现（S1 已奠基模式，建议抽公共转换器）|
| R4 DEFERRABLE 循环外键 | 🟡 可实现（node-pg-migrate 原生 SQL），但**须实测且覆盖两处**|
| R7 JSON schema_version | 🟢 可实现（S1 已验证 requirement_data 模式）|

**阻断项**：BLK-1（阶段推进语义）、BLK-2（R4 两处循环外键的 DEFERRABLE 实测）——均为"S2 编码前须解"，非"设计缺陷"。解除后即可全速实现。

---

## 2. Findings

### Q1. workflow_runs 设计漏洞审查

**生命周期 / 状态机**（db §8.2 为权威）：`pending → running → {waiting_review↔running, completed, failed↔running, terminated}`，终态 `completed/terminated → archived`。生命周期清晰、可持久化可恢复（db §10.1 要求"创建工作流实例与初始阶段运行"单事务）。

**创建时机**：`POST /api/tasks/:id/workflow-runs`（roadmap §5.4）。`workflow_version` 快照启动时定义版本（db §9.1），运行中不随定义升级——✅ 防版本漂移。

**与 task 的关系**：`workflow_runs.content_task_id` FK（db §5.6）；db §4.2 明示"一个任务可启动多个工作流实例，**通常只有一个活跃实例**"。

**🔴 漏洞 M3（活跃实例唯一性未约束）**：DB 无任何约束阻止同一 `content_task_id` 同时存在多个非终态 `workflow_runs`。配合 `POST .../workflow-runs` 在重试/双击下可重复创建活跃实例。db §4.2 仅以文字"通常只有一个"表述，未落约束。→ 见 R-FIX F3。

**🟡 关注 M6（运行态表无 project_id）**：`workflow_runs` 无 `project_id` 列（db §5.6），经 `content_task_id → content_tasks.project_id` 间接归属。Sprint-1 的两种隔离手段（audit_events 的 RLS 谓词、content_tasks 的仓储显式 `project_id` 谓词，见 `client.ts`/`content-task.repository.ts`）**对 workflow_runs 均不直接适用**。符合 ADR-009 范围（仅敏感快照表强制携带 project_id），但要求 S2 仓储**每次查询经 join content_tasks 强制项目作用域**，否则可凭 id 跨项目读取。→ 见 R-FIX F6。

**`current_stage_run_id`**：冗余当前阶段指针，db §5.6 注明"延迟约束"——此为 R4 的**第二处循环外键**（与 stage_runs 互引），见 Q6/BLK-2。

---

### Q2. stage_runs 设计漏洞审查 + 完整状态机

**并行**：✅ 支持。`stage_runs.parallel_group`（db §5.7）+ `workflow_stage_dependencies.dependency_type ∈ {finish_to_start, join_all, join_any}`（db §5.5.1）+ join 语义（workflow §7.5）。roadmap §5.3 允许 S2 仅实现 `finish_to_start` 线性依赖，但**依赖表与发布时无环校验 S2 必须落地**（依赖不只存 JSON）。

**跳阶段**：✅ 禁止。`pending → skipped` 仅由"条件不满足"进入（workflow §4.2），非任意跳过；硬规则见 workflow §11 + roadmap §5.6 回归测试"禁止跳过未完成阶段进入后续阶段"。依赖图 `finish_to_start` 强制顺序。

**重复执行**：✅ 二义已消解（workflow §5.4）。同 run 原地重试（`failed→running`，`attempt_count+1`，不写 `parent_stage_run_id`）vs 跨 run 重做（`revision_required→running` 或回滚，新建 stage_run，`parent_stage_run_id` 指来源，attempt 从 1，强制新 asset_version）。

**完整阶段运行状态机**（权威：db §8.3，对齐 workflow §4.2/§5.4）：

```
[*] --> pending
pending          --> running           : 开始执行 (POST /stage-runs/:id/start)
pending          --> skipped           : 条件跳过（仅依赖条件不满足）
running          --> waiting_review     : 产出完成 (POST /stage-runs/:id/complete)
running          --> failed             : 执行失败
failed           --> running            : 同 run 原地重试 (attempt_count+1, 不写 parent)
waiting_review   --> approved           : 审查通过【S3 经 review_records.decision 驱动】
waiting_review   --> revision_required  : 退回修改【S3】
revision_required--> running            : 跨 run 重做 (新 stage_run, parent_stage_run_id←来源, attempt=1)
approved         --> [*]                : 终态
skipped          --> [*]                : 终态
```

- 状态值（7）：`pending, running, waiting_review, approved, revision_required, failed, skipped`。
- **无 stage 级 `rejected`/`terminated`**：审查 `rejected` → `revision_required` + 强制新建 stage_run；`terminated` 在工作流级处理（workflow §4.1 落点）。S3 实现者须注意 decision↔stage 状态非 1:1。
- 单一真相源（db §8.4 / ADR-006）：审查"是否通过"以 `review_records.decision` 为权威，同事务驱动 `stage_runs.status`，不反向写回；结论产生前停留 `waiting_review`。

**🔴 阻断 BLK-1（跨 waiting_review 门禁的 S2 推进语义未定）**：状态机要求 `running → waiting_review → approved` 才能离开一个阶段，而 `approved` 仅由审查产生（db §8.4），**审查能力（review_records + approve 端点）在 S3**（roadmap §6.3/§6.4）。依赖激活（workflow §7.5）要求上游 `approved` 后才激活下游。**推论：S2 在无审核能力下无法使任一阶段达到 `approved`，因而无法推进到下游阶段**——这与 S2 最小结果"推进阶段"（roadmap §3/§5.2）直接冲突。须在 S2 设计首日裁定推进语义（见 BLK-1 详述与建议）。此决策同时决定 `stage_runs.status` 的 S2 CHECK 子集（M8）与 `complete` 端点的目标状态。

---

### Q3. assets / asset_versions 审查 + 版本策略

**append-only**：✅ 设计满足。`asset_versions` 只追加，`version` 从 1 单调递增，`UNIQUE(content_asset_id, version)`（db §5.10/§7.1）；db §9.2/§11 明示"不允许更新正文引用，只允许追加新版本"。

**覆盖历史风险**：🟢 低。`content_assets.current_version_id`（DEFERRABLE 循环 FK，权威指针）移动而旧版本保留；`current_version` 整数仅展示冗余；`checksum` 检测内容变化、防重复写入（db §9.2）。

**🟡 加固 M5（缺 DB 级 append-only 强制）**：与 `audit_events`（触发器 `cf_audit_immutable` + 权限层撤销 cf_app U/D，见 0003/0004）不同，`asset_versions` 的"不可覆盖"**目前仅为文档规则，无 DB 强制**。持 cf_app 凭据可直接 UPDATE 历史版本。建议 S2 grants 迁移**撤销 cf_app 对 `asset_versions` 的 UPDATE/DELETE**（与 §6.5/§11 一致，成本低）。→ 见 R-FIX F5。

**审计要求**：阶段产出须在同事务写 `content_assets` + `asset_versions` + 审计（db §10.1"资产版本新增与当前版本更新"；ADR-008）。`audit_events` 多态 `(subject_type, subject_id)` 支持 asset 主体（db §5.18），S2 须为资产/版本创建写审计（复用 `recordAudit(tx, ...)` 同事务模式，见 `task.service.ts`）。

**版本策略（输出）**：

| 维度 | 策略 | 依据 |
|------|------|------|
| 追加 | 只追加，version 单调递增，UNIQUE(asset_id, version) | db §5.10/§9.2 |
| 当前指针 | `current_version_id`（DEFERRABLE 循环 FK，权威）；`current_version` 仅展示 | db §5.9/§9.2/ADR-007 |
| 血缘 | `asset_versions.source_stage_run_id` 锚定产出阶段；分叉经 `stage_runs.parent_stage_run_id` | db §5.10 / workflow §5.5 |
| 去重 | `checksum` 防重复写入 | db §9.2 |
| 失效（S3）| 上游回滚 → 下游 `content_assets.status=stale`，重做产新版本转回；stale 不得审核/发布 | workflow §5.5 / db §5.9 |
| 发布锚定（S4）| `publish_records.asset_version_id`（不可变）固定已发布版本，不随修订漂移 | db §5.21/§9.5 |
| S2 落地子集 | `content_assets.status` 仅 `draft`/`archived`；其余待 S3 | roadmap §5.3 |

---

### Q4. 审核链路审查（review ↔ asset_version ↔ stage_run）

> review_records 为 **S3 表**（roadmap §6.3），S2 不建。此处前瞻审查其与 S2 所建 asset_versions 的接口契约。

**三者关系**：`review_records.stage_run_id`（NOT NULL，被审阶段）+ `content_asset_id`（nullable，被审资产）+ `reviewer_id`（db §5.11）。审查结论 `decision` 同事务驱动 `stage_runs.status`（db §8.4 单一真相源）。stage↔review 关系**清晰**。

**🟡 漏洞 M4（审核对象不明确：审核-版本漂移）**：`review_records` 关联 `content_asset_id`（资产）而**无 `asset_version_id`（版本）**。资产是可变指针（`current_version_id` 随新版本前移），版本才是不可变快照。后果——

- **审核后资产变化**：审查 approve 记录在"资产"上；若此后同资产产生新版本（如润色再改），无法从 review_record 判定"当初批准的是哪一版"。发布端正确地锚 `asset_version_id`（db §5.21），但审核端只锚资产，二者粒度不一致。
- **缓解（部分）**：workflow §5.5 规定回滚使下游资产 `stale` 且"重做完成前不得进入审核或发布"——阻断了回滚路径下的脏审核；但非回滚的常规改版仍存在版本归属歧义。

**处置**：非 S2 阻断（review 属 S3）。**S3 建 review_records 时应增 `asset_version_id`**（锚定被审版本）。**S2 须保证 asset_versions 可被独立寻址**（已满足：`id` + `(content_asset_id, version)` 唯一 + `source_stage_run_id`），为 S3 审核锚定留接口。→ 见 R-FIX F4。

---

### Q5. Sprint-2 API 审查

S2 端点（api §4.2 / roadmap §5.4）：`POST /tasks/:id/workflow-runs`、`GET /workflow-runs/:id`、`POST /stage-runs/:id/start`、`POST /stage-runs/:id/complete`、`GET /tasks/:id/assets`、`GET /assets/:id/versions`。

- **缺接口**：无 `GET /stage-runs/:id`（单阶段详情）。UI"阶段详情面板"（roadmap §5.5）可由 `GET /workflow-runs/:id` 内嵌阶段列表满足；若面板需独立刷新则补。**Info 级**。
- **重复接口**：无。
- **REST 违规**：`/stage-runs/:id/start|complete` 为动作子资源（RPC 风格），但符合 api §1"写操作不直接改状态，由领域机校验"原则，且 api-overview 既定此风格——**非违规**。
- **🟡 幂等（M-API）**：`workflow-runs` 创建与 `stage-runs/:id/complete` 为有副作用写。ADR-022/api §2.5 要求写操作支持幂等键。S2 无外部副作用，优先级中；但 `workflow-runs` 创建配合 M3（活跃实例无唯一约束）在重试下会重复建实例——**须以幂等键或活跃唯一约束防重**。→ 并入 R-FIX F3。
- **🟡 状态码**：状态机非法流转 → 409、乐观锁冲突 → 409（api §2.3 / arch §15.2）。S2 须落地 409 语义（Sprint-1 `assertTransition` 已映射 409，模式可复用）。

---

### Q6. 数据库审查（FK / 唯一 / CHECK / 索引）

**FK**：S2 八表 FK 完整（db §5.4–5.10）。例外——`stage_runs.agent_profile_id` 按 **ADR-020 仅保留列、FK 延后至 S4**（agent_profiles S4 建表），S2 迁移须注释说明以保证可回滚。

**🔴 阻断 BLK-2（R4 循环外键有两处，ADR-007 仅点名一处）**：
| 循环对 | 依据 | ADR-007 是否点名 |
|--------|------|------------------|
| `content_assets.current_version_id ↔ asset_versions.content_asset_id` | db §5.9/ADR-007 | ✅ 已点名 |
| `workflow_runs.current_stage_run_id ↔ stage_runs.workflow_run_id` | db §5.6（注"延迟约束"）| ❌ **ADR-007 未点名** |
两处均需 `DEFERRABLE INITIALLY DEFERRED` 或应用层两步插入。node-pg-migrate 原生 SQL 支持 DEFERRABLE（ADR-019），但 **S1 无循环外键、DEFERRABLE 行为从未实测**（architecture-audit L4"S2 实现前验证"）。→ 见 BLK-2 / R-FIX F2。

**唯一约束**：✅ 完备。`workflow_definitions (project_id,name,version)` + 部分唯一 `(project_id,name) WHERE status='active'`（db §7.2）；`workflow_stages (wd_id,key)`/`(wd_id,position)`；`stage_dependencies (stage_id,depends_on_stage_id)`；`asset_versions (content_asset_id,version)`；`context_packs` 两条部分唯一索引（task 级/stage 级）。

**CHECK**：🟡 **S2 状态 CHECK 子集待定**。db 未像 content_tasks 那样逐表枚举 S2 的 CHECK 值集。须明确：
- `content_assets.status`：S2 仅 `draft`/`archived`（roadmap §5.3），S3 补全（同 content_tasks 的 S1 子集→S3 扩展模式）。
- `workflow_runs.status` / `stage_runs.status`：是否在 S2 即落 §8.2/§8.3 全集，还是子集？**与 BLK-1 强耦合**（无审核则 waiting_review/approved/revision_required 不可达）。→ 见 M8 / R-FIX F1。
- 另需 `dependency_type`、`executor_type`、`workflow_definitions.status` 的 CHECK（值集见 db §5.4/§5.5/§5.5.1）。

**索引**：✅ 充分。db §7.1/§7.2 已覆盖全部 S2 表（workflow_runs/stage_runs/content_assets/asset_versions/context_packs/stage_dependencies），含 DAG 依赖加载双向索引。

---

### Q7. 风险重评（R2 / R4 / R7 是否可进入实现）

**R2 状态机集中化（ADR-006）→ 🟢 可实现**。Sprint-1 已奠基可复用模式：`status.ts` 以 `TRANSITIONS` 表 + `assertTransition/canTransition`（非法→`InvalidTransitionError`→409）集中单实体状态机，`task.service` 以 `runInProject` 事务内编排"变更 + 同事务审计"。S2 须新增 workflow_runs/stage_runs 两台机（review 机 S3）。**建议**：抽取一个泛型 `makeStateMachine(transitions)` 公共转换器供四台机复用，避免每实体手写漂移（ADR-006"禁止散落手写"）；并建**状态流转测试矩阵**覆盖全部合法/非法转换（ADR-006 后果）。

**R4 DEFERRABLE 循环外键（ADR-007）→ 🟡 可实现，须前置实测且覆盖两处**。node-pg-migrate 原生 SQL DDL 支持 `DEFERRABLE`（ADR-019 确认"R4 由原生 SQL 在 S2 落地"）。但 DEFERRABLE 从未在本项目实测，且循环对有**两处**（见 BLK-2）。**建议**：S2 第一项迁移即对两处建 DEFERRABLE FK，并写集成测试验证"同事务先插父后回填指针"成立；若 DEFERRABLE 异常，回退 ADR-007 后果方案（应用层两步提交）。

**R7 JSON schema_version（ADR-015）→ 🟢 可实现**。Sprint-1 已验证：`requirement_data` 经 TypeBox `RequirementDataSchema` 强制 `schema_version`，并拒绝未知版本（content-task 单测 `rejects wrong requirement schema_version`）。S2 新增 JSON 契约——`definition_schema`/`input_schema`/`output_schema`/`gate_schema`（workflow_stages）、`gate_result`（stage_runs）、`metadata`（asset_versions）、`data`/`source_refs`（context_packs）——**均须内含 `schema_version` 并在 API 边界 TypeBox 校验、拒绝未知版本**（db §6.4/ADR-015）。

---

## 3. Blocking Issues

> "阻断"= S2 编码前必须解除，否则会写错状态机/约束/端点行为。两项均为"决策/验证"而非"设计缺陷"。

### 🔴 BLK-1 — 阶段推进语义未定（跨 waiting_review 门禁 vs 审核在 S3）

- **问题**：db §8.3 要求阶段经 `waiting_review → approved` 才离开，`approved` 仅由审查（db §8.4）产生，而审查能力在 S3。S2 因此无法推进多阶段工作流，与 roadmap §3/§5.2"推进阶段"冲突，并卡住 `stage_runs.status` CHECK 子集与 `complete` 端点目标态的确定。
- **须裁定**：S2 阶段推进采用哪种语义（见 R-FIX F1 三选项）。
- **建议默认**：**F1-A 自动门禁**——S2 `complete` 在"无人工 reviewer 配置"时由领域层依 `gate_schema`/`gate_result` 自动判定（auto-approve）使阶段达 `approved` 并激活下游；S3 在其上叠加人工 `review_records` 审核。最贴合 ADR-006（结论驱动 stage 状态）、不破坏 §8.3、S3 无需返工。

### 🔴 BLK-2 — R4 DEFERRABLE 未实测且循环外键有两处

- **问题**：两处循环外键（assets 对 + workflow_runs/stage_runs 对）均依赖 DEFERRABLE，但本项目从未实测；ADR-007 仅点名 assets 一处，存在遗漏 workflow_runs/stage_runs 对的风险。
- **须完成**：S2 实现前以一支迁移 + 集成测试验证两处 DEFERRABLE 行为（同事务父子互引插入成立）；更新 ADR-007 措辞纳入第二处（文档收敛，留待批准）。

---

## 4. Recommended Fixes

> 仅为建议清单，**本审查不实施**。优先级：P0=S2 编码前 / P1=S2 实现期 / P2=S3+。

| ID | 修复建议 | 关联 | 优先级 |
|----|----------|------|--------|
| F1 | 裁定 BLK-1 推进语义并据此定 `stage_runs.status` / `workflow_runs.status` 的 S2 CHECK 子集（推荐 F1-A 自动门禁；S2 即落全集或明确子集，仿 content_tasks 子集→S3 扩展）| BLK-1/M8 | **P0** |
| F2 | S2 首迁移对**两处**循环外键建 `DEFERRABLE INITIALLY DEFERRED`，配集成测试验证；更新 ADR-007 纳入 workflow_runs/stage_runs 对 | BLK-2 | **P0** |
| F3 | 防活跃工作流实例重复：`workflow_runs` 加部分唯一索引 `(content_task_id) WHERE status IN (非终态集)` 或创建端点幂等键（ADR-022）| M3/M-API | P1 |
| F4 | S3 建 `review_records` 时增 `asset_version_id` 锚定被审版本；S2 保证 asset_versions 可独立寻址（已满足，勿回退）| M4 | P2 |
| F5 | S2 grants 迁移撤销 cf_app 对 `asset_versions` 的 UPDATE/DELETE，使 append-only 获 DB 级强制（对齐 audit_events / §6.5/§11）| M5 | P1 |
| F6 | S2 运行态表（workflow_runs/stage_runs/content_assets/asset_versions）仓储查询**强制 join content_tasks 注入 project 作用域**；配"凭 id 跨项目访问被拒"集成测试 | M6 | P1 |
| F7 | 抽泛型状态机转换器供四台机复用 + 建全转换测试矩阵（ADR-006）| R2 | P1 |
| F8 | S2 新增 JSON 契约（definition/input/output/gate_schema、gate_result、metadata、data/source_refs）均含 `schema_version` 并 TypeBox 校验拒未知版本（ADR-015）| R7 | P1 |
| F9 | 阶段状态转换 + 单记录更新用乐观锁（`updated_at` 校验，S2 表均有该列）防并行阶段/异步回写竞态，冲突 409（arch §15.2）| M7 | P1 |
| F10 | 阶段产出在同事务写 content_assets + asset_versions + 审计；`stage_runs.agent_profile_id` 迁移注释 FK 延后 S4（ADR-020）| db §10.1/ADR-020 | P1 |
| F11 | （可选）补 `GET /stage-runs/:id` 单阶段详情；否则由 `GET /workflow-runs/:id` 内嵌阶段满足 | Q5 | P2 |

---

## 5. Sprint-2 Go / No-Go

### 🟡 CONDITIONAL GO

**判定**：S2 数据模型/状态机/版本/API/约束设计完备自洽，R2/R4/R7 决策齐备，S1 已验证可复用基础。**允许进入 Sprint-2**。

**放行条件（编码阶段状态机前须完成）**：
1. **裁定 BLK-1**（阶段推进语义），据此锁定 stage/workflow 状态 CHECK 子集与 `complete` 端点目标态（F1）。
2. **完成 BLK-2**（两处循环外键 DEFERRABLE 实测）后再写运行态迁移（F2）。

**非阻断但须纳入 S2 DoD**：F3/F5/F6/F7/F8/F9/F10（活跃实例唯一、资产 append-only 强制、运行态项目隔离、状态机集中+测试矩阵、JSON schema_version、乐观锁、产出事务+审计）。

**无设计级阻塞**：无表结构缺失、无不可调和的模型冲突。两阻断项均为"S2 首日决策/验证"，一次解除即可全速实现。

---

## 6. 风险评级表

| ID | 风险/发现 | 区域 | 等级 | 证据 | 处置 |
|----|-----------|------|------|------|------|
| BLK-1 | 跨 waiting_review 推进语义未定（审核在 S3）| 阶段机 | 🔴 阻断 | db §8.3/§8.4 · roadmap §6 | F1（P0）|
| BLK-2 | R4 循环外键两处、DEFERRABLE 未实测 | DB | 🔴 阻断 | db §5.6/§5.9 · ADR-007/019 | F2（P0）|
| M3 | 活跃 workflow_run 唯一性未约束 | workflow_runs | 🟠 高 | db §4.2 | F3（P1）|
| M4 | review 绑资产非版本，审核-版本漂移 | 审核链 | 🟠 高 | db §5.11/§5.21 | F4（P2/S3）|
| M5 | asset_versions 缺 DB 级 append-only 强制 | assets | 🟡 中 | db §6.5/§11 · 0003/0004 | F5（P1）|
| M6 | 运行态表无 project_id，隔离须 join | 隔离 | 🟡 中 | db §5.6–5.10 · ADR-009 | F6（P1）|
| M7 | 并行/异步竞态需乐观锁 | 并发 | 🟡 中 | arch §15.1/§15.2 | F9（P1）|
| M8 | S2 状态 CHECK 子集待定 | DB | 🟡 中 | roadmap §5.3 | F1（P0）|
| M-API | 创建/完成端点幂等缺失 | API | 🟡 中 | api §2.5 · ADR-022 | F3（P1）|
| R2 | 状态机集中化（无泛型转换器易漂移）| 架构 | 🟢 低 | ADR-006 · status.ts | F7（P1）|
| R7 | S2 JSON 契约 schema_version 须落地 | 契约 | 🟢 低 | ADR-015 · db §6.4 | F8（P1）|
| I9 | 缺 GET /stage-runs/:id | API | ⚪ Info | roadmap §5.5 | F11（P2）|

---

## 7. 建议实施顺序

> 严格遵循"先解阻断 → 再建基础设施 → 后做业务推进 → 末做前端/回归"。每步含对应 R-FIX 与验收红线。

**阶段 0 — 解阻断（S2 首日，编码前）**
1. 裁定 BLK-1 推进语义（F1，推荐自动门禁），产出一页决策记录，锁定 stage/workflow 状态 CHECK 子集。
2. DEFERRABLE 实测 spike（F2）：一支临时迁移 + 集成测试验证两处循环外键同事务互引插入；通过后纳入正式迁移设计。

**阶段 1 — 数据库迁移（依赖图先行）**
3. 迁移建 `workflow_definitions / workflow_stages / workflow_stage_dependencies`（含唯一约束 + 无环校验落点 + executor_type/dependency_type/status CHECK）。
4. 迁移建 `workflow_runs / stage_runs`（DEFERRABLE 循环 FK；status CHECK 按阶段 0 子集；`agent_profile_id` 仅列 + 注释 FK 延后 S4 / ADR-020）。
5. 迁移建 `content_assets / asset_versions`（DEFERRABLE 循环 FK；content_assets.status 仅 draft/archived）+ `context_packs`。
6. grants 迁移：cf_app 对新表授 S/I/U（资产版本表撤 U/D，F5）；新运行态表的项目隔离策略（F6 经仓储 join，非 RLS）。
   - **红线**：`pnpm migrate:up`/`down` 双向可回滚；DEFERRABLE 实测通过；无环校验有单测。

**阶段 2 — 领域与状态机（R2 集中化）**
7. 抽泛型状态机转换器，落 workflow_runs / stage_runs 两台机 + 全转换测试矩阵（F7）。
8. JSON 契约 TypeBox schema（含 schema_version 校验，F8）。
   - **红线**：状态机非法流转 409；schema_version 未知版本被拒；流转矩阵覆盖全合法/非法。

**阶段 3 — 应用服务与 API（事务一致性）**
9. Workflow Service：`POST /tasks/:id/workflow-runs`（活跃唯一/幂等 F3；创建实例 + 初始 stage_runs + 审计**单事务** db §10.1）；`GET /workflow-runs/:id`（内嵌阶段）。
10. Stage State Machine + 端点 `start`/`complete`：complete 按阶段 0 语义推进 + 产出写 content_assets/asset_versions + 审计**单事务**（F10）；乐观锁防竞态（F9）。
11. Asset/Context 服务 + `GET /tasks/:id/assets`、`GET /assets/:id/versions`；运行态查询强制项目 join（F6）。
   - **红线**：跨项目凭 id 访问被拒（自动化测试）；禁止跳阶段回归测试（roadmap §5.6）；资产版本只追加实测。

**阶段 4 — 前端与回归**
12. 工作流时间线 / 阶段详情面板 / 阶段产出表单 / 资产版本列表 / 内容中心工作流状态列（roadmap §5.5）。
13. 集成 + 前端 + 覆盖率回归（domain ≥90% / 整体 ≥80%，roadmap §4.6/§8.4）。
   - **红线**：启动工作流→完成阶段→生成资产版本闭环可跑通且全绿。

---

> 本审查为只读交付：未改任何代码/数据库/迁移，未提交、未推送。结论待评审。
