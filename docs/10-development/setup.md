# 开发环境与数据库搭建（Setup）

> 文档类型：开发环境与数据库迁移指南
> 最高约束：`docs/00-project/project-constitution.md`
> 关联决策：`docs/00-project/decision-log.md`（ADR-002 数据库选型、ADR-007 延迟约束、ADR-019 技术栈）
> 用途：为 Sprint 1 编码起步提供数据库选型、迁移机制、环境与凭证约定、本地 + WSL 启动步骤。
>
> 说明：本项目目标环境为 **Windows + WSL2**（见 agent §12）。下文区分「已确定」与「参考实现栈（待确认）」——数据库为已确定决策，应用框架为推荐项（ADR-019），最终由开发者确认。

## 1. 数据库选型（已确定）

| 项 | 选型 | 依据 |
| --- | --- | --- |
| 引擎 | PostgreSQL **≥ 14** | ADR-002 / db §2 |
| 关键特性 | `jsonb`、`timestamptz`、部分唯一索引（`WHERE` 谓词）、行级安全（RLS）、DEFERRABLE 约束、触发器 | db §2 / §5 / §7 |
| 字符集 | UTF-8 | 跨 Windows↔WSL 统一编码（agent §12.5）|
| 主键 | UUID（应用层或 `gen_random_uuid()`，启用 `pgcrypto`）| db §6.1 |

> 选择 PostgreSQL 而非 SQLite/MySQL 的原因：MVP 即需 RLS 强制跨项目隔离（ADR-009）、部分唯一索引（`workflow_definitions` 同名仅一个 active，db §7.2）、`jsonb` 契约字段与延迟约束（ADR-007），均为 PG 原生能力。

## 2. 迁移机制

### 2.1 迁移工具要求

迁移工具必须满足（由 ADR 约束推导）：

- 支持 **版本化、可回滚** 迁移（roadmap §8.3：迁移文件必须可回滚或有清晰替代策略）。
- 支持 **DEFERRABLE INITIALLY DEFERRED** 外键约束（ADR-007 资产版本循环外键）。
- 支持原生 SQL（用于 RLS 策略、触发器、部分唯一索引等 ORM 通常不覆盖的 DDL）。

### 2.2 迁移分期（对齐 roadmap 各 Sprint 数据库交付）

| Sprint | 新增/变更表 | 迁移注意 |
| --- | --- | --- |
| S1 | `users`、`projects`、`content_tasks`、`audit_events` | `audit_events` 首版即含 `sequence_no`/`prev_hash`/`entry_hash` 与 append-only 触发器 + 撤销 UPDATE/DELETE 权限（ADR-008）|
| S2 | `workflow_definitions`、`workflow_stages`、`workflow_stage_dependencies`、`workflow_runs`、`stage_runs`、`context_packs`、`content_assets`、`asset_versions` | `content_assets↔asset_versions` 延迟约束（ADR-007）；`stage_runs.agent_profile_id` 仅建列不加 FK，迁移注释说明延后至 S4（ADR-020）；`content_assets.status` 仅落 `draft`/`archived`（db §5.9 子集）|
| S3 | `review_records`；`content_assets.status` 补齐 `review_pending`/`approved`/`rejected`/`stale`；`audit_events` 扩展 action | 退回/重试在单事务更新审核+阶段+工作流+审计（roadmap §6.7）|
| S4 | `agent_profiles`、`mcp_servers`、`mcp_tools`、`tool_invocations`、`publish_records`；补 `stage_runs.agent_profile_id` FK | 敏感快照表（`tool_invocations`）建表即启用 RLS / `project_id` 谓词（ADR-009）；`publish_records` 必含 `asset_version_id`（db §5.21）；Skill/插件表仅占位非 MVP（ADR-016）|

### 2.3 迁移规约

- 每个迁移配套 `up` / `down`；不可逆变更须在迁移说明声明替代回滚策略。
- RLS 策略、触发器、哈希链校验函数以原生 SQL 迁移管理，纳入版本控制。
- 迁移顺序遵循外键依赖；跨 Sprint 延后的 FK（ADR-020）在补加迁移中显式说明。

## 3. 安全强制点的数据库落点（开发期必办）

> 以下为 RC 评审与终审列明的安全强制点在 DB 层的落地约定，对应检查清单 §1.3，须在相应 Sprint 的迁移与 DoD 中实现。

