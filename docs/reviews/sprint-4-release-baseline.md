# Sprint-4 Release Baseline — Freeze

> 只读基线冻结，无代码/DB/API 改动。基线 commit：`5cd37c7`。
> **两处对模板的如实更正**：(1) MCP System **无 UI**（Sprint-4.2 未含 UI 步骤，仅 DB/Domain/Repo/Service/API/E2E）；(2) domain 覆盖率实测 **99.02 line / 97.66 branch**（≥ 配置门禁 90/85），非字面 100%。

## 1. 最终交付范围（IN SCOPE）

| 系统 | DB | Domain | Repo | Service | API | UI | E2E |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 内容/工作流/审核（S1–S3.5） | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Editor / Dashboard / Queue（S3/S3.5） | — | — | ✔(只读聚合) | ✔ | ✔ | ✔ | ✔ |
| **Agent System**（S4.1） | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **MCP System**（S4.2） | ✔ | ✔ | ✔ | ✔ | ✔ | **✘ 无 UI** | ✔ |
| Infra：审计哈希链 / append-only / 项目隔离 / 权限 | ✔ | — | ✔ | ✔ | — | — | ✔ |

Agent/MCP 均为**配置 + 观测 + Mock Runtime**（健康检查、模拟会话/调用、trace），非真实执行。

## 2. 明确未交付范围（OUT OF SCOPE）

- **Publisher / publish_records / 公众号工作台 / 发布准备记录**：从 Sprint-4 范围正式剥离（无表、无 Service/API/UI）。
- **MCP 前端 UI**：Server/Tool/Invocation 管理页未交付（仅后端 + E2E）。
- 真实 Agent/LLM 执行、真实 MCP Client（SSE/WS/stdio/HTTP）、Tool Marketplace、agent_messages、外部平台集成。

## 3. 系统依赖关系

```
Infra（PostgreSQL · 显式 project_id 隔离 · audit_events RLS + 哈希链 · append-only 权限层）
  │
  ├─ Workflow/Review/Asset（S1–S3）
  │     content_tasks → workflow_runs → stage_runs → content_assets → asset_versions(append-only)
  │                                        └→ review_records(append-only)
  │     Editor/Dashboard/Queue（S3.5）= 上述之上的只读聚合
  │
  ├─ Agent System（S4.1）
  │     agent_profiles ◄── agent_sessions(append-only, profile_snapshot)
  │
  └─ MCP System（S4.2）
        mcp_servers ◄── mcp_tools
            └──◄ tool_invocations(append-only)
                     └──► agent_profiles (FK, nullable)   ← Agent×MCP trace 锚点
```

跨系统耦合仅一处：`tool_invocations.agent_profile_id`（可空 FK）实现 Agent×MCP 可追溯，无反向依赖。

## 4. E2E 覆盖矩阵（真实 vs N/A）

| 链路 | 状态 | 来源 |
| --- | --- | --- |
| Task→Workflow→Stage→Review→退回重执行→Asset→Dashboard | 真实 | review-e2e / sprint35-e2e |
| Editor 全链 + Context Panel + 版本对比 | 真实 | sprint35-e2e |
| Agent 生命周期 / Health / Mock Session | 真实 | agent-e2e |
| MCP Server/Tool 生命周期 / Health / Mock Invocation / 查询 | 真实 | sprint42-e2e / mcp-api |
| Agent×MCP 联动（tool_invocations.agent_profile_id 可追溯） | 真实 | sprint42-e2e(E2E-6) |
| Dashboard 数据一致性（summary↔pending/work-queue） | 真实（部分） | sprint35-e2e；Agent/MCP 概览为前端计算，无后端聚合端点 |
| 权限隔离 / append-only U/D 拒绝 | 真实 | repositories.test |
| **Publisher（…→publish_record）** | **N/A** | Publisher 未交付 |
| **publish_records append-only 生命周期** | **N/A** | publish_records 不存在 |

## 5. 数据模型边界

- **Append-only**（cf_app 仅 S/I，DB 撤 U/D，已 E2E 验证 `permission denied`）：`audit_events`、`asset_versions`、`review_records`、`agent_sessions`、`tool_invocations`。状态于插入时定稿，无就地流转。
- **FK 血缘**：全部 `ON DELETE RESTRICT`，保护血缘不被级联清除；软删除模型（无 DELETE 授权）。
- **项目隔离**：
  - 直接 `project_id` 谓词：`content_tasks`、`workflow_definitions`、`review_records`、`agent_profiles`、`mcp_servers`。
  - JOIN 隔离：运行态经 `content_tasks`（`workflow_runs`/`stage_runs`/`content_assets`/`context_packs`）；`mcp_tools`/`tool_invocations` 经 `mcp_servers`；`agent_sessions` 经 `agent_profiles`（均不信任自带冗余 project_id）。
  - **RLS**：仅 `audit_events`。

## 6. 权限模型总结

- **cf_app**（业务运行身份）：可变表 S/I/U（无 DELETE，软删除）；append-only 表仅 S/I（U/D 已撤）。
- **cf_audit_reader**（审计只读身份）：所有审计/记录表 **SELECT only**。
- 角色由 `db/provision.sql` 前置创建；各 grants 迁移以 `IF EXISTS (pg_roles)` 守卫，缺角色环境不硬失败。

## 7. Release 验证（基线认证）

- typecheck：PASS ｜ lint：PASS ｜ tests：PASS（**435**：api 389 / web 40 / shared 6）
- coverage：global 99.25/91.69（≥98/88）｜ domain 99.02/97.66（≥90/85）｜ application 99.87/90.46（≥95）｜ repository 98.89/87.69（≥90/85）｜ routes 100/100
- migration up→down→up：EXIT 0 ｜ append-only U/D 拒绝：4 表全验证 ｜ cf_audit_reader：SELECT only

## 8. 裁决

**GO（基线冻结）** —— Agent + MCP 壳层 + S1–S3.5 内容/工作流/审核/Infra 构成可演示的「配置 + 记录 + trace」平台，门禁全绿、不变量验证通过。**Publisher 正式移出 Sprint-4**（未交付，留待后续 Sprint），E2E-1/E2E-2 定义为 N/A。本基线为 Sprint-4 最终交付定义。
