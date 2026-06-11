# Product Gap 19 — Evaluation Cost Settlement Backend MVP（审计）

> 范围：在 execution result evaluation 与 provider runtime metadata 之上，补齐显式费率卡成本结算账本。
> 一句话目标：**为已评价 execution results 使用显式 rate card 和已持久化 token usage 追加幂等成本结算记录。**

---

## 1. 落地范围

新增 API：

- `POST /api/execution/evaluations/cost-settlement-run`

新增数据表：

- `execution_cost_settlements`

新增请求字段：

- `job_id`：必填；仅结算该 job 下已有 evaluation 的 results。
- `rate_card.version`：必填；作为幂等维度之一。
- `rate_card.currency`：必填。
- `rate_card.prompt_micro_cents_per_token`：必填非负整数。
- `rate_card.completion_micro_cents_per_token`：必填非负整数。

新增响应字段：

- `mode = evaluation_cost_settlement`
- `settlement_count`
- `skipped_count`
- `total_amount_micro_cents`
- `total_amount_cents`
- `llm_calls_performed = false`
- `writes_performed`
- `skipped_result_ids`
- `settlements`

扩展模块：

- `packages/shared/src/schemas.ts`
- `db/migrations/0034_execution_cost_settlements.js`
- `application/execution-result-evaluation.service.ts`
- `domain/execution/evaluation.ts`
- `infrastructure/repositories/execution-cost-settlement.repository.ts`
- `interfaces/http/routes/execution.ts`
- `application/mappers.ts`
- `application/execution-ops.service.ts`

---

## 2. 规则语义

- 结算粒度是已评价的 `execution_result`，同一 result 即使存在多种 evaluator type 也只结算一次。
- 金额公式：`prompt_tokens * prompt_rate + completion_tokens * completion_rate`，单位为 micro-cents。
- `amount_cents` 从 micro-cents 向上取整。
- 同一 `(execution_result_id, rate_card_version)` 只能写入一条结算记录，重复运行返回 skipped。
- 结算只读取 `execution_results.response_snapshot.metadata.providerKind`、`providerResponseContract.model` 和 `tokenUsage`。
- 原始 `execution_jobs`、`execution_results`、`execution_result_evaluations` 不被修改。

---

## 3. 边界

- 不调用 provider 或 LLM。
- 不从 provider 拉取真实账单。
- 不推断模型价格；调用方必须传显式 rate card。
- 不覆盖或更新既有结算记录。
- 不替代跨模型回归评测编排。
- Web `/evaluations` 仍不触发结算写接口。

---

## 4. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-19-evaluation-cost-settlement-api.test.ts`

覆盖场景：

- real agent runtime 写入带 token usage 的 result ledger。
- 人工 evaluation 建立后，cost settlement API 生成一条成本结算记录。
- micro-cents 和 cents 金额按显式 rate card 计算。
- 第二次同请求幂等跳过，且不追加重复结算。
- 结算过程不触发额外 provider fetch。
- 原始 execution job 响应在结算前后保持不变。

TDD 记录：

- RED：新增 Product Gap 19 集成测试，`POST /api/execution/evaluations/cost-settlement-run` 返回 404。
- GREEN：新增 append-only settlement ledger、schema、repository、service、route 和 mapper 后，Product Gap 19 测试通过。

已执行验证：

- `pnpm --filter @cf/api exec vitest run test/integration/product-gap-19-evaluation-cost-settlement-api.test.ts`

---

## 5. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Cross-model regression orchestration | 为同一任务族跨模型调度、评估、结算和对比 |
| Provider billing reconciliation | 对接真实 provider invoice / usage export，对账而不是仅按显式 rate card 结算 |
| Rate card registry | 将 rate card 版本、审批、有效期和币种策略产品化 |
| UI settlement review | 若未来在 Web 展示/触发结算，需要单独设计权限、确认、预算和审计 UX |
