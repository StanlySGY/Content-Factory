# Sprint-2 Phase-1 审计包（Critical 解除聚合）

> 日期：2026-06-05 · 阶段：Sprint-2 Phase-1 · 基线：`170a33c`（已推送 origin/main）
> 性质：聚合交付件（只读）。未写业务代码、未改 src/apps/packages、未改/建迁移、未进入 Sprint-2。
> 聚合来源：[review-gate-decision](./sprint-2-review-gate-decision.md)（C-1）· [deferrable-validation](./sprint-2-deferrable-validation.md)（C-2）。上游审计：[sprint-2-readiness-audit](./sprint-2-readiness-audit.md)。

---

## 1. Executive Summary

Sprint-2 Readiness Audit 提出的 **2 项 Critical 阻塞已全部解除**：

| ID | 阻塞 | 解除方式 | 结论 |
|----|------|----------|------|
| **C-1** | Review 阶段推进语义未定（审核在 S3，无法越 `waiting_review` 门禁）| 裁定 **Option A 自动门禁**：阶段经 `gate_schema`/`gate_result` 在同事务内 `running→waiting_review→approved` 推进；不建 review_records、无合成数据；状态子集锁定；S3 人工审查纯增量叠加，零返工 | ✅ **PASS** |
| **C-2** | R4 两组循环外键 DEFERRABLE 未实测 | 真实 PG16.14 + 项目迁移机制**实证**：Pair-1/Pair-2 单事务双插均 PASS（`condeferrable=t,condeferred=t`），IMMEDIATE 对照预期失败，nullable+两步回填回退亦成立 | ✅ **PASS** |

**连带解除**：readiness-audit 的 **MJ-4（S2 状态 CHECK 子集未定）**——子集已由 C-1 裁决锁定。

---

## 2. 决策与验证摘要

### C-1 自动门禁（裁决：PASS）
- **机制**：S2 阶段 `complete` 对自动门禁阶段同事务 `running→waiting_review→approved`（`gate_result` 记判定）→ 激活下游；门禁不通过 → 422 留 `running` 待重提。
- **架构合规**：db §5.7「gate_result 与 review_records 二者并存不冲突」原生支持；ADR-006 集中机驱动成立；不建 S3 表、不越 roadmap 边界。
- **零返工**：S3 人工审查在 `waiting_review` 上叠加（review_records.decision 驱动），自动门禁路径不变、无数据迁移。
- **关键佐证**：迁移 0002 的 `content_tasks_status_chk` 本就无 `waiting_review`，与自动门禁「任务保持 running→completed」天然一致；Option C 反需给 content_tasks 加 waiting_review，增量更大。

### C-2 DEFERRABLE 实证（验证：PASS，风险 Low）
- **两组循环对**：Pair-1 `content_assets↔asset_versions`、Pair-2 `workflow_runs↔stage_runs`（后者 ADR-007 漏点名，本阶段补全）。
- **实测**：隔离 schema 内 `DEFERRABLE INITIALLY DEFERRED` 单事务双插均成功；IMMEDIATE 同序必失败（证明延迟必要）；nullable+两步回填回退成立（ADR-007 后果）。
- **迁移要求**：先建表（正向 NOT NULL FK + 指针列）→ 后 `ALTER ADD CONSTRAINT ... DEFERRABLE` 补指针 FK；与 ADR-020 先列后 FK 模式一致。

---

## 3. S2 状态子集（由 C-1 锁定，供 Phase-2 迁移/领域机据此实现）

| 实体 | S2 允许 | S2 禁止（S3 单向追加）| 是否改 CHECK |
|------|---------|----------------------|--------------|
| `stage_runs.status` | pending, running, waiting_review(瞬态), approved, failed, skipped | revision_required | S2 新建（6/7 态）|
| `workflow_runs.status` | pending, running, completed, failed, terminated, archived | waiting_review, revision_required | S2 新建（6/8 态）|
| `content_tasks.status` | draft, ready, running, completed, cancelled, archived | —（不变）| **否**（迁移 0002 已定）|
| `content_assets.status` | draft, archived | review_pending/approved/rejected/stale | S2 新建（2 态，roadmap §5.3）|

---

## 4. Go / No-Go

# ✅ GO — 允许进入 Sprint-2 开发

两项 Critical（C-1/C-2）+ 连带 MJ-4 已解除，无残余设计级阻塞。**readiness-audit 的 5 Major / 4 Minor 中，MJ-4 已解；其余转为 Sprint-2 实现期 DoD 约束**（非阻塞）：MJ-1 活跃实例唯一/幂等、MJ-2 运行态表 project 隔离经 join、MJ-3 asset_versions 撤 cf_app U/D、MJ-5 乐观锁、MN-1（S3）、MN-2 幂等键、MN-3（按需）、MN-4 泛型状态机 + 测试矩阵、GAP-1 补 2 个资产读端点。

