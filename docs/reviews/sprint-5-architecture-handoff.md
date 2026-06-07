# Sprint-5 Architecture Handoff — 架构分析与演进规划

> 只读架构分析，无代码/DB/API 改动。基线：Sprint-4 Release Baseline（`95b0d62`，已冻结）。
> 本文回答一个核心问题：**Sprint-4 交付的系统，本质是什么？下一步应往哪演进？**

---

## 0. 系统本质（一句话定性）

**Content-Factory 当前是一个「Mock-first 控制平面（Control Plane）」**：
完整建模了内容生产的 *配置、状态流转、审计追溯、项目隔离*，但**不含真实执行层（Data Plane）**——Agent 不调用 LLM、MCP 不连接工具、产物不对外发布。所有「执行」都是 Mock 记录。

> 这不是缺陷，而是一个**结构清晰的演进起点**：执行边界被收敛为一条明确的「Mock 缝（seam）」，真实 Runtime 可在该缝处以适配器插入，而无需改动控制平面。

---

## 1. 当前系统能力边界

| 系统 | 已具备（能力上界） | 不具备（边界外） |
| --- | --- | --- |
| **Agent** | Profile 配置 + 状态机（active/disabled/archived）+ Session 记录（append-only）+ 健康检查 Mock | 真实 LLM 调用、tool calling、多轮会话、agent_messages |
| **MCP** | Server/Tool 配置 + registry + 风险/权限标注 + 调用日志（append-only）+ Mock invoke | 真实 transport（stdio/HTTP/SSE/WS）、工具分发、Marketplace、前端 UI |
| **Workflow/Review/Asset** | 工作流定义/运行、阶段状态机、审核闭环（approve/退回重执行 Option C）、资产版本（append-only）、版本对比 | 阶段产物的真实生成（由 Agent/工具产出）——目前产物靠人工/Mock 写入 |
| **Infra** | audit 哈希链、append-only 权限层、项目隔离（直接谓词 + JOIN）、RLS（仅 audit）、单事务一致性 | 异步执行、跨服务事务、多租户、细粒度授权 |

---

## 2. 架构本质分类

| 分类 | 归属组件 | 性质 |
| --- | --- | --- |
| **Configuration System**（配置型） | agent_profiles、mcp_servers、mcp_tools、workflow_definitions/stages | 声明式数据 + 结构校验 + 状态机 |
| **Workflow System**（状态流） | workflow_runs、stage_runs、review_records、content_assets.status | 真实领域状态机（ADR-006 集中化），**这是系统唯一“真功能”内核** |
| **Trace System**（审计链路） | audit_events（哈希链）、agent_sessions、tool_invocations | append-only，状态于插入时定稿，可追溯不可篡改 |
| **Simulation System**（Mock Runtime） | AgentRuntimeMockService、McpRuntimeMockService | 健康检查/调用均为本地判定 + 固定快照落库，**无外部副作用** |

> **明确结论**：Workflow 是真实状态机；Configuration/Trace 是真实持久化；**Execution（Agent/MCP/Publisher 的“做事”）完全是 Simulation**。当前系统 = 真实控制平面 + 模拟数据平面。

---

## 3. Sprint-4 技术债结构拆解

| 类别 | 具体 | 影响面 |
| --- | --- | --- |
| **Runtime gap** | AgentRuntimeMock / McpRuntimeMock 不执行任何真实动作 | Agent/MCP 仅“可配置可观测”，不可“可用” |
| **Execution gap** | tool_invocations / agent_sessions 为伪造终态记录（无分发、无真实结果） | trace 真实，但被 trace 的“执行”不存在 |
| **Product gap** | Publisher / publish_records / 公众号工作台 完全缺失（已移出 S4） | 内容生产闭环缺“产出/发布”末端 |
| **UI gap** | MCP 无前端；Agent 有 UI；Publisher N/A | MCP 仅 API 可达，运维需直连接口 |
| **Data gap** | publish_records 表缺失（版本锚定的发布记录，db §5.21） | 「已发布版本不漂移」无落点 |

依赖关系：Product gap ⊃ Data gap（Publisher 需 publish_records）；Execution gap 由 Runtime gap 派生；UI gap 独立、低耦合。

---

## 4. 当前架构结构图（控制平面 vs 缺失的数据平面）

