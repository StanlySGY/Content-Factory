# Product Gap 1 — MCP Marketplace Backend MVP（审计）

> 范围：补齐 MCP Marketplace 的后端最小产品能力。
> 结论：本阶段只实现本地 catalog + 项目级安装控制面，不做 UI、不做外部 marketplace 网络调用、不执行 MCP tool。

---

## 1. 阶段定位

| 项 | 结论 |
| --- | --- |
| 路线名 | Product Gap 1：MCP Marketplace Backend MVP |
| 是否继续 P2.x | 否 |
| 前端 UI | 不做 |
| 外部 marketplace 调用 | 不做 |
| MCP tool invocation | 不做 |
| Sprint-4 Agent/MCP 状态机 | 不改 |

---

## 2. 架构图

```text
HTTP API
  /api/mcp/marketplace/*
    -> McpMarketplaceService
       -> domain/mcp/marketplace.ts
          - manifest validation
          - installation status transition
       -> mcp-marketplace.repository.ts
          - mcp_marketplace_entries
          - mcp_marketplace_installations
          - mcp_servers / mcp_tools
```

安装路径只写 MCP 配置表，不进入 execution worker，也不写 `tool_invocations`。

---

## 3. 新增数据模型

| 表 | 用途 |
| --- | --- |
| `mcp_marketplace_entries` | 本地 marketplace catalog entry，保存可信 manifest |
| `mcp_marketplace_installations` | 项目级安装历史，状态可流转，不删除 |

关键约束：

- `mcp_marketplace_entries.slug` 唯一。
- `mcp_marketplace_installations.status` 仅允许 `installed | disabled | uninstalled`。
- 同一 `project_id + entry_id` 同时最多一个 active install：`installed/disabled`。
- `uninstalled` 保留历史，并允许重新安装生成新 installation。

---

## 4. Manifest 校验

最小字段：

```json
{
  "server_ref": "mcp://docs-search",
  "display_name": "Docs Search",
  "endpoint": "https://mcp.example.test/rpc",
  "tools": [{ "name": "search_docs" }]
}
```

规则：

| 字段 | 规则 |
| --- | --- |
| `server_ref` | 必须非空，且以 `mcp://` 开头 |
| `display_name` | 必须非空 |
| `endpoint` | 必须是 HTTP/HTTPS URL |
| `tools` | 必须非空 |
| `tools[].name` | 必须非空，且同一 entry 内唯一 |

---

## 5. API

| 方法 | 端点 | 说明 |
| --- | --- | --- |
| `POST` | `/api/mcp/marketplace/entries` | 创建本地 entry |
| `GET` | `/api/mcp/marketplace/entries` | 列出本地 entries |
| `POST` | `/api/mcp/marketplace/entries/:id/install` | 安装 entry 到当前项目 |
| `GET` | `/api/mcp/marketplace/installations?project_id=` | 列出当前项目安装历史 |
| `POST` | `/api/mcp/marketplace/installations/:id/disable` | `installed -> disabled` |
| `POST` | `/api/mcp/marketplace/installations/:id/uninstall` | `installed/disabled -> uninstalled` |

错误语义：

| 场景 | 状态码 |
| --- | --- |
| manifest 不合法 | 400 |
| entry 不存在 | 404 |
| slug 重复 | 409 |
| 同项目重复 active install | 409 |
| 非法安装状态流转 | 409 |

---

## 6. 安装行为

`install` 同事务完成：

1. 读取并校验 entry manifest。
2. 检查当前项目是否已有 `installed/disabled` installation。
3. 按 manifest endpoint 复用或创建 `mcp_servers`。
4. 按 manifest tools 创建缺失的 `mcp_tools`。
5. 创建 `mcp_marketplace_installations(status=installed)`。

边界：

- 不发网络请求探测 endpoint。
- 不写 `tool_invocations`。
- 不启动 execution worker。
- 不自动授权 workflow / agent 使用这些 tools。

---

## 7. Control Plane 边界

| 模块 | 是否改动 |
| --- | --- |
| Agent 状态机 | 否 |
| MCP Server 状态机 | 否 |
| Workflow 状态机 | 否 |
| Review 状态机 | 否 |
| Execution worker | 否 |
| Audit hash chain | 否 |

Marketplace 是 MCP 配置入口，不是执行入口。

---

## 8. 测试覆盖

新增集成测试：

```text
apps/api/test/integration/product-gap-1-mcp-marketplace-api.test.ts
```

覆盖：

- invalid manifest rejected。
- slug unique。
- install creates server + tools。
- duplicate active install returns 409。
- disable / uninstall transitions。
- `tool_invocations` 无副作用。
- DB 持久化 entry / installation。

---

## 9. 非目标

- 不做 MCP Marketplace UI。
- 不接外部 marketplace 网络发现。
- 不接 MCP SDK。
- 不做 SSE / stdio transport。
- 不做热加载。
- 不执行 tool invocation。
- 不写 execution job / result / outbox。
- 不改 Workflow / Review / Agent / MCP 状态机。

---

## 10. 后续路线

| 路线 | 内容 |
| --- | --- |
| Marketplace UI | 展示 entries、安装/禁用/卸载交互 |
| Permission Policy | 安装后配置项目/阶段/Agent 可用工具范围 |
| Runtime Linkage | 与 MCP real runtime 的 endpoint registry / allowlist 对接 |
| Invocation Ledger | 真实调用后回写 `tool_invocations` 或独立 runtime ledger |
| External Marketplace | 安全发现、签名校验、版本升级、撤销机制 |
