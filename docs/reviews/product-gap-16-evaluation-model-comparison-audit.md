# Product Gap 16 — Evaluation Model Comparison Backend MVP（审计）

> 范围：在 execution result evaluation 账本、rule evaluator、analytics 和 regression runner 之上，补齐只读模型对比工作流。
> 一句话目标：**基于已有 evaluation tags 中的 `model:<id>` 维度，按模型聚合质量 / 成本 / 延迟均值和 composite score；当前不调用 LLM、不触发评估、不修改 execution 账本。**

---

## 1. 落地范围

新增 API：

- `GET /api/execution/evaluations/model-comparison`

新增查询参数：

- `model_prefix`：可选；只返回 model id 以该前缀开头的分组。
- `limit`：可选；限制返回模型分组数量，默认 20。

新增响应字段：

- `mode = evaluation_model_comparison`
- `model_tag_prefix = model:`
- `compared_model_count`
- `unclassified_evaluation_count`
- `llm_calls_performed = false`
- `writes_performed = false`
- `items[]`：
  - `model`
  - `evaluation_count`
  - `result_count`
  - `job_count`
  - `average_quality_score`
  - `average_cost_score`
  - `average_latency_score`
  - `composite_score`
  - `latest_evaluated_at`

扩展模块：

- `packages/shared/src/schemas.ts`
- `application/execution-result-evaluation.service.ts`
- `domain/execution/evaluation.ts`
- `interfaces/http/routes/execution.ts`
- `application/mappers.ts`
- `application/execution-ops.service.ts`

无新增 DB 迁移：复用 `execution_result_evaluations.tags`。

---

## 2. 规则语义

- 模型维度来自 evaluation tags 中第一个 `model:<id>` tag。
- 未包含 `model:` tag 的 evaluation 计入 `unclassified_evaluation_count`；当传入 `model_prefix` 时，仅比较匹配 prefix 的模型，未分类项不进入该过滤结果。
- 每个模型分组计算：
  - evaluation 数量
  - distinct result 数量
  - distinct job 数量
  - quality / cost / latency 平均值
  - per-evaluation `(quality + cost + latency) / 3` 的平均 composite score
  - 最新 evaluation 时间
- 返回按 `composite_score` 降序、`average_quality_score` 降序、`model` 升序排序。

---

## 3. 边界

- 不调用 LLM judge。
- 不触发 rule evaluation 或 regression runner。
- 不修改 `execution_jobs`、`execution_results`、`execution_result_evaluations`。
- 不计算真实 provider 成本，只使用 evaluation 已有的 `cost_score`。
- 不创建模型基准任务、不调度跨模型回归评测。
- 不做 Web UI。

---

## 4. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-16-evaluation-model-comparison-api.test.ts`

覆盖场景：

- 基于 `model:<id>` tag 聚合两个模型的 evaluation 分数。
- `model_prefix` 过滤可隔离目标模型组。
- 按 composite score 降序返回模型分组。
- 端点只读，不改变 execution job 状态。

TDD 记录：

- RED：新增 Product Gap 16 集成测试，`GET /api/execution/evaluations/model-comparison` 返回 404。
- GREEN：补 shared schema、domain 聚合、service、mapper 和 route 后，Product Gap 16 测试通过。

---

## 5. 后续路线

| 后续项 | 说明 |
| --- | --- |
| LLM judge | 接入真实 judge provider、prompt/version、审计和预算 gate |
| Billing-grade cost attribution | 在 provider metadata 校准基础上接入真实 rate card / billing source、误差审计和成本窗口 |
| Cross-model regression orchestration | 为同一任务族跨模型调度、评估和对比 |
| UI visibility | 在 evaluation dashboard 展示模型对比表和趋势 |
