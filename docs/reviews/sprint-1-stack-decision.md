# Sprint-1 技术栈决策（Stack Decision）

> 文档类型：Sprint 1 技术选型最终决策（确认并取代 ADR-019「建议待确认」）
> 日期：2026-06-04
> 依据：`decision-log.md` ADR-019 / ADR-002 / ADR-007 / ADR-008 / ADR-009 / ADR-012、`10-development/setup.md`、`09-api/api-overview.md`、`10-development/development-roadmap.md` §4
> 范围约束：本决策只服务 Sprint-1（users / projects / content_tasks / audit_events + 任务 CRUD + 审计查看）；不引入 Workflow/MCP/Skill/Agent 执行相关依赖。

## 0. 结论速览

| 维度 | 最终选型 | 取代/确认 |
| --- | --- | --- |
| Backend | **TypeScript + Node.js 22 + Fastify 4** | 确认 ADR-019（Node 方向），框架定为 Fastify |
| Frontend | **React 18 + Vite 5 + TypeScript**（React Router + TanStack Query）| 确认 ADR-019 |
| Database | **PostgreSQL 16**（Docker Compose 隔离实例，端口 5433）| 确认 ADR-002（≥14）|
| ORM / 数据层 | **Drizzle ORM**（类型化查询 + 每事务 `SET LOCAL` 注入 RLS 上下文）| 确认 ADR-019、满足 ADR-009 |
| Migration | **node-pg-migrate**（up/down + 原生 SQL）| 满足 setup §2.1/§2.3、ADR-007/008 |
| Validation | **TypeBox**（Fastify 原生 schema，运行时校验 + 静态类型单源）| 满足 api §2.3、setup 后端校验 |
| Testing | **Vitest + Fastify inject + React Testing Library**，覆盖率 v8 | 满足 roadmap §4.6 |

环境已验证：Node v22.19.0、pnpm 10.33.1、PostgreSQL 16.14、Docker 29.2.1 + Compose v5.1.0。

## 1. Backend — Fastify（非 NestJS）

- **选型**：Fastify 4 + TypeScript，手工分层 `interfaces/http → application → domain → infrastructure`（对齐 arch §8.1 `API → Application → Domain → Adapter`）。
- **理由**：
  1. **契合「精简高效、毫无冗余」核心风格**：4 张表 / 4 个端点的 MVP 用 NestJS 的模块/装饰器/DI 体系是重型仪式，与精简原则冲突；Fastify 用最小样板即可实现同等分层。
  2. **校验与序列化内建**：Fastify 基于 JSON Schema 做请求校验 + 响应序列化，天然承载「后端重复校验」（api §2.2），无需额外校验中间件。
  3. **性能与可测试性**：`app.inject()` 进程内 HTTP 测试，集成测试零网络开销（roadmap §4.6）。
  4. **分层不靠框架强制、靠目录与依赖方向约束**：领域层零框架依赖，便于单测与未来替换。

## 2. Frontend — React + Vite

- **选型**：React 18 + Vite 5 + TypeScript；路由 React Router 6；服务端状态 TanStack Query；样式手写 CSS + 设计 Token（ui §6.2），不引入重型组件库。
- **理由**：
  1. ADR-019 明确 React + Vite；Vite 启动/HMR 快，单人迭代成本低。
  2. TanStack Query 直接覆盖 ui §19 的加载/错误/重试/局部失败语义，避免手写请求状态机（无冗余）。
  3. 不引入 MUI/AntD 等重库：S1 页面（Dashboard 空态、任务列表、表单、详情、审计视图）用轻量自研组件即可，符合「先交付可用列表和表单，不做复杂动效」（roadmap §4.7）与「不过度设计」。
  4. 布局壳层 `AppShell/SidebarNav/TopBar/ContextPanel` 在 S1 建立为基线，后续 Sprint 复用（roadmap §8.2）。

## 3. Database — PostgreSQL 16（Docker 隔离实例）

- **选型**：PostgreSQL 16（满足 ADR-002 ≥14），经 `docker-compose.yml` 启动专用实例，宿主端口 **5433**（避让系统 5432）。
- **理由**：
  1. ADR-002 已锁定 PG；S1 即需 `jsonb`（requirement_data）、`timestamptz`、部分唯一索引、**RLS**（ADR-009）、**触发器 + 权限撤销**（ADR-008 审计 append-only）——均为 PG 原生能力。
  2. **为何用 Docker 而非系统 PG**：宿主 `sgy` 角色无 `CREATEDB`/superuser、无免密 sudo，无法创建库与配置写/审计读身份分离（ADR-008）。Docker 实例容器内有完整权限、可复现、不污染系统库、对齐 setup §5.1「本机或 WSL 内，或容器」。**此供给方式无需 sudo，开发侧自助完成。**
  3. UTF-8 + LF，跨 Windows↔WSL 统一（setup §5.2）。

## 4. ORM / 数据层 — Drizzle ORM

