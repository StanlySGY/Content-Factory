# Sprint-4.1 Audit Package — Agent Shell

Agent 配置 + 观测 + Mock Runtime 壳层的发布裁决文档。

## 1. Scope
交付 Agent Profile 配置与 Mock 运行观测壳层（roadmap §7 子集）：可配置 Agent、查看状态、健康检查、模拟会话与会话历史。**不含**真实 Agent 执行、LLM、MCP、agent_messages、自动化流程。

## 2. Delivered
| 层 | 交付 |
| --- | --- |
| DB | `agent_profiles`（status CHECK active/disabled/archived，capabilities/constraints jsonb）、`agent_sessions`（append-only，status CHECK pending/running/completed/failed，profile_snapshot）+ 权限授权 + Drizzle 镜像 |
| Domain | AgentProfile 状态机（active↔disabled，→archived 终态）+ session/capability/constraint 校验器（无 Session 状态机，ADR-5）|
| Repository | AgentProfileRepository（直接 project_id 隔离）、AgentSessionRepository（append-only，profile-join 隔离）|
| Service | AgentProfileService（create/update 经状态机+校验，同事务审计）、AgentRuntimeMockService（health-check/mock-session，无真实执行）|
| API | `GET/POST /api/agents`、`GET/PATCH /api/agents/:id`、`POST /api/agents/:id/health-check`、`POST /api/agents/:id/mock-sessions`、`GET /api/agents/:id/sessions`、`GET /api/agent-sessions/:id` |
| UI | Agent 列表/创建/详情（编辑+状态切换+健康检查+会话）、会话详情、Dashboard Agent 概览、侧栏入口 |

## 3. Tests
- 全栈 **365 通过**（api 319 / web 40 / shared 6），0 失败。
- Agent E2E（5 链路全绿）：生命周期（archived 拒恢复 409）、健康检查（active/disabled/archived）、Mock Session（4 态 + snapshot + 可读）、会话历史（create→list→get 一致）、Dashboard 概览数据一致。
- 回归：Sprint-1/2/3/3.5（Audit/Workflow/Context/Asset/Review/Compare/Editor/Queue）全部重跑无回归。

## 4. Coverage
- Domain：100%（≥90/85）｜ Application：99.83% 行 / 88.92% 分支（≥基线）｜ Routes：100% ｜ 全局 98.58/86.78（≥基线 98/84）。

## 5. 权限 / 数据一致性
- `cf_app`：agent_profiles S/I/U（D 拒）；agent_sessions S/I（U/D 拒，append-only）。`cf_audit_reader`：两表仅 S。经 `has_table_privilege` 验证。
- agent_sessions 不可改（DB UPDATE→permission denied，集成测试断言）；agent_profiles archived 不可恢复（状态机 + 409）；profile/session 无删除端点。
- 迁移 up→down→up（干净 schema 三轮）EXIT 0。

## 6. Risks / Non-blockers（Sprint-4.2 Backlog）
1. Agent Runtime 为 Mock（无真实执行/LLM/MCP）——壳层设计，非缺陷。
2. `agent_messages` 延后（ADR-5）；会话为一次性定稿记录、无消息明细。
3. Review API 契约形状裁定（承自 Sprint-3）、`attempt_count` 语义、editor-state 阶段显示名——均承前，未阻塞。
4. UI 状态切换按钮为前端 affordance，权威状态机在后端（409 兜底）。

## 7. Release Decision
**PASS / GO** —— Release Gate 全绿，Agent Shell MVP（配置→健康检查→Mock Session→历史→Dashboard）端到端可用，权限与 append-only 不变量验证通过，无回归。不阻塞 Sprint-4.2（MCP 壳层）。