| 强制点 | DB 落点 | Sprint |
| --- | --- | --- |
| 审计哈希链（ADR-008）| `audit_events` 三字段 + append-only 触发器 + 权限撤销 | S1（首版）|
| 跨项目 RLS（ADR-009）| 敏感表 `project_id` + RLS 策略；单项目也走谓词 | S1 起逐表 |
| 脱敏管道（ADR-012）| 写入前经脱敏中间件；`*_digest` 用 SHA-256 不可逆 | S1 起 |
| 凭证仅引用（ADR-010）| 任何表禁止明文密钥/令牌；只存安全引用 | 全程 |
| 配置快照（db §9.4）| `agent_sessions.profile_snapshot`、`mcp_config_versions` | S4 |

## 4. 环境变量与凭证约定

### 4.1 配置分层

- 非敏感配置（DB 连接非密部分、运行参数）经环境变量或配置文件，纳入示例模板（如 `.env.example`），不含真实值。
- **敏感凭证（DB 密码、Agent/MCP API Key、公众号凭证）只存安全引用**：本地开发经环境变量注入或本地 vault；不写入仓库、不入数据库、不入日志、不入上下文包（ADR-010 / db §11）。

### 4.2 约定的环境变量（参考）

| 变量 | 用途 | 敏感 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 | 是（密码部分）|
| `APP_PORT` | 后端服务端口 | 否 |
| `OBJECT_STORE_*` | 内容资产对象存储引用 | 视实现 |
| Agent/MCP 凭证 | 经凭证管理组件按 Session 注入，不全局暴露（arch §14.3）| 是 |

> 凭证注入到 Agent 执行宿主（本地/WSL/远端）经安全通道、最小作用域、任务结束即失效；不写入命令行参数、不落盘（agent §12.4）。

## 5. 本地与 WSL 启动

### 5.1 前置依赖

- PostgreSQL ≥ 14（本机或 WSL 内，或容器）。
- 运行时：按 ADR-019 确认的栈安装（参考栈：Node.js LTS）。
- WSL2 发行版（目标运行环境）。

### 5.2 WSL 注意事项（对齐 agent §12.5）

- 跨 Windows↔WSL 边界统一 UTF-8；WSL 侧换行用 LF，避免 CRLF 污染产出与 diff。
- 路径转换前规范化（解析符号链接与 `..`、拒绝越界根如 `/mnt/c`、UNC），强制落在工作目录白名单根内（RC R 沙箱 / agent §9.4）。
- CLI Agent 在 WSL 内执行时，工作目录与凭证限定当前 Session，不泄漏到宿主用户环境或其他 distro。

### 5.3 启动步骤（参考实现栈，待 ADR-019 确认后细化）

```text
1. 准备 PostgreSQL ≥ 14，创建数据库与最小权限应用账号（区分写入身份与审计读取身份，ADR-008）。
2. 复制 .env.example → .env，填入 DATABASE_URL 等（敏感值不入仓库）。
3. 安装依赖并运行迁移至当前 Sprint 目标版本（含 RLS/触发器原生 SQL 迁移）。
4. 启动后端服务与前端开发服务器。
5. 验证：健康检查端点可达；审计写入产生带 entry_hash 的事件；跨项目查询被 RLS 拒绝（自动化测试覆盖）。
```

> 具体命令随 ADR-019 技术栈确认后补全；本节先约束「必须验证的就绪判据」（步骤 5），框架命令为实现细节。

## 6. 就绪判据（Definition of Ready for Coding）

Sprint 1 编码前应满足：

- [ ] PostgreSQL ≥ 14 可连接，应用账号最小权限就绪。
- [ ] 迁移工具确认支持回滚 + DEFERRABLE + 原生 SQL（ADR-007）。
- [ ] `.env.example` 就位，敏感凭证经引用注入，无明文入仓。
- [ ] 审计哈希链与 RLS 的迁移与测试方案确认（ADR-008/009）。
- [ ] 技术栈（ADR-019）经开发者确认。

## 7. 关联文档

- 数据库表结构与状态机：`docs/03-database/database-design.md`
- 决策依据：`docs/00-project/decision-log.md`
- 开发路线图与 Sprint 数据库交付：`docs/10-development/development-roadmap.md`
- API 契约：`docs/09-api/api-overview.md`
- Agent 执行宿主与 WSL：`docs/04-agent/agent-architecture.md` §12