> 提示：本目录现有 4 份 S2 评审文档（architecture-readiness / readiness-review / readiness-audit / 本 Phase-1 包，另含 2 子文档），结论一致但重叠。建议择 readiness-audit + 本 Phase-1 包为权威，余者归并。归并待指令（本阶段仅新增、不改他文件）。

---

## 5. Sprint-2 第一批编码任务（按优先级；仅列任务，不写代码）

> 顺序：依赖图先行的迁移 → 领域状态机（含 C-1 自动门禁、C-2 DEFERRABLE）→ 应用/API（事务一致性+隔离+并发）→ 前端 → 回归。每项标注解除的 readiness 风险。

### P0 — 数据库迁移（Phase-2 起点，依赖图先行）
1. **迁移 0006**：`workflow_definitions` / `workflow_stages` / `workflow_stage_dependencies`。含 `(project_id,name,version)` 唯一 + 部分唯一 active、`(wd_id,key)`/`(wd_id,position)` 唯一、`(stage_id,depends_on_stage_id)` 唯一 + 自依赖禁止、`executor_type`/`dependency_type`/`workflow_definitions.status` CHECK、§7 索引；**发布时 DAG 无环校验落点**（领域层，roadmap §5.3/ADR-018）。
2. **迁移 0007**：`workflow_runs` / `stage_runs`。**按 C-2 顺序**：先建表（`stage_runs.workflow_run_id` 正向 NOT NULL FK + `current_stage_run_id` 列）→ `ALTER ADD current_stage_run_id FK ... DEFERRABLE INITIALLY DEFERRED`；status CHECK 按 §3 子集；`agent_profile_id` 仅列 + 注释 FK 延后 S4（ADR-020）；`error_data jsonb` 建议补（readiness Minor）；§7 索引。
3. **迁移 0008**：`content_assets` / `asset_versions` + `context_packs`。**按 C-2 顺序**补 `content_assets.current_version_id FK ... DEFERRABLE`；`asset_versions (content_asset_id,version)` 唯一；`content_assets.status` CHECK 仅 {draft,archived}；context_packs 两条部分唯一索引。
4. **迁移 0009 grants**：cf_app 对新表 S/I/U；**REVOKE cf_app U/D on `asset_versions`**（MJ-3 append-only DB 级强制）；运行态表项目隔离经仓储 join（非 RLS，MJ-2）。
   - 验收：`migrate:up/down` 双向可回滚；DEFERRABLE 单事务双插集成测试（复用本阶段探针逻辑）；无环校验单测。

### P1 — 领域状态机与契约（R2/R7）
5. **泛型状态机转换器** `makeStateMachine(transitions)` + `workflow_runs` 机 + `stage_runs` 机（含 **C-1 自动门禁**：complete 同事务 `running→waiting_review→approved`，门禁不通过 422）+ **全转换测试矩阵**（合法/非法，ADR-006/MN-4）。
6. **TypeBox JSON 契约 schema**（含 `schema_version` 校验、拒未知版本，R7/ADR-015）：`definition_schema`/`input_schema`/`output_schema`/`gate_schema`（必）、`condition_schema`、`asset_versions.metadata`（必）、`gate_result`/context_packs `data`/`source_refs`（建议）。

### P1 — 应用服务与 API（事务一致性 / 隔离 / 并发；6 端点）
7. **Workflow Service** + `POST /api/tasks/:id/workflow-runs`（**活跃实例唯一/幂等** MJ-1/MN-2；创建实例 + 初始 stage_runs + 审计**单事务** db §10.1）；`GET /api/workflow-runs/:id`（内嵌阶段列表）。
8. **Stage State Machine Service** + `POST /api/stage-runs/:id/start`、`POST /api/stage-runs/:id/complete`（按 C-1 自动门禁推进 + 产出写 content_assets/asset_versions + 审计**单事务**；**乐观锁** `updated_at` 防并行竞态 MJ-5）。
9. **Asset/Context Service** + `GET /api/tasks/:id/assets`、`GET /api/assets/:id/versions`（**GAP-1 补这两个读端点**；运行态查询**强制 join content_tasks 注入 project 作用域** MJ-2 + 跨项目越权被拒测试）。

### P2 — 前端与回归
10. 工作流时间线 / 阶段详情面板 / 阶段产出录入表单 / 资产版本列表 / 内容中心工作流状态列（roadmap §5.5）。
11. 回归：**禁止跳过未完成阶段**（roadmap §5.6）、跨项目访问被拒、资产版本只追加实测；覆盖率 domain ≥90% / 整体 ≥80%；闭环 E2E（启动→推进→产出→资产版本）。

---

> 本阶段为只读交付：仅新增 3 份评审文档，未改任何代码/数据库/迁移，未创建迁移（验证用 scratch schema 已 DROP），未进入 Sprint-2，未提交、未推送。停止，等待下一步指令。
