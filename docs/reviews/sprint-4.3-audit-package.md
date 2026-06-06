# Sprint-4.3 Audit Package — Release Gate（现有范围：Agent + MCP 壳层）

> 决策记录：Sprint-4.3 Publisher / 公众号工作台 **尚未实现**（无 publish_records 表、无 Publisher Service/API）。本次按既定方向「仅收尾现有已交付范围（Agent + MCP）」执行 Release Gate；依赖 Publisher 的 E2E-1 / E2E-2 / publish 审计标注为 **N/A·未交付**，不阻塞、未伪造。未新增任何代码。

## Scope
对已交付的 Sprint-4.1 Agent 壳层 + Sprint-4.2 MCP 壳层做发布收口：E2E 链路、权限隔离、审计、回归、覆盖率、迁移可逆性。**不含** Publisher（延后）、真实 Agent/MCP 执行。

## Delivered（截至本 Gate）
- Sprint-1~3：Task / Workflow / Stage / Context / Asset / Review / Dashboard / Editor / Queue。
- Sprint-4.1：Agent Profile（状态机）+ Agent Session（append-only）+ Health/Mock Runtime。
- Sprint-4.2：MCP Server / Tool + Tool Invocation（append-only）+ Mock Runtime。
- **未交付**：Publisher / publish_records / 公众号工作台（Sprint-4.3 实现环节被跳过）。

## E2E Results
| 链路 | 状态 | 来源 |
| --- | --- | --- |
| E2E-1 Publisher（…→publish_record） | **N/A·未交付** | Publisher 未实现 |
| E2E-2 publish_records append-only | **N/A·未交付** | publish_records 不存在 |
| E2E-3 MCP invocation → tool_invocation → audit | PASS | `sprint42-e2e`（mock invoke + 审计字段完整）+ `mcp-service`（审计发射） |
| E2E-4 Agent × MCP 联动（agent_profile_id 可追溯） | PASS | `sprint42-e2e` E2E-6（agent_profile_id 写入并可读，FK 有效） |
| E2E-5 Dashboard 数据一致性 | PASS（部分） | `sprint35-e2e`（summary↔pending/work-queue 计数一致）；Agent/MCP 概览为前端按列表计算，无后端聚合端点 |
| E2E-6 全系统权限隔离 / append-only | PASS | `repositories.test`（asset_versions/review_records/agent_sessions/tool_invocations 的 UPDATE→permission denied + 跨项目隔离） |

全栈回归 **435 通过**（api 389 / web 40 / shared 6），0 失败；Sprint-3 / 4.1 / 4.2 无回归。

## Permissions
- append-only 表 `cf_app` U/D 全部被拒：asset_versions / review_records / agent_sessions / tool_invocations = `U/D=00`。
- mcp_servers / mcp_tools：cf_app S/I/U·D拒；mcp_servers/tool 等配置表与 agent_profiles 一致。
- `cf_audit_reader`：全部相关表 SELECT only。

## Audit Logs
全链路审计动作齐备且同事务写入、字段（subject_type/subject_id/actor_id，project_id 经 RLS）完整：content_task / workflow_run / stage_run / review_record / content_asset / agent_profile / agent_session / mcp_server / mcp_tool / tool_invocation。（publish.* 审计 N/A——Publisher 未交付。）

## Coverage Report
- 全局 **99.25 line / 91.69 branch**（≥98/88 ✓）。
- domain 99.02/97.66（≥90/85 配置门禁 ✓；非字面 100%，content-task 域校验少量分支）。
- application 99.87/90.46（≥95 ✓）｜ repository 98.89/87.69（≥90/85 ✓）｜ routes 100/100（≥95 ✓）。
- Migration Gate：up→down→up（干净 schema 三轮）**EXIT 0**。

## Risks（NON-BLOCKER）
1. **Publisher 未交付**：publish_records / 公众号工作台 / 发布准备记录均未实现；E2E-1/E2E-2 与 publish 审计为 N/A。属 Sprint-4.3 实现缺口，需后续单独建设（DB→Domain→Repo→Service→API→UI）。
2. Agent / MCP 为「配置 + 记录 + trace」体系，Runtime 均为 Mock（无真实 MCP Client / SSE / WS / stdio、无真实 Agent/工具执行）。
3. `mock-invoke` 端点固定 `agent_profile_id=null`；Agent×MCP 联动能力在数据/仓储层就绪。
4. Dashboard 的 Agent/MCP 概览为前端计算，无后端聚合端点。

## Final Decision
**GO（现有范围）** —— Agent + MCP 壳层端到端可用，权限/append-only/审计/迁移不变量验证通过，覆盖率门禁全绿，无回归。**不阻塞 Release**。但需明确：**Publisher（Sprint-4.3 实现）为未交付项**，完整 Sprint-4 收口须在 Publisher 建成后补做其 E2E-1/E2E-2 与 publish 审计。
