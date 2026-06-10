# Production Candidate Next Actions

> 状态：Final RC 后执行清单。本文用于把后续工作从 `Phase 2.x` 中拆出，按独立产品路线推进。

## 1. 当前阶段

Content Factory 当前处于 **Final RC / production candidate** 收口阶段：

- Sprint 1-4 MVP 主链路已完成。
- Sprint 5 execution foundation 已完成。
- Agent real LLM、MCP real runtime、Publisher real runtime、workflow stage writeback 均已有默认关闭的显式 gate 路径。
- `GET /api/execution/ops/final-rc-readiness` 用于只读聚合生产候选门禁。
- 后续不再新增 `Phase 2.x`。

生产候选的含义是“安全门禁与默认关闭边界已闭合”，不是“真实生产环境已启用”。

## 2. P0：生产启用前置项

| 优先级 | 任务 | 完成条件 |
| --- | --- | --- |
| P0 | 选择真实启用路线 | 明确本次只启用 Agent / MCP / Publisher / writeback 中的哪些路径，不混开 |
| P0 | Secret Store | 接入真实 Secret Manager / Vault / KMS，替换本地 contract adapter |
| P0 | 生产 allowlist | 配置外部 endpoint allowlist，并确认所有真实调用在 allowlist 内 |
| P0 | Quota / cost | 确认 DB-backed provider quota/cost ledger 在目标部署拓扑下可用 |
| P0 | Monitoring / alerting | 接入 Grafana / PagerDuty / Alertmanager 或等效告警系统 |
| P0 | Staging smoke | 使用低权限真实 key、低额度限制跑通 staging smoke，并保留 execution_results 证据 |
| P0 | Rollback | 写明 env 级回滚步骤，至少覆盖 runtime、network、writeback executor 三类开关 |
| P0 | Final RC gate | 目标环境 `final-rc-readiness` 达到候选条件，且无真实外部调用副作用 |

## 3. P1：产品化主路线

| 路线 | 范围 | 验收重点 |
| --- | --- | --- |
| Publisher Platform | 发布 UI、渠道配置、素材管理、撤回/重发、失败告警、多渠道编排 | 不产生半发布状态；发布记录锚定 asset_version |
| Multi-tenant RBAC | auth/session、全局 API enforcement、成员/角色 UI、RBAC audit hardening | 跨项目访问被拒，权限变更可审计 |
| Production Ops | 监控面板、告警规则、runbook 演练、部署开关审计 | 故障可定位、可回滚、可复盘 |
| Agent Production | 真实 provider staging、错误映射、成本校准、限额策略 | 真实调用可追溯，不泄露 secret material |

当前已补齐的 P1 可视化入口：

| 任务 | 状态 | 边界 |
| --- | --- | --- |
| Final RC 门禁 UI | 已完成 | Web 新增 `/ops/readiness`，只读展示 `final-rc-readiness` 聚合结果；不启用真实 runtime，不替代 staging smoke |
| Readiness drilldown | 已完成 | `/ops/readiness` 下钻展示 production activation、P1 readiness、MCP runtime、Publisher runtime、writeback executor registration 的只读端点结果、缺失要求和下一阶段要求 |

下一步建议：

| 优先级 | 任务 | 完成条件 |
| --- | --- | --- |
| P1 | Production Ops 监控页 | Web 新增只读 monitoring / staging smoke 面板，展示 `monitoring-readiness`、alert rules、`staging-smoke-readiness` 与 smoke run endpoint；不接真实 Grafana / PagerDuty，不触发 smoke run |

## 4. P2：扩展路线

| 路线 | 范围 | 当前缺口 |
| --- | --- | --- |
| MCP Marketplace | 外部发现、SDK transport、SSE/stdio、热加载、tool invocation ledger 回写、UI | 当前只有 backend MVP |
| Knowledge / RAG | embedding、向量库、LLM rerank、引用追踪 UI、context pack 自动刷新 | 当前只有关键词与后端管理 API |
| Agent Evaluation | LLM judge、真实成本归因、模型对比、回归评测、dashboard | 当前只有人工/规则评价与 analytics API |
| Skill / Plugin | Skill 路由、质量门禁自动化、插件隔离、供应链验证、UI | 当前不是 MVP 验收项 |

## 5. 仓库收口项

| 项 | 状态 | 处理方式 |
| --- | --- | --- |
| 根 `package.json` 描述 | 已更新 | 描述改为 Final RC production candidate |
| 文档中心当前状态 | 已更新 | 指向 roadmap、runbook、本文和 review backlog |
| Final RC 后路线决策 | 已更新 | ADR-023 固化“不再追加 Phase 2.x” |
| API 契约漂移 | 已更新 | `api-overview.md` 区分后端已补齐 MVP API 与仍未完成的产品化/UI/真实启用 |
| 部署指南 | 已新增 | `11-deployment/deployment-guide.md` 记录最小拓扑、runtime gate、发布验证与回滚边界 |
| 前端导航占位 | 已更新 | 移除已存在 Agent 管理入口的重复后续占位，保留真实未接入产品路线 |
| Sprint-2 审查文档 | 已识别，待提交 | 7 份历史审查/计划文档属于审计证据，应随本次收口提交一并纳入版本控制 |

## 6. 禁止事项

- 不在默认配置下开启真实外部 LLM / MCP / Publisher 调用。
- 不在没有 secret store 与告警回滚的情况下启用真实 runtime。
- 不把 writeback executor 扩展到 asset / review / publisher target，除非作为独立路线重新设计。
- 不用手工 DB 修改绕过 audit hash chain、execution_results append-only 或 outbox ledger。
- 不把新产品路线塞回 `Phase 2.x`。
