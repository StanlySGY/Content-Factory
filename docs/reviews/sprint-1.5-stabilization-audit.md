# Sprint-1.5 稳定化审计报告（Stabilization Audit）

> 日期：2026-06-05 · 阶段：Sprint-1.5（系统收敛）· 基线提交：`a26769c`
> 范围：验证 + 修复 bug + 文档收敛（**未新增功能、未改 DB 结构、未重构 API、未改业务逻辑**）
> 关联：[sprint-1-audit-package](./sprint-1-audit-package.md) · ADR-006/008/009/012/015/019 · api-overview §4.1 · database-design §5.3/§8.1

---

## Executive Summary

**结论：✅ PASS**

Sprint-1 系统通过稳定性、一致性、安全闭环、API 行为、前后端一致性全部验证。自动化回归 **39/39 通过**（API 36 + Web 3），DB 约束 / 审计链完整性 / RLS 隔离 / 角色权限实库探针全部 PASS。**无功能性 Bug，无 Critical/High 安全问题。** 发现 1 处 LOW 架构漂移、1 处文档缺口（已收敛）及若干纵深防御/部署加固建议，**均不阻断 Sprint-2 启动**。

| 维度 | 结果 |
|------|------|
| 稳定性（回归测试） | ✅ PASS（39/39 + 实库探针全绿） |
| API ↔ DB 一致性 | ✅ PASS（全字段/类型/null/默认对齐） |
| RLS / 审计链闭环 | ✅ PASS（隔离 + 哈希重算 + 链接连续验证） |
| 安全闭环 | ✅ PASS（无提权 / 无 RLS 绕过 / 应用层全审计） |
| 架构漂移 | ⚠️ 1 LOW（draft→cancelled）+ 1 文档缺口（已修） |
| 功能性 Bug | ✅ 无 |

---

## System Health

| 子系统 | 状态 | 证据 |
|--------|------|------|
| **API** | 🟢 健康 | 集成套件 boot 完整 Fastify（buildApp + inject）覆盖全部 6 端点；`/api/health` 探活 DB 返回 `{status:"ok"}`；启动监听 :3001 正常 |
| **数据库** | 🟢 健康 | 迁移 0001–0005 全部应用（dev `content_factory` + test）；5 表结构与 database-design §5 一致；哈希链/触发器/RLS/授权实测确认 |
| **前端** | 🟢 健康 | Vite 构建正常；typecheck 三包通过；组件测试 3/3；端到端 5 页截图（Dashboard/列表/新建/详情+审计/编辑）控制台零错误 |

> 运行方式（不变）：`pnpm install` → `pnpm migrate:up` → `pnpm dev:api`(:3001) + `pnpm dev:web`(:5173)。

---

## Consistency Report

### 1. API ↔ DB 一致性 — ✅ PASS

`content_tasks` 全 12 字段在 **DB 迁移 ↔ Drizzle 镜像 ↔ TypeBox DTO** 三处对齐（类型、可空性、varchar 长度、默认值）：

| 字段 | DB | Drizzle | DTO | 一致 |
|------|-----|---------|-----|------|
| id / project_id / owner_id | uuid（owner 可空 FK） | 同 | Uuid / Nullable(Uuid) | ✓ |
| title / content_type | varchar(240/64) NN | 同 | String | ✓ |
| priority / status | varchar(32) NN + CHECK | 同（status default draft） | enum（4/6 值） | ✓ |
| requirement_data | jsonb NN | jsonb NN | RequirementDataSchema | ✓ |
| due_at / created_at / updated_at / archived_at | timestamptz（created/updated NN default now） | 同 | date-time / Nullable | ✓ |

- **枚举闭环**：`TASK_STATUSES`(6) / `TASK_PRIORITIES`(4) 与 DB `content_tasks_status_chk` / `content_tasks_priority_chk` **逐值一致**。
- **CreateTaskBody**：`status` 不在入参，由 `createDraft` 默认 `draft`，与 DB 默认一致；`requirement_data` 必填对齐 NOT NULL。
- **AuditEventDTO**：12 列对齐；省略 `project_id`（单项目下有意最小暴露，`SELECT_COLS` 不取）；`sequence_no` bigint→`Number()`、`created_at` timestamptz 字符串→ISO 归一化。
- **Drizzle 不建模 CHECK/唯一索引**：已在 `schema.ts` 注释声明「DB 迁移为权威」，属设计选择，非漂移。

