# Sprint-2 Step-1 Summary

> 日期：2026-06-05 · 阶段：Sprint-2 Step-1（数据库层）· 基线：`170a33c`
> 范围：仅数据库层——新增迁移 + Drizzle schema 镜像 + 仓储所需 Row 类型。未写 service/controller/route/ui/domain，未写测试文件。
> 权威依据：database-design.md §5.4–5.10/§6/§7/§9 · development-roadmap §5.3 · sprint-2-execution-plan.md §2 · Phase-1 裁决 C-1（状态子集）/ C-2（DEFERRABLE）。

## 完成内容

实现 Sprint-2 全部 8 张数据表及其约束、索引、append-only 强制；状态字段按 C-1 锁定的 S2 子集落地（仿 S1 content_tasks 子集→后续单向扩展模式）；两组循环外键以 `DEFERRABLE INITIALLY DEFERRED` 落地并实测同事务双插成立。状态机逻辑、DAG 无环校验、JSON 完整契约校验均**仅建模不实现**，留待 Step-2 领域层。

## 新增迁移（4 支）

| 迁移 | 内容 |
|------|------|
| `0006_workflow_definitions.js` | workflow_definitions · workflow_stages · workflow_stage_dependencies（定义层）|
| `0007_workflow_runs.js` | workflow_runs · stage_runs（运行层，Pair-2 循环 FK）|
| `0008_content_assets.js` | content_assets · asset_versions · context_packs（资产/上下文层，Pair-1 循环 FK）|
| `0009_grants.js` | cf_app 最小权限 + asset_versions append-only（撤 U/D）|

Drizzle schema：`apps/api/src/infrastructure/db/schema.ts` 新增 8 个 `pgTable` 类型镜像 + 8 个 `*Row` 类型导出（无 FK/CHECK，DB 真相以迁移为权威）。

## 新增表（8）

workflow_definitions、workflow_stages、workflow_stage_dependencies、workflow_runs、stage_runs、content_assets、asset_versions、context_packs。

## 新增约束

- **CHECK（状态子集，C-1 锁定）**：`workflow_runs.status` ∈ {pending,running,completed,failed,terminated,archived}（6/8，禁 waiting_review/revision_required）；`stage_runs.status` ∈ {pending,running,waiting_review,approved,failed,skipped}（6/7，禁 revision_required）；`content_assets.status` ∈ {draft,archived}（roadmap §5.3）。
- **CHECK（值域）**：`executor_type`、`dependency_type`、`context_packs.scope/sensitivity_level`、`content_assets.asset_type`（8 值受控词表）；版本号 `>= 1`；`attempt_count >= 1`；`stage_id <> depends_on_stage_id`（禁自依赖）；context_packs `scope↔stage_run_id` 一致性。
- **CHECK（schema_version）**：`definition_schema`/`input_schema`/`output_schema`/`gate_schema`/`asset_versions.metadata` 强制内含数值 `schema_version`；`condition_schema` 存在时强制（§6.4/ADR-015）。
- **FK + CASCADE/RESTRICT**：CASCADE 仅用于定义配置聚合内部（stages/dependencies → definition、dependencies → stages）；RESTRICT 保护所有任务/运行/版本/血缘数据（§6.5/§11）；`asset_versions → content_assets` 用 RESTRICT 保护版本不被级联删除。
- **DEFERRABLE**：两组循环指针 FK `workflow_runs.current_stage_run_id`、`content_assets.current_version_id` 均 `DEFERRABLE INITIALLY DEFERRED`（condeferrable=t condeferred=t 实测）。
- **UNIQUE**：`(project_id,name,version)`、活跃定义部分唯一 `(project_id,name) WHERE status='active'`、`(wd_id,key)`、`(wd_id,position)`、`(stage_id,depends_on_stage_id)`、`(content_asset_id,version)`、context_packs 两条部分唯一（task 级/stage 级）、workflow_runs 活跃实例部分唯一（MJ-1）。
- **索引**：§7.1/§7.2 全部 S2 表索引（含 DAG 依赖双向索引）。
- **agent_profile_id**：按 ADR-020 仅保留列、暂不加 FK（agent_profiles 于 S4 建表后补，已注释）。

## 新增 RLS

**无（按设计）。** 执行计划 §2 + ADR-009 明确：S2 业务表**一律不启用 RLS**（仅 audit_events 强制 RLS）。项目隔离落应用层——`workflow_definitions` 经 `project_id` 谓词、运行态/资产表经 join 上溯 `content_tasks`（MJ-2），由仓储在 **Step-3** 实现。本阶段不引入 RLS 即为符合计划，非遗漏。

## 新增 append-only

`asset_versions` 获 **DB 级 append-only 强制**（MJ-3/F5）：0009 grants 对 cf_app 仅授 `SELECT,INSERT` 并显式 `REVOKE UPDATE,DELETE`；schema 层无 `updated_at`（永不修改）。实测：cf_app 对 asset_versions 的 UPDATE/DELETE 均 `permission denied`，对照 content_assets 含 UPDATE。

## 验证结果

- typecheck ✓（3 projects）· lint ✓（0 error）。
- `migrate:up` 应用 0006–0009 ✓；**down 4 → up 双向可回滚** ✓（回滚后 S1 五表完好、S2 表 0；重应用后 S2 表 8、DEFERRABLE 约束重建）。
- 行为实测：两组循环外键同事务双插（指针先于被引行 + `SET CONSTRAINTS ALL IMMEDIATE`）PASS（已回滚不留痕）；schema_version 缺失被 CHECK 拒绝；cf_app append-only 强制生效。
- 回归：现有 **37/37 测试全通过**，测试库从零应用全部迁移（0001–0009）成功，S1 无回归。

## 发现的问题

1. **`pnpm -r test` 在 packages/shared 处中断**（既有问题，与本阶段无关）：shared 无测试文件，`vitest run` 退出码 1。建议为 shared 的 test 脚本加 `--passWithNoTests`（不在本阶段处理）。
2. **error_data 列未新增**：执行计划 §2 将其列为"建议"，但 database-design.md §5.7 无此列。严守设计文档未自行新增；failed 详情暂落 gate_result/审计，如 Step-2 领域层确需可再评估增列。
3. **DAG 无环校验、JSON 完整契约（未知版本拒绝）、状态机转换**均未实现——按计划属 Step-2 领域层，本阶段仅建表/约束。

以上均为既定边界或决策记录，非缺陷。

## 是否阻塞 Step-2

**否。** 8 表、约束、索引、DEFERRABLE、append-only、状态子集均按设计落地并实测通过；Drizzle 镜像与 Row 类型就绪，Step-2 领域层可直接据此构建状态机与引擎。无残余阻塞。

## Go / No-Go

# ✅ GO — Step-1 完成，可进入 Step-2（领域层）

> 仅新增 4 迁移 + 改 schema.ts + 本摘要；未写 service/controller/route/ui/domain/测试；未推送。
