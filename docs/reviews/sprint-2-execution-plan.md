# Sprint-2 执行计划（Sprint-2 Execution Plan）

> 日期：2026-06-05 · 阶段：Sprint-2 开发前最终执行计划 · 基线：`170a33c`（已推送 origin/main）
> 性质：**执行计划（只读交付）**——未写业务代码、未改 src/apps/packages、未创建迁移、未进入 Sprint-2 开发。结论以 Phase-1 裁决（C-1/C-2）+ 源文档 + Sprint-1 实现为证据。
> 前置依据：[phase1-audit-package](./sprint-2-phase1-audit-package.md)（Critical 解除聚合）· [review-gate-decision](./sprint-2-review-gate-decision.md)（C-1 自动门禁 PASS）· [deferrable-validation](./sprint-2-deferrable-validation.md)（C-2 DEFERRABLE PASS）· [readiness-audit](./sprint-2-readiness-audit.md) · [architecture-readiness-review](./sprint-2-architecture-readiness-review.md)。
> 实现锚定（Sprint-1，权威）：`domain/content-task/status.ts`（集中状态机）· `application/task.service.ts` + `infrastructure/db/client.ts`（`runInProject` 事务 + 同事务审计）· `db/migrations/0002–0004`（原生 SQL CHECK / 触发器 / RLS / grants）· `packages/shared/src/schemas.ts`（TypeBox `schema_version` 校验）· `apps/api/vitest.config.ts`（覆盖率阈值）。

---

## 前置状态确认（Phase-1 闭环）

| 项 | 状态 | 锁定结论 |
|----|------|----------|
| **C-1** 阶段推进语义 | ✅ PASS | **Option A 自动门禁**：`complete` 对自动门禁阶段在**同事务内** `running→waiting_review→approved` 推进；门禁不通过 → **422** 留 `running` 待重提；S2 不建 `review_records`、无合成数据；S3 人工审查纯增量叠加，零返工 |
| **C-2** DEFERRABLE 循环外键 | ✅ PASS | 两组循环对（Pair-1 资产、Pair-2 工作流）在 PG16.14 实证可用；迁移顺序：**先建表（正向 NOT NULL FK + 指针列）→ ALTER ADD CONSTRAINT … DEFERRABLE INITIALLY DEFERRED**；备选 nullable 两步回填亦成立 |
| **MJ-4** 状态 CHECK 子集 | ✅ 连带解除 | 子集由 C-1 锁定（见 §3） |
| **门禁裁决** | ✅ GO | readiness-audit + phase1-package 判定 GO，无残余设计级阻塞 |

**S2 状态子集（C-1 锁定，全程据此实现）：**

| 实体 | S2 允许 | S2 禁止（S3 单向追加）| CHECK 落点 |
|------|---------|----------------------|------------|
| `stage_runs.status` | pending · running · waiting_review(瞬态) · approved · failed · skipped（6/7）| revision_required | 0007 新建 |
| `workflow_runs.status` | pending · running · completed · failed · terminated · archived（6/8）| waiting_review · revision_required | 0007 新建 |
| `content_tasks.status` | draft · ready · running · completed · cancelled · archived | —（不变）| **不改**（0002 已定）|
| `content_assets.status` | draft · archived（2）| review_pending/approved/rejected/stale | 0008 新建 |

---

## 第一部分 · Sprint-2 最终范围确认

总目标（roadmap §5.1/§3）：让内容任务可**启动标准工作流 → 推进阶段 → 保存阶段产出 → 形成资产版本**；落地 R2（状态机集中引擎）、R4（DEFERRABLE 循环外键）、R7（JSON schema_version）三项跨 Sprint 风险决策。

### P0 — 数据库（8 表）