- **选型**：Drizzle ORM 作类型化查询与仓储层；Schema 以 TS 声明用于类型推导；RLS 上下文经每事务 `SET LOCAL app.current_project_id` 注入。
- **理由（含与 Prisma 对比）**：
  1. **RLS 友好**（ADR-009 关键）：Drizzle 事务内可直接执行 `SET LOCAL` 注入项目上下文，连接归还自动复位；Prisma 连接池下逐请求设置会话变量易泄漏、需绕行 interactive transaction，透明度差。
  2. **不与原生 SQL 抢主权**：安全关键 DDL（RLS 策略、append-only 触发器、哈希链函数、角色 grant/revoke）由迁移层原生 SQL 掌控；Drizzle 只做查询，二者边界清晰。
  3. **低样板、可扩展**：类型推导强、无 codegen 守护进程，契合无冗余；S4 增至约 25 张表时仍可控。
- **DEFERRABLE（ADR-007）说明**：S1 四表无循环外键，DEFERRABLE 在 S2（`content_assets↔asset_versions`）才需要；届时由 node-pg-migrate 原生 SQL 落地，Drizzle 不参与该约束定义，**R4 不构成 S1 阻塞**。

## 5. Migration — node-pg-migrate

- **选型**：node-pg-migrate 管理迁移，每迁移含 `up`/`down`，以原生 SQL 表达安全 DDL。
- **理由**：
  1. **满足 setup §2.1/§2.3 硬要求**：版本化 + **可回滚（up/down）** + 原生 SQL；drizzle-kit 为前向 journal、无原生 down，不满足「配套 up/down」。
  2. **安全 DDL 必须原生 SQL**：审计 append-only 触发器、`entry_hash` 计算函数、`REVOKE UPDATE/DELETE`、RLS `CREATE POLICY`、部分唯一索引、写/审计读角色分离——ORM 均无法表达，node-pg-migrate 直写 SQL。
  3. **支持 DEFERRABLE**（ADR-007，S2 用）：原生 SQL 直接声明 `DEFERRABLE INITIALLY DEFERRED`。
- **架构边界说明**：迁移层（DB 真相，含安全 DDL）与 Drizzle Schema（查询类型镜像）分工明确，非重复逻辑，是刻意的职责边界。

## 6. Validation — TypeBox

- **选型**：TypeBox 定义请求/响应 Schema，经 `@fastify/type-provider-typebox` 接入 Fastify。
- **理由**：
  1. **单源**：一份 TypeBox Schema 同时产出运行时校验与静态类型，避免 Zod + 手写类型的双源冗余。
  2. **Fastify 原生**：直接驱动 Fastify 的校验 + 序列化，落地 api §2.2「后端重复校验」、api §2.3 统一错误（400 输入校验失败）。
  3. 共享契约置于 `packages/shared`，前后端复用同一 Schema（无冗余）。

## 7. Testing — Vitest

- **选型**：Vitest（后端单元 + 集成、前端组件），Fastify `inject` 做 API 测试，React Testing Library 做前端，覆盖率用 v8。
- **理由**：
  1. **真库集成不可 mock**：ADR-008 哈希链、ADR-009 RLS 必须在真实 PG 上验证（断链/断号检测、append-only 拦截、跨项目拒绝）→ 集成测试连 Docker PG。
  2. Vitest 原生 TS/ESM、配置极简、与 Vite 前端同栈，无冗余。
  3. **覆盖率目标**（roadmap §4.6）：核心领域逻辑 ≥90%，整体 ≥80%。S1 不做 E2E（E2E 属 S3 §6.6）。

## 8. 目录结构（pnpm workspace monorepo）

```text
Content-Factory/
├── apps/api/          # Fastify 后端（domain/application/infrastructure/interfaces）
├── apps/web/          # React + Vite 前端
├── packages/shared/   # 前后端共享契约（status 枚举、DTO、schema_version）
├── db/migrations/     # node-pg-migrate up/down 迁移（含安全 DDL）
├── docker-compose.yml # PostgreSQL 16（5433）
├── .env.example
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

分层依赖方向：`interfaces/http → application → domain ← infrastructure`（domain 零外部依赖）。

## 9. S1 安全强制点落点（决策→实现映射）

| 强制点 | 选型落地 | 依据 |
| --- | --- | --- |
| 审计哈希链 + append-only | node-pg-migrate 原生 SQL：`sequence_no`/`prev_hash`/`entry_hash` + BEFORE UPDATE/DELETE 触发器 RAISE + `REVOKE UPDATE,DELETE` | ADR-008 |
| 写/审计读身份分离 | 容器内建 `cf_app`（写）与 `cf_audit_reader`（只读审计）角色 | ADR-008 / setup §3 |
| 跨项目 RLS | audit_events 启用 RLS + `current_setting('app.current_project_id')` 谓词；content_tasks 数据层强制 project_id 谓词 | ADR-009 |
| 统一脱敏 + 不可逆摘要 | AuditService 写入前经 RedactionService；摘要用 SHA-256 | ADR-012 |

## 10. ADR-019 处置

本决策确认并细化 ADR-019：状态由「建议待确认」更新为「已确定（Sprint 1）」，并补记最终框架级选型。详见 `decision-log.md` ADR-019 更新条目。
