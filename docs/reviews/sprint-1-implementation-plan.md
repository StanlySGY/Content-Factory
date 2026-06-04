# Sprint-1 实现计划（Implementation Plan）

> 文档类型：Sprint 1 可执行实现计划
> 日期：2026-06-04
> 依据：`development-roadmap.md` §4、`database-design.md` §5.1/5.2/5.3/5.18、`api-overview.md` §4.1、`ui-design.md` §9/§10/§11、`sprint-1-stack-decision.md`
> 范围：仅 users / projects / content_tasks / audit_events + 任务 CRUD + 审计查看；严禁 Workflow/MCP/Skill/Asset/Review/Wechat/Publish/Agent 执行。

## 1. 数据库实现计划

### 1.1 表（精确对齐 db §5）

| 表 | 字段来源 | S1 关键约束 |
| --- | --- | --- |
| `users` | db §5.1 | email unique；status ∈ active/disabled |
| `projects` | db §5.2 | owner_id FK users；status ∈ active/archived |
| `content_tasks` | db §5.3 | project_id FK、owner_id FK(nullable)、requirement_data jsonb not null（含 schema_version）；status ∈ draft/ready/running/completed/cancelled/archived（roadmap §4.3）|
| `audit_events` | db §5.18 | sequence_no/prev_hash/entry_hash 哈希链 + append-only |

### 1.2 迁移文件（node-pg-migrate，每个含 up/down）

1. `0001_extensions` — `CREATE EXTENSION pgcrypto`（gen_random_uuid）；建写/审计读角色 `cf_app`/`cf_audit_reader`。
2. `0002_users_projects` — users、projects + 索引（§7.1：users email unique、projects owner_status）。
3. `0003_content_tasks` — content_tasks + 索引（project_status_updated、owner_status、due_at）+ status CHECK。
4. `0004_audit_events` — audit_events + 索引（subject、project_time）+ 哈希链函数 + append-only 触发器 + `REVOKE UPDATE,DELETE` + RLS 策略。
5. `0005_seed`（dev/test 专用，幂等）— 默认 user + 默认 project（单项目 MVP，db §4.1）。

### 1.3 安全 DDL（原生 SQL，本 Sprint 必办）

- **哈希链**（ADR-008）：`sequence_no` 经 `(project_id)` 内 `MAX+1`（写入事务串行化保证单调）；`entry_hash = encode(sha256(canonical_json(project_id,sequence_no,subject_type,subject_id,action,actor_id,before_data,after_data,prev_hash)),'hex')`；BEFORE INSERT 触发器计算并校验链接。
- **append-only**：BEFORE UPDATE OR DELETE 触发器 `RAISE EXCEPTION`；并 `REVOKE UPDATE, DELETE ON audit_events FROM cf_app`。
- **RLS**（ADR-009）：`ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY`；策略 `USING (project_id = current_setting('app.current_project_id')::uuid)`；content_tasks 由数据访问层强制 project_id 谓词（S1 不对其开 RLS，谓词层强制 + 测试覆盖）。
- **脱敏**（ADR-012）：写入前 RedactionService 处理 metadata/before/after；摘要 SHA-256。

### 1.4 校验判据（setup §6 / §5 步骤 5）

- 健康检查端点可达；任务创建产生带 `entry_hash` 的审计事件；跨项目查询被拒（自动化测试）；append-only 拦截 UPDATE/DELETE。

## 2. API 实现计划

### 2.1 端点（roadmap §4.4 + 服务用户需求 #5「查看审计记录」）