| 表 | 职责 | 关键约束（详见 §2）|
|----|------|--------------------|
| `workflow_definitions` | 工作流定义（版本化、可发布）| `(project_id,name,version)` 唯一 + 活跃部分唯一；版本不可覆盖；`definition_schema` 含 schema_version |
| `workflow_stages` | 阶段定义（数据驱动，任意 N 阶段）| `(wd_id,key)`/`(wd_id,position)` 唯一；`executor_type` CHECK；`input/output/gate_schema` 含 schema_version |
| `workflow_stage_dependencies` | 阶段依赖图（DAG 边）| `(stage_id,depends_on_stage_id)` 唯一 + 禁自依赖；`dependency_type` CHECK；**无环校验在领域层（发布时）** |
| `workflow_runs` | 工作流运行实例 | Pair-2 循环 FK（DEFERRABLE）；活跃实例部分唯一（MJ-1）；`workflow_version` 快照；status 6 子集 |
| `stage_runs` | 阶段运行实例 | Pair-2 正向 FK；`agent_profile_id` 仅列（FK 延后 S4，ADR-020）；status 6 子集；`updated_at` 乐观锁 |
| `content_assets` | 内容资产（当前指针）| Pair-1 循环 FK（DEFERRABLE）；status 2 子集 {draft,archived} |
| `asset_versions` | 资产版本（只追加）| `(content_asset_id,version)` 唯一；`checksum` 去重；`source_stage_run_id` 血缘；**DB 级 append-only（grants 撤 U/D，MJ-3）** |
| `context_packs` | 上下文快照 | 两条部分唯一索引（task 级/stage 级）；`data/source_refs` 建议含 schema_version |

### P1 — 领域与引擎（R2 集中化 / R7 契约）

| 项 | 交付 | 依据 |
|----|------|------|
| **workflow state machine** | `workflow_runs` 状态机（6 子集，集中转换器，非法→409）| §3 / db §8.2 / ADR-006 |
| **stage state machine** | `stage_runs` 状态机（6 子集，含 **C-1 自动门禁同事务 approve**，门禁不通过→422）| §3 / db §8.3 / C-1 |
| **workflow engine** | 启动实例 + 初始 stage_runs 物化 + 依赖激活（finish_to_start，禁跳阶段）+ 发布时 DAG 无环校验 | roadmap §5.2 / workflow §7.5 |
| **asset version engine** | 只追加版本、`current_version_id` 指针前移、`checksum` 去重、`source_stage_run_id` 血缘 | db §9.2 |
| **context pack snapshot** | 阶段执行时物化上下文快照（含 schema_version）| db §9.3 |
| 泛型状态机转换器 | `makeStateMachine(transitions)` 供两台机复用（MN-4，杜绝 D1 类手写漂移）| ADR-006 |
| JSON 契约 schema | 6 个必含 + 3 个建议含 `schema_version`，API 边界 TypeBox 校验拒未知版本 | §5 / R7 / ADR-015 |

### P2 — API（6 端点，roadmap §5.4，详见 §4）

`POST /tasks/:id/workflow-runs` · `GET /workflow-runs/:id` · `POST /stage-runs/:id/start` · `POST /stage-runs/:id/complete` · `GET /tasks/:id/assets`〔GAP-1〕· `GET /assets/:id/versions`〔GAP-1〕。

> 注：用户初始清单 4 端点不足；以 roadmap 6 端点为准，补 2 个资产读端点（前端"资产版本列表"必需）。

### P3 — 前端（roadmap §5.5）

工作流时间线 · 阶段详情面板 · 阶段产出录入表单 · 资产版本列表 · 内容中心工作流状态列。

### 边界（Sprint-2 不做）

| 不做 | 归属 | 依据 |
|------|------|------|
| `review_records` 表 + approve/request-revision 端点 | S3 | roadmap §6 · C-1 |
| `revision_required` 态、工作流级 `waiting_review` | S3 | §3 状态子集 |
| 真实 Agent 执行（`agent_sessions`/`agent_messages` 运行）；`stage_runs.agent_profile_id` FK | S4 | ADR-020/021 |
| `content_assets.status` 其余值（review_pending/approved/rejected/stale）| S3 | roadmap §5.3 |
| Dashboard 聚合、版本对比、发布工作台、`publish_records` | S3/S4 | roadmap §6/§7 |
| 工作流可视化拖拽设计器（MVP 用 JSON/配置）| 后续 | ADR-018 |

