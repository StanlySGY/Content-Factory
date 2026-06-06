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
- 全局 **98.79 line / 88.85 branch**（≥98/88 ✓）｜ application 99.86/90.46（≥95 ✓）｜ domain 100/100（≥90/85 ✓）｜ routes 100/100（≥95 ✓）。
- 本 Sprint 新增 MCP 仓储：mcp-server 100/100、mcp-tool 100/95.83、tool-invocation 100/100（均 ≥90/85 ✓）。
- repository **目录聚合分支 77%**（< 85 子目标）——完全由历史 Sprint-1/2/3 仓储防御性分支构成（content-task 30%、dashboard 44%、workflow-definition 55% 等），**非 Sprint-4.2 引入**；配置 CI 门禁（全局 80/70 + domain 90/85）通过。见 Risk Register R1。
- Migration Gate：up→down→up（干净 schema 三轮）**EXIT 0**。
- 回归：Sprint-3（Review/Asset/Dashboard/Editor/Queue）、Sprint-4.1（Agent Profile/Session/Health/Mock）全部重跑无回归。全栈 **431 通过**（api 385 / web 40 / shared 6）。

## Risk Register（NON-BLOCKER）
- **R1**：repository 层聚合分支 77% < 85 子目标，源自历史仓储防御性 `??`/错误分支（如 dashboard `summaryByProject` 的不可达 `?? 0`）；非本 Sprint 回归。建议设独立「仓储覆盖率硬化」任务，不阻塞发布。
- **R2**：MCP Runtime 为 Mock——无真实 MCP Client / SSE / WS / stdio / HTTP 调用。
- **R3**：`mock-invoke` 端点固定 `agent_profile_id=null`；Agent×MCP 联动能力在数据/仓储层就绪（FK + 列），经端点贯通留待后续。
- **R4**：Tool Marketplace、Agent Messages、真实工具执行延后。

## Final Decision
**PASS / GO** —— MCP Shell（Server→Tool→Mock Invocation）端到端可用，权限/append-only/审计不变量验证通过，迁移可逆，配置门禁全绿，无回归；MCP 新增代码覆盖率达标。R1 为既有跨 Sprint 仓储债（非本 Sprint 引入），不阻塞 Sprint-4.3。