### 2. 前后端一致性 — ✅ PASS（含 1 Info）

- Web 客户端 `lib/api.ts` 复用 `@cf/shared` 同一组 DTO 类型 → **前后端类型一致性编译期强保证**（typecheck 通过，不可能引用未定义字段）。6 端点映射齐全。
- 缓存失效正确：`useUpdateTask` 成功后失效 `all + detail + audit`，编辑后审计面板即时刷新。
- 响应无冗余字段：mapper 精确构造 DTO 形状（`additionalProperties:false`）。
- **Info**：UI 表单仅采集 `requirement_data` 的 `summary/audience`，schema 另支持 `channel/goals/constraints`（`additionalProperties:true`）。编辑保存会以 `{summary,audience}` 整体覆盖 `requirement_data`，**丢弃经 API 写入的额外字段**。属 S1 最小 UI 取舍；补全表单字段属新增功能（本阶段禁止），列入建议。

### 3. 审计链一致性 — ✅ PASS

- 应用层每次 `content_tasks` 写入（create / 有效 update）均在**同事务**内 `recordAudit`；无变更的 update 提前返回不产生审计（正确，无空写）。
- 实库哈希链验证（见 Security Report）：4 事件 `hash_ok` + `link_ok` 全绿。

---

## Security Report

实库（`content_factory`）以真实角色连接探针 + 角色属性核查，全部 PASS：

| 检查项 | 结果 | 证据 |
|--------|------|------|
| **Direct DB bypass** | ⚠️ LOW | `audit_events` 不可篡改（append-only 触发器 + cf_app 无 U/D 授权 + FORCE RLS）；但 `content_tasks` 无 DB 级强制审计/RLS，持 cf_app 凭据直连 DB 可绕过应用审计写入 `content_tasks`。S1 应用为唯一写入方，审计在事务内配对，属既定边界 |
| **未审计写入** | ✅ PASS（应用层） | `TaskService` create/update 均事务内审计；无脱离审计的写路径 |
| **Role escalation** | ✅ PASS | cf_app / cf_audit_reader：`rolsuper=f`、`createrole=f`、`createdb=f`、无角色成员关系；非表属主，无法自授权 |
| **RLS bypass** | ✅ PASS | 两角色 `rolbypassrls=f`；`audit_events` ENABLE+FORCE RLS；无项目上下文→0 行、正确上下文→4 行、错误上下文→0 行；`audit_events`/`content_tasks` 对 PUBLIC 零授权 |
| **API unauthorized access** | ⚠️ INFO | S1 无认证（既定 Sprint-2+，固定 DEFAULT_USER/PROJECT 上下文）；服务监听 `0.0.0.0`；CORS 限定浏览器源至 `WEB_ORIGIN`。**非本地部署前须加认证或绑 127.0.0.1** |

**append-only / 约束实测**：cf_app UPDATE/DELETE `audit_events` 均被拒；非法 status/priority 被 CHECK 拒绝；非法 project_id 被 FK 拒绝；cf_audit_reader INSERT 被「permission denied」拒绝、SELECT 正常。

**审计链完整性（哈希重算防篡改）**：以 `cf_audit_reader` 重算每行 `entry_hash`（canonical 10 字段拼接 → SHA-256）并与存储值比对：

```
seq | action               | hash_ok | link_ok
 1  | content_task.created |   t     |   t
 2  | content_task.created |   t     |   t
 3  | content_task.created |   t     |   t
 4  | content_task.updated |   t     |   t
```

→ 重算哈希与存储完全一致（**无篡改**）、`prev_hash` 逐条链接前条（**链连续无断**）、序号 1–4 无缺口、3 create + 1 update 与操作记录精确对应（**无未审计写入**）。

---

## Architecture Drift Report

对比 `decision-log.md`（ADR）、`database-design.md`、`api-overview.md` 与当前实现：

### Drift points（实现偏离文档）