---

## 第二部分 · 数据库实施顺序

### 迁移拆分（依赖图先行）

现状：`db/migrations/0001–0005`（users/projects、content_tasks、audit_events、grants、seed）；**无任何循环外键，S2 表尚未建**。S2 从 **0006** 起。

| 迁移 | 内容 | 拆分理由 |
|------|------|----------|
| **0006** | `workflow_definitions` · `workflow_stages` · `workflow_stage_dependencies`（定义层）| 无运行态依赖、无循环 FK，先落定义层使后续运行态可引用 |
| **0007** | `workflow_runs` · `stage_runs`（运行层）| **Pair-2 循环对**：先建两表（`stage_runs.workflow_run_id` 正向 NOT NULL FK + `workflow_runs.current_stage_run_id` 仅列）→ `ALTER … ADD CONSTRAINT … DEFERRABLE INITIALLY DEFERRED` 补反向指针 FK |
| **0008** | `content_assets` · `asset_versions` · `context_packs`（资产层）| **Pair-1 循环对**：先建两表（`asset_versions.content_asset_id` 正向 NOT NULL FK + `content_assets.current_version_id` 仅列）→ ALTER 补反向指针 FK；context_packs 随资产层落地 |
| **0009 grants**〔必需，承袭 0004 先例〕| cf_app 对新表 S/I/U；**REVOKE cf_app U/D on `asset_versions`**（MJ-3 append-only DB 级强制）| 授权独立成迁移（同 0001–0003 建表 → 0004 grants 的既定模式），单一审计点；phase1-package §5-P0-4 已预告 |

> **关于"0006/0007/0008"**：三支为 8 表的建表 DDL 主干（已逐层依赖先行）。grants 不可省（MJ-3 要求 DB 级 append-only），按 Sprint-1 的 0004 先例独立为 **0009**——这是计划的明确建议，非用户清单遗漏。
> **迁移约定**（沿用 0002–0004）：node-pg-migrate `pgm.sql(原生 SQL)`；CHECK 用 `CONSTRAINT xxx_chk`；`up`/`down` 双向可回滚；`agent_profile_id` 等延后 FK 在迁移注释说明（ADR-020）。

### 逐表约束矩阵

> RLS 列说明：**S2 业务表一律不启用 RLS**（ADR-009：仅敏感快照表 `audit_events` 强制 RLS）。隔离落应用层——`workflow_definitions` 有 `project_id`，仓储显式谓词隔离（仿 content_tasks）；其余表无 `project_id`，仓储查询**强制 join 上溯 content_tasks 注入项目作用域**（MJ-2）。

