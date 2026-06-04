# 04 MCP 审查

> 状态：已完成　|　最近更新：2026-06-03　|　规则：[00-review-master.md](./00-review-master.md)

## 1. 审查对象

- `docs/05-mcp/mcp-architecture.md`
- 关联：`docs/04-agent/agent-architecture.md`（§9 Tool、§11 MCP）、`docs/02-architecture/system-architecture.md`（§7）、`docs/03-database/database-design.md`（`mcp_servers` / `mcp_tools` / `tool_invocations` / `audit_events` / `mcp_installations` / `mcp_config_versions`）

## 2. 审查目标

验证 MCP 生命周期、注册、安装、启停、权限、日志、热加载、市场与第三方治理是否完整、安全、可扩展。

## 3. 审查清单

- [x] 网关隔离成立，业务 / Agent / Skill / 插件不直连 MCP Server
- [x] 风险分级（low / medium / high）与默认策略清晰
- [x] 新增第三方 MCP 无需修改业务代码
- [x] MCP Server 不承载核心业务规则
- [x] 密钥仅以引用注入，无明文存储
- [ ] 结果标准化（Result Normalizer）在架构图与网关契约中缺失（MCP-001）
- [ ] 生命周期状态机与数据表字段无映射（MCP-003）
- [ ] 日志 / 调用字段与 `tool_invocations` 枚举、字段不一致（MCP-002）
- [ ] 权限维度与 Manifest 契约不闭环（MCP-004）
- [x] 签名 / 摘要校验缺契约字段（MCP-005，已修复）
- [ ] 数据模型映射明确，缺口已标注（部分缺失，见 MCP-002/003/008）

## 4. 发现的问题

| ID | 级别 | 类型 | 问题 | 位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| MCP-001 | Major | Consistency/Completeness | `Result Normalizer` 在 system-arch §7.1、agent §11.1 为一等组件，本文档 §3 架构图与 §12 网关契约完全缺失 | mcp §3/§12 | 已修复 |
| MCP-002 | Major | Consistency/数据映射 | 调用日志状态枚举（denied/timeout）与字段（caller_type/caller_id/risk_level/duration_ms/digest）和 `tool_invocations` 不一致，无落库位 | mcp §9.2/§12 ↔ db §5.17 | 已修复 |
| MCP-003 | Major | 状态机/数据映射 | §4 生命周期 13 态与 `mcp_servers.status`(3 态)/`mcp_installations.install_status` 无映射，运行态无承载位 | mcp §4 ↔ db §5.13/§5.22 | 已修复 |
| MCP-004 | Major | 契约缺口 | §8.2 权限维度（production/destructive/user_confirmation/context_scope）未在 §5.2 Manifest 声明，注册期无法校验 | mcp §8.2 ↔ §5.2 | 已修复 |
| MCP-005 | Minor | 完整性 | §6.2 要求校验签名、§5.4/§11.4 记录校验值，但 Manifest §5.2 无 integrity（checksum/signature/publisher_key）字段 | mcp §5.2 | 已修复 |
| MCP-006 | Minor | 图示一致性 | §14 图为 `Agent → MCPGateway`，缺 `MCPBridge`，与本节文字及 agent §11.1 不一致 | mcp §14 | 已修复 |
| MCP-007 | Minor | 完整性 | 状态机禁用/启用语义、failed/degraded 可达终态路径不完整 | mcp §4 | 已修复 |
| MCP-008 | Minor | 完整性 | `mcp_marketplace_entries`、`mcp_lifecycle_logs` 列为"后续补充"，市场缓存与生命周期审计无持久化落点 | mcp §13 | 已修复 |

## 5. 修复建议

- **MCP-001**：§3 架构图加入 `Result Normalizer` 并连入网关链路；§12 网关契约定义标准结果结构（成功/失败/超时/拒绝统一语义）。
- **MCP-002**：统一状态枚举（补 `denied`/`timeout`，明确 `cancelled`）；`tool_invocations` 补 caller_type/caller_id/risk_level/duration_ms（与红队 RT、跨域 DB-018 一并处理）；权限日志与生命周期日志明确落库表。
- **MCP-003**：增"生命周期状态 → 数据表字段"映射表，明确注册/安装态、运行态、`archived` 的归属。
- **MCP-004**：§5.2 Manifest `permissions` 补 production/destructive/user_confirmation/context_scope，并与 `mcp_tools.permission_schema` 对齐。
- **MCP-005/006/007/008**：Manifest 增 integrity 字段；§14 图补 MCPBridge；补禁用/启用与 failed/degraded 终态语义；明确市场/生命周期日志表的落地或引用。

## 6. 最终结论

有条件通过 —— 网关唯一入口、最小权限、密钥仅引用、第三方隔离等核心约束扎实，无 Critical；需先补齐结果标准化（MCP-001）、调用日志与 DB 对齐（MCP-002）、生命周期状态映射（MCP-003）、权限与 Manifest 闭环（MCP-004）四项 Major 后进入实现。

## 7. 审查记录

| 日期 | 审查者 | 动作 | 说明 |
| --- | --- | --- | --- |
| 2026-06-03 | 架构评审 | 完成审查 | 0 Critical / 4 Major / 4 Minor；结论有条件通过 |
| 2026-06-03 | 修复跟踪 | 批次 9 修复 | MCP-001~004（4 Major）→ 已修复；Result Normalizer/调用日志对齐/生命周期映射/Manifest 权限四维；详见 fix-log 批次 9 |
| 2026-06-03 | 修复跟踪 | 批次 16 修复 | MCP-005~008（4 Minor）→ 已修复；Manifest integrity、§14 MCPBridge、状态机终态语义、数据映射落点；MCP 域全清；详见 fix-log 批次 16 |