| # | 漂移 | 严重度 | 说明 |
|---|------|--------|------|
| D1 | **draft→cancelled** | LOW | `status.ts` 与 `TaskDetailPage` 均允许 draft 直接取消；database-design §8.1 状态机仅有 `ready→cancelled` / `running→cancelled`，**无 draft→cancelled**。实现+UI 一致更宽松（合理 UX），但偏离文档机。需决策：补文档机或收紧实现（后者属改业务逻辑，本阶段不做） |

### Mismatch points（文档缺口）

| # | 缺口 | 处置 |
|---|------|------|
| M1 | api-overview §4.1 仅列 4 个 S1 端点，缺 `GET /api/tasks/:id/audit-events`（用户需求#5 强制） | ✅ **已收敛**：本阶段已补登该端点行 |

### 既定子集（非漂移，已文档化）

- **状态机 6/9 态**：省略 `waiting_review`/`revision_required`/`failed`（工作流/审核态，S2/S3）；`enums.ts` 注明「S1 子集，全集见 db §8.1」。
- **status CHECK 为 S1 值域**：Sprint-2 引入工作流态时需迁移扩展（0002 已注明）。
- **仅建 4 张 S1 表**：未建 workflow/asset/agent/mcp 等表，符合 roadmap §4.3 + ADR-016。

### Over-implementation points

- 无问题性越界。`status/priority` CHECK 强制的是文档既定值集（忠实实现）；`GET /api/health` 为标准运维探活端点（非业务）。

---

## Bug List

**无功能性 Bug。** 全部回归测试通过、数据完整性与安全不变量实测成立。上述 D1（draft→cancelled）为「实现/文档一致性」漂移而非功能缺陷（行为本身正确且自洽）。

---

## Fix Recommendations（只列，不修）

| # | 建议 | 类别 | 优先级 | 备注 |
|---|------|------|--------|------|
| R1 | D1 决策：在 §8.1 状态机补 `draft→cancelled`（推荐，符合 UX 与现有 UI）或收紧 `status.ts` | 文档/设计 | 中 | 收紧实现属改业务逻辑，本阶段不做 |
| R2 | `content_tasks` 启用 DB 级 RLS（纵深防御），消除直连 DB 绕过项目隔离/审计的风险 | 安全 | 中 | 改 DB 结构，留待 Sprint-2 迁移 |
| R3 | 引入认证并在非本地部署前绑 `127.0.0.1` 或网关前置 | 安全/部署 | 高（部署前） | 认证属 Sprint-2+ 既定范围 |
| R4 | `requirement_data` 表单补 `channel/goals/constraints`，避免编辑覆盖丢字段 | 前端 | 低 | 属新增功能，本阶段禁止 |
| R5 | 写操作支持 `Idempotency-Key`（api-overview §2.5 / ADR-022） | API | 低 | S1 无外部副作用，S2 工作流/发布更需要 |
| R6 | 部署确保 `DATABASE_AUDIT_URL` 必配（未配时 `env.ts` 回退到 app 连接，弱化写读分离） | 配置 | 低 | dev `.env` 已正确配置 cf_audit_reader |
| R7 | Sprint-2 迁移扩展 `content_tasks_status_chk` 以纳入工作流/审核态 | DB | 中 | S1 CHECK 为既定 S1 值域 |

> 注：R2/R3/R4/R5/R7 多为 Sprint-2 原生工作或越界项，本阶段仅登记不实施。

---

## Go/No-Go for Sprint-2

### 🟡 CONDITIONAL GO（有条件放行）

**判定**：Sprint-1 基础层（任务 / 审计哈希链 / RLS / DB / 前后端契约）稳定、一致、安全闭环，已通过全部验证，**可进入 Sprint-2**。所列条件均为**非阻断性**收敛/加固项，且多属 Sprint-2 原生工作。

**放行条件（建议在 Sprint-2 规划纳入跟踪，不阻断启动）：**
1. 对 D1（draft→cancelled）作出文档/实现对齐决策（R1）。
2. Sprint-2 引入工作流态时，同步迁移扩展 `content_tasks` 状态 CHECK（R7）。
3. 引入认证 + 在 `content_tasks` 启用 RLS，作为多项目/部署前的安全纵深（R2/R3）。

**无阻断项**：无功能 Bug、无 Critical/High 安全问题、无数据完整性风险。