| 表（迁移）| CHECK | FK | DEFERRABLE | UNIQUE | RLS | append-only |
|-----------|-------|----|-----------|--------|-----|-------------|
| **workflow_definitions**（0006）| `status`（active/draft/archived 等，值集对齐 db §5.4）| `project_id→projects` | — | `(project_id,name,version)` + 部分唯一 `(project_id,name) WHERE status='active'` | 否（仓储 project_id 谓词）| 否（版本行不可覆盖＝领域规则：发布后不改 `definition_schema`，升级走新 version）|
| **workflow_stages**（0006）| `executor_type`（值集 db §5.5）| `workflow_definition_id→workflow_definitions` | — | `(wd_id,key)` · `(wd_id,position)` | 否（经 wd join）| 否 |
| **workflow_stage_dependencies**（0006）| `dependency_type`（finish_to_start/join_all/join_any）· **禁自依赖** `stage_id <> depends_on_stage_id` | `stage_id→workflow_stages` · `depends_on_stage_id→workflow_stages` | — | `(stage_id,depends_on_stage_id)` | 否（经 stage→wd join）| 否；**无环（DAG）校验不在 DB——在领域层发布时执行**（roadmap §5.3/ADR-018）|
| **workflow_runs**（0007）| `status` ∈ 6 子集（pending/running/completed/failed/terminated/archived）| `content_task_id→content_tasks` · `workflow_definition_id→workflow_definitions` · `current_stage_run_id→stage_runs`〔**Pair-2 指针，DEFERRABLE**〕| ✅ `current_stage_run_id`（INITIALLY DEFERRED）| **部分唯一 `(content_task_id) WHERE status NOT IN (终态)`**（MJ-1 活跃实例唯一）| 否（无 project_id，join content_tasks，MJ-2）| 否（`updated_at` 乐观锁，MJ-5）|
| **stage_runs**（0007）| `status` ∈ 6 子集（pending/running/waiting_review/approved/failed/skipped）| `workflow_run_id→workflow_runs`〔**Pair-2 正向 NOT NULL**〕· `workflow_stage_id→workflow_stages` · `parent_stage_run_id→stage_runs`（自引，nullable，重做血缘）· `agent_profile_id`〔**仅列，FK 延后 S4**〕| —（指针在 workflow_runs 侧）| 视需要 `(workflow_run_id,workflow_stage_id,attempt_count)` | 否（join content_tasks）| 否（`updated_at` 乐观锁）；建议增 `error_data jsonb`（failed 详情）|
| **content_assets**（0008）| `status` ∈ {draft,archived}（2 子集）| `content_task_id→content_tasks` · `current_version_id→asset_versions`〔**Pair-1 指针，DEFERRABLE**〕| ✅ `current_version_id`（INITIALLY DEFERRED）| 视需要 `(content_task_id,asset_type)` | 否（join content_tasks）| 否（当前指针前移，旧版本保留）|
| **asset_versions**（0008）| —（`asset_type` 若枚举则 CHECK）| `content_asset_id→content_assets`〔**Pair-1 正向 NOT NULL**〕· `source_stage_run_id→stage_runs`（血缘，nullable，单向非循环）| — | **`(content_asset_id,version)`**（只追加单调递增）| 否（join content_assets→content_tasks）| **✅ 是——DB 级**：0009 grants REVOKE cf_app U/D（MJ-3/F5，对齐 audit_events 模式）|
| **context_packs**（0008）| —（snapshot）| `content_task_id→content_tasks` · `stage_run_id→stage_runs`（nullable）| — | **两条部分唯一索引**：task 级 + stage 级（db §9.3）| 否（join content_tasks）| 否（建议 `data/source_refs` 含 schema_version）|

**索引**（db §7.1/§7.2，随各迁移落地）：workflow_runs `(content_task_id)`；stage_runs `(workflow_run_id, position/status)`；依赖图双向索引 `(stage_id)`/`(depends_on_stage_id)`；asset_versions `(content_asset_id, version)`；context_packs task/stage 部分唯一索引。

**迁移验收红线**：`pnpm migrate:up` / `pnpm migrate:down` 双向可回滚；两组 DEFERRABLE 单事务双插集成测试通过（复用 deferrable-validation 探针逻辑）；DAG 无环校验领域单测通过；CHECK/UNIQUE/索引与 db §5/§7 一致。

---

## 第三部分 · 状态机实施计划

### 落点强制（ADR-006 唯一权威）

| 层 | 是否承载状态机规则 | 说明 |
|----|-------------------|------|
| **Domain Layer** | ✅ **唯一落点** | `apps/api/src/domain/workflow/` 新建：`makeStateMachine(transitions)`（MN-4 泛型转换器）+ `workflow-run/status.ts` + `stage-run/status.ts`，复用 S1 `TRANSITIONS` 表 + `assertTransition/canTransition` 模式；非法流转抛 `InvalidTransitionError`（→409） |
| Controller / HTTP | ❌ 禁止 | 仅解析请求 → 调 Service；不得内联转换规则 |
| Repository | ❌ 禁止 | 仅持久化领域计算后的目标态；不得判定可否流转 |
| UI / 前端 | ❌ 禁止 | 仅触发动作 + 展示；转换规则不复制到前端（`@cf/shared` enums 仅导出状态值与徽章，**不含转换规则**，沿用 S1 enums.ts 约定）；理想由领域机导出 allowed transitions 供前端（DS-1 缓解）|

