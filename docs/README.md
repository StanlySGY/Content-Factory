# Content Factory 文档中心

Content Factory 是面向 Claude Code、Codex、Gemini、OpenCode 等 Agent 的 AI 内容工厂。本文档中心用于沉淀产品、架构、Agent、MCP、Skill、工作流、接口、开发与部署设计，避免关键设计仅保存在聊天上下文中。

## 文档原则

- 所有设计结论必须落地到 `docs` 目录。
- 新阶段完成后必须产出或更新 Markdown 文档。
- 后续开发前必须优先读取相关文档。
- 文档保持精简、可执行、可维护。

## 目录结构

```text
docs/
├── 00-project/       # 项目总览、目标、范围、路线图、决策记录
├── 01-product/       # 产品定位、用户场景、需求、验收标准
├── 02-architecture/  # 系统架构、模块边界、数据流、关键技术决策
├── 03-database/      # 数据模型、存储策略、迁移方案、索引设计
├── 04-agent/         # Agent 角色、职责、协作协议、能力边界
├── 05-mcp/           # MCP Server 规划、工具协议、集成规范
├── 06-skill/         # Skill 体系、命令路由、质量门禁、扩展规范
├── 07-workflow/      # 内容生产工作流、编排流程、状态流转
├── 08-ui/            # 信息架构、页面结构、交互设计、设计系统
├── 09-api/           # API 设计、接口契约、错误码、鉴权策略
├── 10-development/   # 本地开发、代码规范、测试策略、贡献流程
└── 11-deployment/    # 部署架构、环境配置、发布流程、运维策略
```

## 导航

| 目录 | 职责 | 典型文档 |
| --- | --- | --- |
| [00-project](./00-project/) | 定义项目背景、目标、边界、里程碑与跨阶段决策。 | `vision.md`, `roadmap.md`, `decision-log.md` |
| [01-product](./01-product/) | 管理产品需求、用户画像、场景、功能清单与验收标准。 | `requirements.md`, `user-stories.md`, `acceptance.md` |
| [02-architecture](./02-architecture/) | 沉淀整体架构、模块分层、依赖关系、数据流与架构决策。 | `system-overview.md`, `module-boundaries.md`, `adr-*.md` |
| [03-database](./03-database/) | 记录数据实体、存储选型、Schema、迁移与查询优化方案。 | `data-model.md`, `schema.md`, `migration.md` |
| [04-agent](./04-agent/) | 定义 Claude Code、Codex、Gemini、OpenCode 等 Agent 的角色、职责与协作协议。 | `agent-roles.md`, `collaboration-protocol.md` |
| [05-mcp](./05-mcp/) | 规划 MCP Server、工具能力、权限边界、上下文检索与外部集成。 | `mcp-inventory.md`, `tool-contracts.md` |
| [06-skill](./06-skill/) | 管理 Skill 命令体系、自动路由、质量门禁与扩展规范。 | `skill-registry.md`, `quality-gates.md` |
| [07-workflow](./07-workflow/) | 描述内容工厂从需求、规划、生成、审查到发布的工作流。 | `content-pipeline.md`, `orchestration.md` |
| [08-ui](./08-ui/) | 记录前端页面、组件、交互流程、设计系统与可用性要求。 | `information-architecture.md`, `design-system.md` |
| [09-api](./09-api/) | 定义服务接口、请求响应契约、错误处理、鉴权与版本策略。 | `api-overview.md`, `openapi.md`, `error-codes.md` |
| [10-development](./10-development/) | 统一开发环境、编码规范、测试策略、分支与交付流程。 | `setup.md`, `coding-standards.md`, `testing.md` |
| [11-deployment](./11-deployment/) | 记录运行环境、部署拓扑、配置管理、发布和回滚策略。 | `deployment-guide.md`, `operations.md` |

## 使用流程

1. 开始需求或开发前，先阅读 `docs/README.md` 与相关目录文档。
2. 形成设计结论时，更新对应目录 Markdown 文件。
3. 变更跨目录影响时，同步更新导航与相关引用。
4. 完成阶段交付前，检查文档是否覆盖目标、约束、决策与后续行动。

## 当前状态

项目已推进到 **Sprint-10 / Final RC production candidate** 收口阶段。Sprint 1-4 MVP、Sprint 5 execution foundation、Productization P0/P1/P2 的默认关闭真实 runtime 入口均已落地；后续不再追加 `Phase 2.x`，剩余工作进入独立产品路线。

当前权威入口：

- 阶段与路线：[`10-development/development-roadmap.md`](./10-development/development-roadmap.md)
- 运维与生产门禁：[`10-development/execution-ops-runbook.md`](./10-development/execution-ops-runbook.md)
- 部署与启用指南：[`11-deployment/deployment-guide.md`](./11-deployment/deployment-guide.md)
- 下一步执行清单：[`10-development/production-candidate-next-actions.md`](./10-development/production-candidate-next-actions.md)
- Review 清单：[`reviews/review-backlog.md`](./reviews/review-backlog.md)

关键边界：

- 默认不执行真实 LLM / MCP / Publisher 外部调用。
- 默认不启用真实控制面 writeback executor。
- `final-rc-readiness` 是只读生产候选门禁，不代表完整商业产品功能已完成。
- 真实上线前必须先完成 secret store、监控告警、staging smoke、环境 gate 与回滚预案。
