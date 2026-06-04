# Sprint 1 交付审计包 — 任务管理基础

> 日期：2026-06-04 · 范围：Sprint 1（内容任务管理最小可运行系统） · 状态：✅ 交付待验收
> 关联：[stack-decision](./sprint-1-stack-decision.md) · [implementation-plan](./sprint-1-implementation-plan.md) · ADR-008/009/012/015/019

---

## 1. 概述

本 Sprint 将仅含文档的仓库落地为**真实可运行的最小系统**，用户可完成：创建任务、查看任务列表、查看任务详情、编辑任务信息、查看审计记录。后端按 API→Application→Domain→Infrastructure 分层落地，安全侧强制实现审计哈希链（ADR-008）、跨项目 RLS 隔离（ADR-009）、脱敏管线（ADR-012）。

**严格范围**：Users / Projects / ContentTasks / AuditEvents 四张表。
**未实现（按指令排除）**：Workflow、MCP、Skill、Asset、Review、Wechat、Publish、Dashboard 高级特性、Agent 执行。前端侧边栏对这些以"后续 Sprint"灰态占位，不提供功能。

---

## 2. 实现内容

### 2.1 Monorepo 结构（pnpm workspace）

```
Content-Factory/
├─ apps/api/                    # Fastify 后端（17 src 文件）
│  ├─ src/
│  │  ├─ app.ts                 # 装配：连接池(cf_app/cf_audit)→Drizzle→Service→Fastify→路由
│  │  ├─ server.ts              # 监听入口
│  │  ├─ config/env.ts          # 环境变量加载与校验
│  │  ├─ domain/                # 领域层（纯逻辑，无 IO）
│  │  │  ├─ content-task/content-task.ts   # createDraft / applyUpdate 不变量
│  │  │  ├─ content-task/status.ts         # 状态机 TRANSITIONS + assertTransition
│  │  │  └─ errors.ts                       # AppError 体系（httpStatus 映射）
│  │  ├─ application/           # 应用层（编排 + 事务）
│  │  │  ├─ task.service.ts     # create/list/get/update + 审计联动（单事务）
│  │  │  ├─ audit.service.ts    # 审计追加/读取（写读分离）
│  │  │  ├─ redaction.service.ts# 脱敏管线（ADR-012）
│  │  │  └─ mappers.ts          # 行↔DTO 转换
│  │  ├─ infrastructure/
│  │  │  ├─ db/client.ts        # 连接池 + runInProject（事务级 RLS 上下文）
│  │  │  ├─ db/schema.ts        # Drizzle 类型镜像
│  │  │  └─ repositories/       # content-task（查询构建器）/ audit（原生 SQL，触发器驱动列）
│  │  └─ interfaces/http/       # 路由 / 统一错误处理 / 请求上下文
│  └─ test/                     # 单元(unit) + 集成(integration) + global-setup/setup-env
├─ apps/web/                    # React + Vite 前端（17 src 文件）
│  └─ src/
│     ├─ components/            # AppShell / SidebarNav / TopBar / StatusBadge / states
│     ├─ features/dashboard/    # DashboardPage（统计概览）
│     ├─ features/tasks/        # List / Detail / New / Form / Table + hooks（TanStack Query）
│     ├─ features/audit/        # AuditPanel（哈希链审计视图）
│     └─ lib/api.ts             # 类型化 fetch 客户端
├─ packages/shared/             # 跨端共享：enums + TypeBox schemas（单一事实源）
├─ db/
│  ├─ provision.sql             # Bootstrap（唯一 superuser 操作：建库+角色+connect）
│  └─ migrations/               # 0001~0005 node-pg-migrate（schema/安全/授权/seed）
├─ docker-compose.yml / .env(.example) / pnpm-workspace.yaml / tsconfig.base.json
```

### 2.2 连接与权限模型（最小权限）

| 身份 | 连接方式 | 用途 | 表权限 |
|------|----------|------|--------|
| `sgy` | Unix socket / peer | 迁移、测试库重建 | owner |
| `cf_app` | TCP / scram | 运行时业务读写 | users/projects/content_tasks: S/I/U（**无 DELETE**，软删除）；audit_events: **S/I**（无 U/D） |
| `cf_audit_reader` | TCP / scram | 审计读取（写读分离） | audit_events: **仅 SELECT** |

---

## 3. 数据库结构（实测）

### 3.1 表（5）

