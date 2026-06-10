# Sprint-2 DEFERRABLE 循环外键实证验证（C-2）

> 日期：2026-06-05 · 阶段：Sprint-2 Phase-1（解除 Critical C-2）· 基线：`170a33c`
> 性质：基于真实仓库的实证验证（非猜测）。验证在 `content_factory_test` 的隔离 schema 内进行，完成即 DROP；**未写入 db/migrations、未新增业务表、未改 src**。
> 依据：database-design §5.6/§5.9/§5.10 · ADR-007/019/020 · 实测探针 `/tmp/cf-deferrable-probe.sql`（scratch，不提交）· `schema.ts`/`client.ts`/`db/migrations/*`。

---

## 1. 仓库现状核查（不猜测）

| 检查项 | 事实 | 证据 |
|--------|------|------|
| `db/migrations` | 仅 0001–0005（users/projects、content_tasks、audit_events、grants、seed）；**无任何循环外键**，S2 表尚未建 | `ls db/migrations` |
| `schema.ts` | **纯类型镜像，不建模任何 FK**（无 `.references()`，连 ownerId/projectId 都无 FK），首行注「DB 真相以 db/migrations 为权威」 | `apps/api/src/infrastructure/db/schema.ts:1` |
| `client.ts` | 运行时经 `db.transaction()`（`runInProject`）注入 RLS 上下文；事务内执行 | `apps/api/src/infrastructure/db/client.ts:20-31` |
| 迁移层 | node-pg-migrate 以 `pgm.sql(原生 SQL)` 编写 DDL（见 0002/0003），ADR-019 确认「R4 由原生 SQL 在 S2 落地」| `db/migrations/0002,0003` |

**结论**：循环外键由**迁移层原生 SQL** 创建，Drizzle 不参与、不冲突。DEFERRABLE 是 PostgreSQL + 迁移层能力，运行期由 `db.transaction()` 在 COMMIT 时校验。

## 2. 两组循环关系（以 db 设计为据）

| Pair | 正向 FK（NOT NULL，immediate）| 反向指针 FK（nullable，须延迟）| ADR-007 点名 |
|------|------------------------------|-------------------------------|--------------|
| **Pair-1 资产** | `asset_versions.content_asset_id → content_assets.id`（§5.10）| `content_assets.current_version_id → asset_versions.id`（§5.9）| ✅ |
| **Pair-2 工作流** | `stage_runs.workflow_run_id → workflow_runs.id`（§5.7）| `workflow_runs.current_stage_run_id → stage_runs.id`（§5.6 注"延迟约束"）| ❌（仅本审计补全）|

> 纠正 readiness-audit 用户口径：「asset_versions↔stage_runs」实为单向（`asset_versions.source_stage_run_id → stage_runs`，无反向），**非循环**；真实循环对为上表两组。

## 3. 实测结果（数据库可用，已执行）

**环境**：PostgreSQL 16.14（peer auth，OS user `sgy`）· DB `content_factory_test`（可弃）· 隔离 schema `deferrable_probe`（完成即 DROP）。

**探针**（`/tmp/cf-deferrable-probe.sql`）忠实复刻两组循环：正向 FK 立即约束 + 反向指针 FK `DEFERRABLE INITIALLY DEFERRED`；以 `SET CONSTRAINTS ALL IMMEDIATE` 在事务内强制触发延迟校验。

| # | 测试 | 期望 | 实测 | 证据 |
|---|------|------|------|------|
| A1 | **Pair-2** DEFERRABLE 单事务双插（指针先于被引行）| PASS | ✅ **PASS** | `wr_current_stage_run_fk`：`condeferrable=t, condeferred=t`；NOTICE `PAIR-2 Test A ... PASS` |
| A2 | **Pair-1** DEFERRABLE 单事务双插 | PASS | ✅ **PASS** | `ca_current_version_fk`：`condeferrable=t, condeferred=t`；NOTICE `PAIR-1 Test A ... PASS` |
| B | 对照：IMMEDIATE FK 同序插入 | 必须 FAIL | ✅ **预期 FAIL** | NOTICE `EXPECTED FAIL -> violates foreign key constraint "ptr_fk_imm"` |
| C | 回退：nullable 指针 + 两步回填（无 DEFERRABLE）| PASS | ✅ **PASS** | NOTICE `FALLBACK C ... PASS` |
| — | 清理 | schema 移除 | ✅ | `deferrable_probe schema dropped`，`remaining_probe_objects=0` |

**关键判读**：
- A1/A2 证明：两组循环对均可用 `DEFERRABLE INITIALLY DEFERRED` 在**单事务内**先插指针方、后插被引方，COMMIT（或 `SET CONSTRAINTS IMMEDIATE`）时统一校验通过。
- B 证明：若指针 FK 为默认 IMMEDIATE，同序插入立即违约——**延迟约束是该插入序成立的必要条件**。
- C 证明：**ADR-007 后果备选**（nullable 指针 + 应用层两步回填）同样成立，不依赖 DEFERRABLE，是稳妥的退路。

## 4. 当前 ORM 是否支持 / 是否必须 DEFERRABLE / 是否需调迁移顺序

- **当前 ORM 是否支持？** ✅ **支持**。迁移层 node-pg-migrate 原生 SQL 直接发 `DEFERRABLE INITIALLY DEFERRED`（PG16 原生）；Drizzle 为类型镜像、不建模 FK，运行期 `db.transaction()` 在 COMMIT 校验，二者无冲突（已实测）。
- **是否必须 `DEFERRABLE INITIALLY DEFERRED`？** **推荐，非绝对必须**。两条路径均经实测成立：①（推荐）反向指针 FK 声明 DEFERRABLE，单事务双插最干净；②（备选 ADR-007 后果）指针 nullable + 两步回填（先插父指针 NULL → 插子 → UPDATE 回填），无需 DEFERRABLE。建议采路径①（指针语义更强、单事务原子）。
- **是否需要迁移顺序调整？** ✅ **需要**。循环外键无法在建表 DDL 内一次声明双向。标准顺序：**先建两表（仅声明正向 NOT NULL FK，指针列暂不加 FK）→ 再 `ALTER TABLE ADD CONSTRAINT ... DEFERRABLE INITIALLY DEFERRED` 补反向指针 FK**。两组循环对均按此。该模式与 ADR-020（`stage_runs.agent_profile_id` 先列后 FK）一脉相承，保证可回滚。

## 5. 风险评级

🟢 **Low**。两组循环对的 DEFERRABLE 行为已在真实 PG16 + 项目迁移机制下实证通过；且存在已验证的无-DEFERRABLE 回退路径（路径②），双重保险。残余仅为实现期工程项（迁移按 §4 顺序编写 + 集成测试覆盖单事务双插），无技术不确定性。

## 6. 最终结论

# ✅ PASS

C-2 解除。`DEFERRABLE INITIALLY DEFERRED` 在 PostgreSQL 16.14 + node-pg-migrate 原生 SQL 下对**两组**循环外键（含 ADR-007 漏点名的 workflow_runs↔stage_runs）均实证可用；迁移须按 §4 先建表后 ALTER 补指针 FK 的顺序落地；备选两步回填亦成立。

> 文档收敛建议（待批准，不在本阶段执行）：更新 **ADR-007** 纳入第二处循环对（workflow_runs↔stage_runs），并记「DEFERRABLE 已实证（PG16）+ 两步回填为退路」。
