# Final RC / Production Candidate Closure（审计）

> 范围：在 Productization-P2.2 之后，对 P1/P2 已完成能力做最终生产候选收口。
> 结论：不再新增 `Phase 2.x`。Final RC readiness 只做只读聚合、文档收口和验证门禁；不会自行触发真实 LLM / MCP / Publisher 网络调用，不写 Workflow / Review / Agent / MCP 状态机。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Final RC / Production Candidate Closure |
| 是否继续 P2.x | 否 |
| 新增端点 | `GET /api/execution/ops/final-rc-readiness` |
| 端点性质 | 只读 readiness 聚合 |
| 外部调用 | 不执行 |
| 控制面写入 | 不执行 |
| DB 迁移 | 无 |

---

## 2. 聚合架构

```text
GET /api/execution/ops/final-rc-readiness
  -> ExecutionOpsService.getFinalRcProductionCandidateReadiness()
     -> production activation preflight
     -> Productization-P1 readiness
     -> MCP real runtime readiness
     -> Publisher real runtime readiness
     -> writeback executor registration readiness
     -> DB metadata checks
        - execution_results job+attempt unique ledger invariant
        - publish_records asset_version immutable trigger
  -> DTO mapper
  -> shared TypeBox response schema
```

该端点不调用 runtime adapter，不 tick worker，不处理 outbox，不创建 job，不更新 `publish_records`。

---

## 3. Final RC Gate

| Gate | 通过条件 |
|---|---|
| production activation | `production-activation-preflight.ready=true` |
| P1 readiness | `production-readiness-p1.ready=true` |
| Agent real runtime | production activation capability `agent_real_runtime=true` |
| MCP real runtime | `mcp-real-runtime-readiness.ready=true` |
| Publisher real runtime | `publisher-real-runtime-readiness.ready=true` |
| writeback executor | 默认关闭、未注册、不可执行、不可写控制面 |
| result ledger | `execution_results_job_attempt_uniq` 存在 |
| publish version pin | `trg_publish_records_asset_version_immutable` 存在 |
| safety | network allowlist 已配置、snapshot redaction 开启 |

Final RC 的 `candidate=true` 表示“生产候选安全门禁闭合”，不是表示完整商业产品功能都已完成。

---

## 4. 输出语义

默认环境：

```text
status=blocked
candidate=false
external_call_performed=false
```

显式 gate 全满足时：

```text
status=candidate
candidate=true
external_call_performed=false
```

`workflow_stage_writeback=false` 是有意设计：Final RC 要确认真实 writeback executor 仍 fail-closed。后续若要扩展 writeback，必须作为独立产品路线重新设计和验证。

---

## 5. 已完成能力

| 领域 | 状态 |
|---|---|
| Execution skeleton / worker / outbox / result ledger | 已完成 |
| Agent real LLM runtime gate | 已完成，默认关闭 |
| Workflow stage writeback relay | 已完成受控路径，executor 注册仍 fail-closed |
| Production activation controls | 已完成 |
| P1 quota / secret / monitoring / smoke readiness | 已完成 |
| MCP Streamable HTTP runtime | 已完成最小真实入口，默认关闭 |
| Publisher HTTP release runtime | 已完成最小真实入口，默认关闭 |
| Agent evaluation provider metadata cost attribution | 已完成只读校准 API |
| Agent evaluation real-runtime LLM judge API | 已完成显式写入口，走 execution job/result ledger、secret injection 与 provider quota gate |
| Agent evaluation billing-grade cost settlement | 已完成显式 rate card 结算 ledger API |
| Agent evaluation cross-model regression orchestration | 已完成多模型 execution jobs + model-tagged rule evaluations |
| Final RC readiness aggregate | 已完成 |

---

## 6. 非目标

- 不新增 `Phase 2.30+` 或其它 disabled harness。
- 不做真实 readiness 检查网络调用。
- 不接 MCP marketplace / SDK / SSE / stdio。
- 不做完整 Publisher UI、素材管理、撤回执行、多渠道运营编排。
- 不接真实云 Secret Manager / Vault / KMS。
- 不接 Grafana / PagerDuty / Alertmanager。
- 不做多租户 RBAC。
- 不做 RAG / 向量检索。
- 不做 Agent 多轮 memory / 高级评测编排。

---

## 7. 后续产品路线

Final RC 后，剩余工作应进入独立路线，不再塞进 P2.x：

| 路线 | 内容 |
|---|---|
| Publisher Platform | UI、渠道配置、素材管理、撤回/失败告警、多渠道编排 |
| MCP Marketplace | 安装、热加载、SDK transport、tool invocation ledger 回写 |
| Multi-tenant RBAC | 团队、成员、角色、项目级/资源级权限 |
| Knowledge / RAG | 知识库、向量检索、引用追踪 |
| Agent Evaluation | 生产级评测治理与 UI 编排 |