`users` · `projects` · `content_tasks` · `audit_events` · `pgmigrations`（迁移追踪）

- 主键 `gen_random_uuid()`、时间戳 `timestamptz`、需求结构 `requirement_data jsonb`（ADR-015，必含 `schema_version`）。
- 内置 `gen_random_uuid()` + `sha256()`，**不依赖 pgcrypto 扩展**（最小权限）。
- `content_tasks` 索引：`(project_id,status,updated_at)`、`(owner_id,status)`。

### 3.2 安全实现（实测验证）

| 机制 | ADR | 实测结果 |
|------|-----|----------|
| 审计哈希链 | ADR-008 | 函数 `cf_audit_chain`；触发器 `trg_audit_chain`（BEFORE INSERT）填充 `sequence_no/prev_hash/entry_hash`，`pg_advisory_xact_lock` 串行化 |
| Append-only | ADR-008 | 函数 `cf_audit_immutable` + 触发器 `trg_audit_no_update/no_delete/no_truncate`；**且 cf_app 无 U/D 权限**（权限层兜底） |
| 跨项目 RLS | ADR-009 | `audit_events` `relrowsecurity=t, relforcerowsecurity=t`（ENABLE+FORCE）；策略 `audit_project_isolation USING/WITH CHECK (project_id = current_setting('app.current_project_id'))` |
| 写/读分离 | ADR-008 | cf_app=`{INSERT,SELECT}`，cf_audit_reader=`{SELECT}`（实测授权表确认） |
| 脱敏管线 | ADR-012 | `redaction.service.redactObject` 在审计写入前执行；SHA-256 由 DB 内 `sha256()` 计算哈希链摘要 |

> **哈希链语义**：链为**项目级 append-only 账本**，`sequence_no` 在项目内跨所有 subject 单调递增；每条 `prev_hash` 链接项目内紧邻的前一条 `entry_hash`，构成防篡改链（详情页可见 seq #1 / seq #4 跨任务递增即此设计）。

---

## 4. API 清单

| 方法 | 路径 | 说明 | 校验 schema |
|------|------|------|-------------|
| GET | `/api/health` | 健康检查（探活 DB） | — |
| POST | `/api/tasks` | 创建任务（默认 draft）+ 初始审计 | `CreateTaskBodySchema` |
| GET | `/api/tasks` | 列表（分页 + status/content_type/owner 过滤） | `ListTasksQuerySchema` |
| GET | `/api/tasks/:id` | 任务详情 | `TaskIdParamSchema` |
| PATCH | `/api/tasks/:id` | 编辑字段 / 状态流转 + 审计 | `TaskIdParamSchema` + `UpdateTaskBodySchema` |
| GET | `/api/tasks/:id/audit-events` | 审计链（cf_audit_reader 身份读取） | `TaskIdParamSchema` |

- 校验：TypeBox schema（`packages/shared`，前后端单一事实源）+ Fastify Ajv（含 `ajv-formats`，校验 uuid/date-time）。
- 统一错误结构（api §2.3）：领域错误按 `httpStatus` 映射（404 not_found / 409 invalid_state_transition）；校验失败 400 `bad_request`；5xx 返回 `request_id` 参考号且不泄露内部细节。
- 状态机：`draft→{ready,cancelled}`、`ready→{cancelled}`、`completed→{archived}`、`cancelled→{archived}`；非法流转 409。

---

## 5. 测试结果

### 5.1 汇总

| 套件 | 用例 | 结果 |
|------|------|------|
| api 单元（content-task 18 + redaction 3） | 21 | ✅ |
| api 集成（tasks.api 9 + audit-security 6） | 15 | ✅ |
| **api 合计** | **36** | ✅ 全通过 |
| web（TaskForm 2 + TaskTable 1） | 3 | ✅ 全通过 |
| typecheck（`pnpm -r typecheck`） | — | ✅ 三包通过 |
| lint（`eslint .`） | — | ✅ 0 错误 |

audit-security 集成测试**真实验证** DB 级安全：append-only（UPDATE/DELETE 被拒）、哈希链（prev_hash 链接 + sequence_no 递增）、RLS 跨项目隔离。

### 5.2 覆盖率（v8，阈值：整体 ≥80% / domain ≥90% 行、≥85% 分支）

