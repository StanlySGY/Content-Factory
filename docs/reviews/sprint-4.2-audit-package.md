# Sprint-4.2 Audit Package — MCP Shell

MCP Server / Tool / Invocation 壳层（配置 + 观测 + Mock Runtime）的发布裁决文档。

## Scope
交付 MCP Server 配置、Tool 配置、调用日志观测与 Mock 运行壳层（roadmap §7 子集）。**不含**真实 MCP Client、SSE/WS/stdio transport、HTTP MCP 调用、Tool Marketplace、真实工具执行、Agent 自动执行。

## Delivered
| 层 | 交付 |
| --- | --- |
| DB | `mcp_servers`（status + risk_level CHECK）、`mcp_tools`（manifest/enabled）、`tool_invocations`（append-only，status CHECK）+ 权限 + Drizzle 镜像（0014/0015）|
| Domain | McpServer 状态机（active↔disabled，→archived 终态）+ validateRiskLevel / validateToolManifest / validateInvocationSnapshot / statusIsFinalInvocation（无 ToolInvocation 状态机）|
| Repository | McpServer（直接 project_id 隔离）/ McpTool（server-join 隔离）/ ToolInvocation（server-join 隔离，append-only）|
| Service | McpServerService、McpToolService、McpRuntimeMockService（health/mock-invoke，单事务 + 审计，无真实调用）|
| API | `/api/mcp/servers*`、`/api/mcp/servers/:id/tools`、`/api/mcp/tools/:id*`、`/api/mcp/tools/:id/mock-invoke`、`/api/mcp/tools/:id/invocations`、`/api/tool-invocations/:id`、health-check |

## E2E Results（6 链路全绿）
1. Server 生命周期：create→active→disabled→active→archived；archived→active = **409**。
2. Health：active→true / disabled→false / archived→false。
3. Tool 生命周期：create/update/get/list 一致。
4. Mock Invocation：success/failed/blocked；request/response_snapshot 存在、status 正确。
5. Invocation 查询：invoke→list→get 一致。
6. Agent×MCP 联动：`tool_invocations.agent_profile_id` 写入并可读（仓储层，FK 有效）。

## Permissions Verification（has_table_privilege）
- `cf_app`：mcp_servers S/I/U·**D拒**；mcp_tools S/I/U·**D拒**；tool_invocations S/I·**U/D拒**（append-only）。
- `cf_audit_reader`：三表 **SELECT only**。

## Audit Log Verification
写入并验证：mcp_server.created/updated/health_checked、mcp_tool.created/updated、tool_invocation.created；事件字段 `subject_type` / `subject_id` / `actor_id` 完整（`project_id` 经 RLS 隔离），同业务事务提交。

## Coverage Report
- 全局 **99.25 line / 91.70 branch**（≥98/88 ✓）｜ application 99.86/90.46（≥95 ✓）｜ domain 100/100（≥90/85 ✓）｜ routes 100/100（≥95 ✓）｜ repository **98.89/87.73**（≥90/85 ✓）。
- 本 Sprint 新增 MCP 仓储：mcp-server 100/100、mcp-tool 100/95.83、tool-invocation 100/100。
- repository 层经补测历史仓储（content-task/workflow-definition/content-asset/stage-run/workflow-run 等）防御性 not-found/默认/全字段分支硬化，目录分支由 77% 提升至 **87.73%**（≥85），纯测试补充、无逻辑变更。
- Migration Gate：up→down→up（干净 schema 三轮）**EXIT 0**。
- 回归：Sprint-3（Review/Asset/Dashboard/Editor/Queue）、Sprint-4.1（Agent Profile/Session/Health/Mock）全部重跑无回归。全栈 **439 通过**（api 389 / web 40 / shared 6）。

## Risk Register（NON-BLOCKER）
- **R1**：MCP Runtime 为 Mock——无真实 MCP Client / SSE / WS / stdio / HTTP 调用。
- **R2**：`mock-invoke` 端点固定 `agent_profile_id=null`；Agent×MCP 联动能力在数据/仓储层就绪（FK + 列 + E2E-6 验证），经端点贯通留待后续。
- **R3**：Tool Marketplace、Agent Messages、真实工具执行、UI 扩展延后。

## Final Decision
**PASS / GO** —— MCP Shell（Server→Tool→Mock Invocation）端到端可用，权限/append-only/审计不变量验证通过，迁移可逆，**全部覆盖率门禁达标**（含 repository ≥90/85），无回归。不阻塞 Sprint-4.3。
