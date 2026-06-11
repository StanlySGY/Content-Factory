# Product Gap 17 — Evaluation Cost Attribution Backend MVP（审计）

> 范围：在 execution result evaluation 账本、real agent runtime provider metadata 和 quota/cost estimate 之上，补齐只读成本归因校准 API。
> 一句话目标：**基于已持久化的 `execution_results.response_snapshot.metadata`，为 evaluation 返回 provider runtime cost estimate、token usage 与 quota decision；当前不调用 LLM、不触发 provider 请求、不写 execution 账本。**

---

## 1. 落地范围

新增 API：

- `GET /api/execution/evaluations/cost-attribution`

新增查询参数：

- `job_id`：可选；只返回指定 execution job 下 evaluation 的归因结果。
- `limit`：可选；限制返回 evaluation 数量，默认 100。

新增响应字段：

- `mode = evaluation_cost_attribution`
- `job_id`
- `evaluation_count`
- `attributed_evaluation_count`
- `unattributed_evaluation_count`
- `total_estimated_cost_cents`
- `cost_source_counts`
- `token_usage_totals`
- `llm_calls_performed = false`
- `writes_performed = false`
- `items[]`：
  - `evaluation_id`
  - `execution_result_id`
  - `execution_job_id`
  - `evaluator_type`
  - `cost_score`
  - `attribution_status`
  - `cost_estimate`
  - `token_usage`
  - `quota_decision`

扩展模块：

- `packages/shared/src/schemas.ts`
- `application/execution-result-evaluation.service.ts`
- `domain/execution/evaluation.ts`
- `infrastructure/repositories/execution-result-evaluation.repository.ts`
- `interfaces/http/routes/execution.ts`
- `application/mappers.ts`
- `application/execution-ops.service.ts`

无新增 DB 迁移：复用 `execution_result_evaluations` 与 `execution_results.response_snapshot`。

---

## 2. 规则语义

- 归因来源是 `execution_results.response_snapshot.metadata.costEstimate`。
- 当前可归因成本来自 provider quota/cost gate 写入的 `configured_estimate`，单位为 cents，currency 为 `USD`。
- token 统计来自 `metadata.tokenUsage.promptTokens/completionTokens/totalTokens`。
- quota 账本快照来自 `metadata.quotaDecision.status/distributed/usedRequests/usedCostCents`。
- 缺少合法 `costEstimate.amountCents` 的 evaluation 标记为 `unattributed`，不计入总成本。
- `total_estimated_cost_cents` 是当前返回 evaluation 逐条归因成本之和。

---

## 3. 边界

- 不调用 LLM judge。
- 不执行 provider/runtime 请求。
- 不触发 rule evaluation 或 regression runner。
- 不修改 `execution_jobs`、`execution_results`、`execution_result_evaluations`。
- 不重新计算真实账单，不读取外部 billing API。
- 不替代 billing-grade 成本结算、跨模型回归评测编排或 dashboard 展示。

---

## 4. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-17-evaluation-cost-attribution-api.test.ts`

覆盖场景：

- real-enabled local injected agent run 写入 provider metadata。
- 人工 evaluation 关联同一 execution result。
- cost attribution API 从 `costEstimate`、`tokenUsage`、`quotaDecision` 返回只读归因结果。
- `llm_calls_performed=false`、`writes_performed=false`。
- 调用端点前后 execution job 响应保持不变。

TDD 记录：

- RED：新增 Product Gap 17 集成测试，`GET /api/execution/evaluations/cost-attribution` 返回 404。
- GREEN：补 shared schema、joined read repository、domain 聚合、service、mapper 和 route 后，Product Gap 17 测试通过。

---

## 5. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Billing-grade cost attribution | 接入 provider billing/rate card、模型维度价格、币种/时间窗口与误差审计 |
| LLM judge | 接入真实 judge provider、prompt/version、审计和预算 gate |
| Cross-model regression orchestration | 为同一任务族跨模型调度、评估和对比 |
| UI visibility | 在 evaluation dashboard 展示成本归因与 token/cost 趋势 |