```
┌─────────────────────────── CONTROL PLANE（已交付，真实） ───────────────────────────┐
│  Config: agent_profiles · mcp_servers/tools · workflow_definitions                   │
│  State : workflow_runs → stage_runs → review_records → content_assets/versions        │
│  Trace : audit_events(hash-chain) · agent_sessions · tool_invocations  (append-only)  │
│  Infra : project isolation · permission(cf_app/cf_audit_reader) · single-tx + audit   │
└───────────────────────────────────────┬──────────────────────────────────────────────┘
                                         │  ← Mock 缝（Service 直接写 trace 记录，无副作用）
┌────────────────────────────── DATA PLANE（缺失 / Mock） ──────────────────────────────┐
│  ✗ Agent real runtime (LLM, tool-calling)                                             │
│  ✗ MCP real transport (stdio/HTTP/SSE/WS) + tool dispatch                             │
│  ✗ Publisher (external platform publish)                                              │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Sprint-5 可选演进方向（分层）

### A. Execution Layer（**推荐主线**）
将「Mock 缝」实化为真实数据平面：
- **Agent real runtime**：LLM 调用 + tool-calling，agent_sessions 由一次性记录升级为真实会话（引入 agent_messages）。
- **MCP real execution**：stdio/HTTP/SSE/WS transport + 工具分发；tool_invocations 记录真实请求/响应。
- **真实 invocation pipeline**：调用→执行→结果落库，替换固定快照。
- 价值：让「可配置」变「可用」，是把控制平面变成可运行平台的关键一跃。

### B. Product Layer
补齐内容生产末端：
- **Publisher system**：publish_records（锚 asset_version_id）+ preview + 发布准备/审批流 + 公众号工作台 UI。
- **external integration layer**：对外平台适配（先 record，后真实发布）。
- 价值：闭合 Task→…→Publish 业务闭环（roadmap §7 原始目标）。

### C. Platform Layer
平台化能力：
- **multi-project / multi-tenant**：当前 S1 单项目 + 前端硬编码 projectId → 项目选择/租户隔离。
- **permission granularity**：cf_app/cf_audit_reader 二元 → 角色/成员/操作级。
- **audit/query enhancement**：审计查询、trace 可视化、检索。

**推荐次序**：A（执行层，解锁“可用”）→ B（产品层，闭合业务）→ C（平台层，规模化）。A 与 B 可在 Publisher 不依赖真实 Agent 执行时部分并行。

---

## 6. 系统重构建议（关键）

### 6.1 Mock-first 是否仍适用？
**部分适用——应升级为「Ports & Adapters（六边形）」**。
当前 Mock 服务是隐式的执行实现；建议显式定义 **Runtime 端口（interface）**，把 `AgentRuntimeMockService` / `McpRuntimeMockService` 降为 `MockAdapter`，真实实现为 `LlmAdapter` / `McpTransportAdapter`。控制平面只依赖端口，Mock/Real 可切换。这样 Mock-first 从「临时占位」变为「可保留的测试/降级适配器」。

### 6.2 是否需要 event-driven？
**非首要**。当前同事务 + 同事务审计的强一致模型对*控制平面*正确且简洁。但**真实执行是长耗时 + 易失败**，不能塞进请求事务。建议：
- 引入 **job queue / async execution**（**推荐，刚需**）：执行请求入队 → worker 执行 → 完成后**追加**写 tool_invocations/agent_sessions（append-only 表天然契合「终态一次性写入」）。
- **outbox 模式**衔接「控制平面状态变更」与「执行触发」，避免双写不一致。
- event-driven（事件总线）可作为 job queue 的演进，但 Sprint-5 不必先行。

### 6.3 是否需要 runtime isolation？
**是，且为安全前置**。真实 MCP（外部进程/网络）+ LLM 跨信任边界，需：
- **runtime isolation layer**：超时、资源限额、凭证按 `sensitivity_level` 作用域化（`context_packs.sensitivity_level` 已建模传播控制，ContextBuilder 是强制点）。
- MCP `risk_level` 已建模 → 可驱动隔离策略（high 风险工具强制沙箱/人工确认）。

### 6.4 架构演进定位
```
当前： Control Plane（真实） + Data Plane（Mock，同步）
目标： Control Plane（不变） ─Runtime Port─► { MockAdapter | RealAdapter }
                                              └► Job Queue ─► Worker ─► append-only 结果
```
控制平面、状态机、审计、隔离、append-only 边界**全部可复用**；Sprint-5 增量集中在「端口 + 适配器 + 异步执行 + 隔离」，不回改 Sprint-4 内核。

---

## 7. 验证基线（仅引用，未修改）
- Sprint-4 baseline：已冻结（`95b0d62`）✔ ｜ Agent + MCP + Workflow + Audit 运行 ✔
- Publisher：N/A（已剥离）✔ ｜ MCP UI：不存在（仅 backend）✔ ｜ domain coverage：99.02/97.66 ✔

## 8. 裁决
**GO（分析阶段）** —— 系统本质明确为「Mock-first 控制平面」；Sprint-5 推荐以 **Execution Layer（A）** 为主线，经 Ports&Adapters + Job Queue + Runtime Isolation 将 Mock 缝实化为真实数据平面，Sprint-4 控制平面内核全部复用、不回改。本文为架构 handoff，不含任何实现。