### workflow_runs 完整状态机（db §8.2 全集 8 态；S2 落 6 子集）

```
[*] --> pending
pending    --> running     : 启动后首阶段就绪
running    --> completed    : 全部阶段 approved/skipped
running    --> failed       : 不可恢复错误
failed     --> running      : 人工恢复
running    --> terminated   : 人工终止
completed  --> archived     : 归档
terminated --> archived     : 归档
-- S3 单向追加：running↔waiting_review、*→revision_required（依赖 review_records，S2 禁止）
```

| from \ to | pending | running | completed | failed | terminated | archived |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| **pending** | — | ✅ | | | | |
| **running** | | — | ✅ | ✅ | ✅ | |
| **failed** | | ✅ | | — | | |
| **terminated** | | | | | — | ✅ |
| **completed** | | | | | | ✅ |
| **archived** | | | | | | — |

### stage_runs 完整状态机（db §8.3 全集 7 态；S2 落 6 子集 + C-1 自动门禁）

```
[*] --> pending
pending        --> running          : POST /stage-runs/:id/start
pending        --> skipped          : 依赖条件不满足（非任意跳过）
running        --> waiting_review    : COMPLETE 内部边（自动门禁瞬态）
waiting_review --> approved          : 自动门禁判定通过（gate_result 记快照）── ① ② 同一事务连续发生
running        --> failed            : 执行失败
failed         --> running           : 同 run 原地重试（attempt_count+1，不写 parent）
approved/skipped --> [*]             : 终态（approved 激活下游）
-- 自动门禁不通过：complete 返回 422，stage 留 running 待修正重提（不引入 revision_required）
-- S3 单向追加：waiting_review→{approved|revision_required} 由 review_records.decision 驱动停留
```

| from \ to | pending | running | waiting_review | approved | failed | skipped |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| **pending** | — | ✅(start) | | | | ✅(条件不满足) |
| **running** | | — | ✅(complete 内部) | | ✅ | |
| **waiting_review** | | | — | ✅(自动门禁，同事务) | | |
| **failed** | | ✅(重试) | | | — | |
| **approved** | | | | — | | |（终态，激活下游）|
| **skipped** | | | | | | — |（终态）|

**关键不变量（领域机强制 + 测试覆盖）：**
- **C-1 自动门禁**：`complete` 对自动门禁阶段在**同一事务内**走 `running→waiting_review→approved`（waiting_review 为瞬态，进入即离开）；门禁不通过 → **422**，stage 留 `running`。
- **禁止跳阶段**（roadmap §5.6 关键回归）：下游 `pending→running` 须上游全部依赖 `approved`（finish_to_start 由依赖图强制）；`pending→skipped` 仅由"依赖条件不满足"触发，非任意跳过。
- **重试/重做二义**（workflow §5.4）：同 run 原地重试 `failed→running`（attempt_count+1，不写 parent）；跨 run 重做属 S3（`revision_required→running`，本 Sprint 不实现）。
- **乐观锁**（MJ-5）：所有状态转换 + 单记录更新校验 `updated_at`，冲突 → 409（arch §15.2）。

### 实施次序

1. `makeStateMachine(transitions)` 泛型转换器 + 单测（合法/非法/同态 no-op）。
2. `workflow-run/status.ts`、`stage-run/status.ts` 两台机据上表声明 TRANSITIONS。
3. **全转换测试矩阵**：两机 × 全状态对，断言合法通过 / 非法抛 `InvalidTransitionError`（ADR-006 后果）。

---

## 第四部分 · API 实施顺序

> 开发次序按依赖：先创建/查询 → 再推进 → 末资产读。所有运行态查询**强制 join content_tasks 注入项目作用域**（MJ-2）；写端点经 `runInProject` 单事务编排"领域变更 + 同事务审计"（沿用 `task.service.ts` 模式）；非法流转/乐观锁冲突→409，门禁未达→422，校验失败→400/422。新增审计主体：`workflow_run`/`stage_run`/`content_asset`/`asset_version`；新增 `AUDIT_ACTIONS`：`workflow_run.created`/`.completed`/`.terminated`、`stage_run.started`/`.completed`/`.failed`、`content_asset.created`、`asset_version.created`。