```
File               | % Stmts | % Branch | % Funcs | % Lines
All files          |   96.06 |    77.14 |     100 |   96.06   ← 达标
 domain/content-task.ts |  90.32 |  86.66 |   100 |  90.32     ← domain 达标
 domain/status.ts       |   100  |   100  |   100 |   100
 application/*          |   100  |  86.04 |   100 |   100
 repositories/*         |   100  |  …     |   100 |   100
 interfaces/http/routes/tasks.ts | 100 | 100 | 100 | 100
```

未覆盖残点均为防御性分支：`env.ts` 缺变量抛错、`http/errors.ts` 5xx 兜底、`task.service` 无变更短路——非核心路径，不影响验收。

---

## 6. 截图（`docs/reviews/screenshots/`）

| 文件 | 对应需求 | 内容 |
|------|----------|------|
| `01-dashboard.png` | 概览 | 统计卡（总数 3 / 草稿 2 / 就绪 1）+ 最近任务表 + 侧边栏后续 Sprint 灰态占位 |
| `02-task-list.png` | #2 查看列表 | 内容中心：状态/类型过滤 + 任务表 + 分页 |
| `03-task-new.png` | #1 创建任务 | 新建表单（标题/类型/优先级/需求结构，内联校验） |
| `04-task-detail-audit.png` | #3 详情 + #5 审计 | 任务详情字段 + **审计记录面板**（哈希链 seq #1 created / seq #4 updated，status 流转可视） |
| `05-task-edit.png` | #4 编辑 | 详情页编辑态（复用 TaskForm，含状态字段） |

控制台无错误/警告（已加 React Router v7 future flags + 内联 SVG favicon）。

---

## 7. 运行方法

```bash
# 0) 前置（唯一 superuser 操作，已执行）：建库 + 角色 + connect 授权
sudo -u postgres psql -v ON_ERROR_STOP=1 -f /tmp/cf-provision.sql   # db/provision.sql 副本

# 1) 安装依赖
pnpm install

# 2) 迁移（dev 库 content_factory；测试库由 vitest globalSetup 自动重建）
pnpm migrate:up

# 3) 启动（两个终端）
pnpm dev:api      # Fastify @ :3001
pnpm dev:web      # Vite @ :5173（/api 代理至 :3001）
# 浏览器打开 http://localhost:5173

# 4) 测试 / 质量门
pnpm --filter @cf/api exec vitest run --coverage
pnpm --filter @cf/web exec vitest run
pnpm -r typecheck && pnpm lint
```

> 开发库口令 `cf_app_dev_pw` / `cf_audit_dev_pw` 仅限本地开发（见 .env.example）；**真实凭据严禁提交**。

---

## 8. 遗留问题与已知限制

1. **环境依赖**：Docker Hub 不可达，改用系统 PostgreSQL 16（详见 stack-decision §环境约束）；`docker-compose.yml` 保留供有 Docker 的环境使用。
2. **测试库重置**：globalSetup 采用 `DROP SCHEMA public CASCADE` 重建（规避 seed 与 audit 表的跨迁移 FK 回滚顺序问题），仅作用于 `content_factory_test`，不触及 dev/系统库。
3. **认证**：S1 用固定 DEFAULT_USER/DEFAULT_PROJECT 注入请求上下文（roadmap 未将鉴权纳入 S1）；多租户 RLS 机制已就绪，接入登录后即可启用。
4. **format 校验**：uuid/date-time 经 ajv-formats 校验；其余业务不变量在领域层强校验。
5. **范围外特性**：侧边栏"后续 Sprint"项为占位，无路由与功能。

---

## 9. 验收对照（用户 5 项需求）

| # | 需求 | 实现 | 证据 |
|---|------|------|------|
| 1 | 创建内容任务 | POST /api/tasks + NewTaskPage | 03 截图 · tasks.api 测试 |
| 2 | 查看任务列表 | GET /api/tasks + TaskListPage（过滤/分页） | 02 截图 · tasks.api 测试 |
| 3 | 查看任务详情 | GET /api/tasks/:id + TaskDetailPage | 04 截图 · tasks.api 测试 |
| 4 | 编辑任务信息 | PATCH /api/tasks/:id + 编辑态 + 状态机 | 05 截图 · tasks.api 测试 |
| 5 | 查看审计记录 | GET /api/tasks/:id/audit-events + AuditPanel | 04 截图 · audit-security 测试 |

**结论**：5 项需求全部实现并经自动化测试 + 端到端截图验证；安全三项（ADR-008/009/012）已落地并实测。Sprint 1 交付完成，待验收。