| 方法 | 路径 | 用途 | 写审计 | 来源 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/health` | 健康检查 | 否 | setup §5 |
| `POST` | `/api/tasks` | 创建任务（默认 draft）| 是 | roadmap §4.4 |
| `GET` | `/api/tasks` | 任务列表（分页 + status/content_type/owner 过滤）| 否 | roadmap §4.4 |
| `GET` | `/api/tasks/:id` | 任务详情 | 否 | roadmap §4.4 |
| `PATCH` | `/api/tasks/:id` | 更新基础信息（含 draft→ready 确认）| 是 | roadmap §4.4 / §4.3 |
| `GET` | `/api/tasks/:id/audit-events` | 任务审计记录（只读，项目内）| 否 | **用户需求 #5**（audit_events 属 S1，read-only 安全）|

### 2.2 分层与模块（arch §8.1）

- `interfaces/http`：路由 + TypeBox schema + 错误映射；解析 project/actor 上下文并 `SET LOCAL`。
- `application`：`TaskService`（create/list/get/update/confirm）、`AuditService`（append + 链 + 脱敏）、`RedactionService`。
- `domain`：`ContentTask` 实体 + 任务状态机（draft↔ready 等合法转换校验）、status/priority 枚举、字段不变量。
- `infrastructure`：Drizzle schema、`ContentTaskRepository`/`AuditEventRepository`/`ProjectRepository`/`UserRepository`、db 连接 + RLS 会话注入、SHA-256 摘要。

### 2.3 横切约定

- 统一错误结构 `{error:{code,message,retryable,details},request_id}`（api §2.3）；400/404/409/422 语义。
- 创建任务 + 初始审计事件**单事务**（db §10.1）。
- S1 鉴权简化：单项目 MVP，actor/project 由 seed 解析（默认项目），RLS 会话变量已接通；登录/成员属后续 Sprint（roadmap §4.3「仅保留 owner_id」、§25 非 S1）。明确记录为 S1 简化。

## 3. 前端实现计划

### 3.1 页面（roadmap §4.5）

| 路由 | 页面 | 要点 |
| --- | --- | --- |
| `/dashboard` | Dashboard 初版 | KPI 占位 + 空态引导新建（ui §9）|
| `/content/tasks` | 任务列表 | DataTable + StatusBadge + status/type 过滤 + 空态（ui §10）|
| `/content/tasks/new` | 新建任务表单 | 内联校验（title/content_type/priority/requirement）|
| `/content/tasks/:id` | 任务详情 | 展示 + 内联编辑基础信息 + 「确认需求」(draft→ready) |
| 详情内 审计面板 | 审计记录视图 | 右侧 ContextPanel 列出该任务审计链（**用户需求 #5**）|

### 3.2 布局与组件（roadmap §8.2 / ui §7）

- 基线壳层：`AppShell` + `SidebarNav` + `TopBar` + `ContextPanel`（S1 建立，后续复用）。
- 组件：`StatusBadge`（徽章映射 ui §10.3，文本+色，不仅靠颜色）、`EmptyState`、`DataTable`、`StatusBadge`、表单字段、`Skeleton`。
- 数据：TanStack Query 封装 API client；加载/错误/局部失败按 ui §19。
- 不实现：编辑器、工作流时间线、Agent/MCP 面板（非 S1）。

## 4. 测试计划（roadmap §4.6，覆盖率核心 ≥90% / 整体 ≥80%）

| 层 | 用例 |
| --- | --- |
| 单元（domain）| ContentTask 默认 draft、字段校验（title 必填/长度、content_type、priority 枚举、requirement schema_version）、draft→ready 合法 / 非法转换拒绝 |
| 单元（audit）| entry_hash 规范化计算确定性、prev_hash 链接、脱敏剔除敏感键 |
| 集成（真库）| 创建任务 API（201 + 审计事件含 entry_hash + 单事务）、列表（分页/过滤）、详情、PATCH（写审计）、审计查询端点 |
| 集成（安全）| RLS 跨项目读取被拒、audit_events UPDATE/DELETE 被拦截、断号/篡改可检测 |
| 前端 | 新建任务表单校验、任务列表渲染 + StatusBadge、空态 |

测试库：Vitest；集成连 Docker PG（独立 test schema/库）；CI 脚本 `pnpm -r test` + lint + typecheck。

## 5. 目录结构

```text
Content-Factory/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── domain/content-task/        # 实体 + 状态机 + 枚举
│   │   │   ├── application/                 # TaskService / AuditService / RedactionService
│   │   │   ├── infrastructure/
│   │   │   │   ├── db/                       # drizzle schema + client + RLS 会话
│   │   │   │   └── repositories/
│   │   │   ├── interfaces/http/             # routes + schemas + error-handler + context
│   │   │   ├── config/
│   │   │   ├── app.ts                        # buildApp()（供测试 inject）
│   │   │   └── server.ts
│   │   └── test/ {unit,integration}
│   └── web/
│       ├── src/{app,components,features/{tasks,audit},lib}
│       └── test/
├── packages/shared/src/                     # 契约：枚举 / DTO / schema_version
├── db/migrations/                           # node-pg-migrate up/down
├── docker-compose.yml                       # postgres:16 @5433
├── .env.example / pnpm-workspace.yaml / tsconfig.base.json / package.json
```

## 6. 里程碑

| M | 内容 | 退出判据 |
| --- | --- | --- |
| M1 | 工程骨架 + Docker PG + 迁移机制 + 健康检查 | `pnpm dev:api` 起、`/api/health` 200、迁移 up/down 通过 |
| M2 | DB 迁移（4 表 + 安全 DDL + seed）| 迁移落库；审计触发器/RLS/角色生效 |
| M3 | 后端领域 + 仓储 + 服务 + 4+2 端点 | 任务 CRUD + 审计查询可用，单事务写审计 |
| M4 | 前端布局壳 + 4 页面 + 审计面板 | 可创建/列出/查看/编辑任务、查看审计 |
| M5 | 测试 + lint + typecheck，达覆盖率目标 | `pnpm -r test` 全绿，核心 ≥90% / 整体 ≥80% |
| M6 | 审计包 + Git 提交推送 | sprint-1-audit-package.md 输出；main 推送成功 |

> 不在 S1：工作流、资产、审核、Agent/MCP/公众号、登录/成员、E2E。越界即停。