| # | 端点 | 事务边界 | 审计边界 | 状态机边界 |
|---|------|----------|----------|------------|
| 1 | **POST /tasks/:id/workflow-runs** | 单事务：创建 `workflow_runs` + 物化全部初始 `stage_runs`（pending）+ 写审计（db §10.1）| `workflow_run.created`（after=实例快照）；同事务 | 实例 `pending`（→running 由首阶段就绪触发）；**活跃唯一/幂等防重**（MJ-1 部分唯一索引 / MN-2 Idempotency-Key，二选一或并用），重复创建→409 |
| 2 | **GET /workflow-runs/:id** | 只读（单查询）| 无（读）| 无（呈现派生自 `workflow_runs.status`，不另存业务态）|
| | | 强制 join content_tasks 校验项目归属（MJ-2）；**内嵌阶段列表**（满足阶段详情面板，免 GET /stage-runs/:id，MN-3）| | |
| 3 | **POST /stage-runs/:id/start** | 单事务：`stage_runs.status pending→running` + 写审计 | `stage_run.started`；同事务 | 领域机 `assertTransition('pending','running')`；非法→409；乐观锁校验 `updated_at`→409 |
| 4 | **POST /stage-runs/:id/complete** | **单事务**：写 `content_assets`(若新) + 追加 `asset_versions` + 移动 `current_version_id`(Pair-1) + `stage_runs running→waiting_review→approved`(C-1) + 回填 `workflow_runs.current_stage_run_id`(Pair-2) + 激活下游 + 写审计 | `stage_run.completed` + `content_asset.created`(若新) + `asset_version.created`；**全部同事务**（db §10.1）| C-1 自动门禁：门禁通过→approved 激活下游；**门禁不通过→422 留 running**；禁跳阶段（上游未 approved 则下游不可 start）；乐观锁→409 |
| 5 | **GET /tasks/:id/assets**〔GAP-1〕| 只读 | 无（读）| 无 |
| | | 强制 join content_tasks 校验项目归属（MJ-2）| | |
| 6 | **GET /assets/:id/versions**〔GAP-1〕| 只读（asset_versions 按 version 升序）| 无（读）| 无 |
| | | 经 content_assets→content_tasks join 校验项目归属（MJ-2）| | |

**REST 合规**：`start`/`complete` 为动作子资源（RPC 风格），符合 api §1"写不直接改状态、经领域机"，非违规。
**契约校验**：写端点入参经 TypeBox schema 校验，含 `schema_version`（拒未知版本→422）。

---

## 第五部分 · 测试矩阵

> 框架：Vitest（`pnpm -r test`）；单测在 `test/unit/`，集成在 `test/integration/`（共享单测库、串行 singleFork，global-setup DROP SCHEMA + migrate up；依赖 `cf_app`/`cf_audit_reader` 角色，provision.sql 前置）。

| 类别 | 覆盖点 | 红线断言 |
|------|--------|----------|
| **单元测试** | `makeStateMachine` + 两台机全转换矩阵；JSON 契约 schema（schema_version）；资产版本追加规则、checksum 去重；DAG 无环校验 | 非法流转抛 `InvalidTransitionError`；未知 `schema_version` 抛 `ValidationError`；有环依赖被拒 |
| **集成测试** | 启动工作流→start→complete→生成资产版本闭环；6 端点状态码（201/200/400/404/409/422）| 闭环跑通；门禁不通过→422；非法流转→409 |
| **状态机测试** | workflow/stage 两机全合法+非法转换（ADR-006 后果）；**禁止跳过未完成阶段进入后续阶段**（roadmap §5.6 关键回归）| 上游未 approved 时下游 start→拒绝；自动门禁同事务 running→waiting_review→approved |
| **资产版本测试** | 只追加、`(content_asset_id,version)` 唯一、`current_version_id` 指针前移、`source_stage_run_id` 血缘；**append-only DB 级强制** | cf_app 凭据 UPDATE/DELETE `asset_versions`→被拒（MJ-3）；version 单调递增 |
| **隔离测试（项目越权）**〔对应"RLS 测试"〕| **S2 表不启用 RLS**（ADR-009）；隔离落应用层 → 测仓储 join/谓词 | **凭 id 跨项目读写运行态/资产→被拒**（MJ-2）；新增审计主体仍受 `audit_events` RLS 约束（沿用 S1） |
| **审计测试** | 创建/推进/产出均同事务写审计；哈希链延续（prev_hash 链接、sequence_no 递增）| 各写操作产生对应 `AUDIT_ACTIONS` 事件；链完整、append-only（沿用 S1 audit-security 模式）|
| **DEFERRABLE 测试** | 两组循环对单事务先插指针方后插被引方 | COMMIT 校验通过（C-2 实证落地为集成测试）|

**覆盖率目标**（已与 `apps/api/vitest.config.ts` 阈值一致，无需调整）：

| 范围 | lines / statements / functions | branches |
|------|:---:|:---:|
| `src/domain/**` | **≥ 90%** | ≥ 85% |
| 整体 | **≥ 80%** | ≥ 70% |

---

## 第六部分 · 风险矩阵

### R2 / R4 / R7 重新验证

| 风险 | 决策 | 评级 | 验证依据 | 残余 → 缓解 |
|------|------|------|----------|-------------|
| **R2** 状态机集中引擎 | ADR-006 | 🟢 就绪 | S1 `status.ts` 集中机模式已证（1/4 机运行）；S2 新建 2 台＝`workflow_runs`/`stage_runs` 唯一权威 | 四台机手写易漂移（D1 实例）→ MN-4 泛型 `makeStateMachine` + 全转换测试矩阵 |
| **R4** DEFERRABLE 循环外键 | ADR-007 | 🟢 PASS（C-2 实证）| PG16.14 两组循环对单事务双插均通过；IMMEDIATE 对照预期失败；nullable 两步回填回退成立 | 仅工程项：迁移按"先建表后 ALTER 补指针 FK"顺序 + 集成测试覆盖 |
| **R7** JSON schema_version | ADR-015 | 🟢 就绪 | S1 `RequirementDataSchema` 强制并拒未知版本已证 | 6 必含字段（definition/input/output/gate_schema、condition_schema、asset_versions.metadata）+ 3 建议（gate_result、context_packs data/source_refs）落地 |

### 是否有新增风险

**Critical：无新增**（C-1/C-2 已 PASS 解除）。**Major/Minor 均为已识别项，纳入 S2 DoD（非阻断）：**

| ID | 等级 | 风险 | DoD 处置 |
|----|------|------|----------|
| MJ-1 | 🟠 | 活跃 workflow_run 唯一性 | workflow_runs 部分唯一索引 / 创建端点幂等键 |
| MJ-2 | 🟠 | 运行态表无 project_id，隔离须 join | 仓储强制 join content_tasks + 跨项目越权被拒测试 |
| MJ-3 | 🟠 | asset_versions 缺 DB 级 append-only | 0009 grants REVOKE cf_app U/D |
| MJ-5 | 🟠 | 并行/异步回写竞态 | `updated_at` 乐观锁，冲突 409 |
| MN-1 | 🟡 | review 绑资产非版本（S3）| S2 保证 asset_versions 可独立寻址（已满足，勿回退）；S3 增 asset_version_id |
| MN-2 | 🟡 | 创建/完成端点幂等键 | 支持 Idempotency-Key（与 MJ-1 协同）|
| MN-3 | 🟡 | 缺 GET /stage-runs/:id | GET /workflow-runs/:id 内嵌阶段满足；按 UI 需要再补 |
| MN-4 | 🟡 | 无泛型状态机转换器 | 抽 `makeStateMachine` + 测试矩阵 |
| GAP-1 | 🟠 | 缺 2 资产读端点 | 补 GET /tasks/:id/assets、GET /assets/:id/versions |

**结论**：R2/R4/R7 全部 🟢；无新增阻断性风险；残余项均有明确 DoD 兜底。

---

## 第七部分 · Sprint-2 分阶段实施路线

| Step | 输入 | 输出 | 完成标准 |
|------|------|------|----------|
| **1 数据库** | §1 范围 · §2 矩阵 · C-2 迁移顺序 · 状态子集 | 迁移 0006/0007/0008（8 表）+ 0009 grants；DEFERRABLE 集成测试；DAG 无环校验单测 | `migrate:up/down` 双向可回滚；两组 DEFERRABLE 单事务双插通过；cf_app 对 asset_versions U/D 被拒；CHECK/UNIQUE/索引对齐 db §5/§7 |
| **2 Domain** | §3 两台机定义 · §1 引擎 · R7 契约清单 | `makeStateMachine` + workflow/stage 两机；workflow/asset-version/context-pack 引擎；6+3 JSON TypeBox schema | 非法流转→409；未知 schema_version 被拒；全转换测试矩阵通过；domain 覆盖率 ≥90% |
| **3 API** | §4 端点表 · Domain 产物 · 仓储隔离规则 | 6 端点 + Service（runInProject 单事务 + 同事务审计 + 乐观锁 + 项目 join）| 闭环（启动→start→complete→资产版本）集成测试全绿；门禁未达 422；跨项目越权被拒；禁跳阶段回归通过；资产只追加实测 |
| **4 UI** | §1 P3 · GET 端点契约 | 工作流时间线 · 阶段详情面板 · 产出录入表单 · 资产版本列表 · 内容中心状态列 | 启动→推进→产出→资产版本闭环 UI 可跑通；状态徽章派生自后端 status（不复制转换规则）；控制台零错误 |
| **5 测试** | Step 1–4 产物 · §5 矩阵 | 单元/集成/状态机/资产/隔离/审计/DEFERRABLE 全量 + 回归 | `pnpm -r test` 全绿；覆盖率 domain ≥90% / 整体 ≥80%（vitest 阈值）；roadmap §5.6 关键回归（禁跳阶段）通过 |
| **6 审计包** | Step 1–5 结果 · DoD 清单 | Sprint-2 交付审计报告（不变量实测证据、风险闭环、覆盖率快照）| 所有 DoD（MJ-1/2/3/5、MN-1~4、GAP-1、R2/R4/R7）逐项有证据；无残留 Critical/High |

> 测试编写策略：单元/集成测试在 Step 2–4 内随实现同步编写（TDD 倾向）；**Step 5 为整体回归 + 覆盖率门禁 + E2E 闭环的统一关卡**，非"最后才补测试"。

---

## 最终结论

# ✅ GO — 允许进入 Sprint-2 开发

**判定依据**：Phase-1 两项 Critical（C-1 自动门禁、C-2 DEFERRABLE）均 PASS 解除，连带 MJ-4 状态子集锁定；R2/R4/R7 三项跨 Sprint 风险决策全部 🟢 就绪/已实证；Sprint-1 已奠基可复用的集中状态机 / `runInProject` 事务+同事务审计 / 项目隔离 / `schema_version` 校验模式；无残余设计级阻塞。范围（8 表 / 2 引擎+3 领域件 / 6 端点 / 5 前端件）、数据库顺序（0006→0009）、状态机落点（Domain 唯一）、API 边界（事务/审计/状态机）、测试矩阵与覆盖率目标、风险 DoD 均已明确可执行。

**开发首步**：Step-1 数据库（迁移 0006 定义层先行）。

**DoD 强制清单**：MJ-1（活跃唯一/幂等）· MJ-2（运行态 join 隔离 + 越权测试）· MJ-3（asset_versions 撤 U/D）· MJ-5（乐观锁 409）· MN-4（泛型状态机 + 矩阵）· GAP-1（补 2 资产读端点）· R7（9 个 JSON 契约 schema_version）。

---

> 本计划为只读交付：仅新增本文件，未写业务代码、未改 src/apps/packages、未创建迁移、未进入 Sprint-2 开发、未提交、未推送。停止，等待开发指令。
