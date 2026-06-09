# Product Gap 7 — Evaluation Analytics Backend MVP（审计）

> 范围：在 Product Gap 5/6 的 `execution_result_evaluations` 账本之上，新增只读分析 API。
> 一句话目标：**让系统可以查看 execution evaluation 的总体评分、低分项和 evaluator 分布，为后续 dashboard / LLM judge / 成本归因提供后端数据基础；当前不做 UI、不调用 LLM、不修改执行账本。**

---

## 1. 落地范围

新增能力：

- execution evaluation 总体 analytics
- low-quality evaluation 列表
- threshold / limit 查询参数

复用既有表：

- `execution_result_evaluations`

扩展模块：

- `domain/execution/evaluation.ts`
- `application/execution-result-evaluation.service.ts`
- `infrastructure/repositories/execution-result-evaluation.repository.ts`
- `interfaces/http/routes/execution.ts`
- `application/mappers.ts`
- `packages/shared/src/schemas.ts`

无新增 DB 迁移。

---

## 2. 架构图

```text
GET /api/execution/evaluations/analytics
  -> ExecutionResultEvaluationService.analytics()
    -> listAllEvaluations()
    -> summarizeEvaluationAnalytics()
    -> DTO

GET /api/execution/evaluations/low-quality?threshold=&limit=
  -> ExecutionResultEvaluationService.listLowQuality()
    -> listAllEvaluations()
    -> listLowQualityEvaluations()
    -> DTO
```

只读边界：

- 不写 `execution_result_evaluations`
- 不改 `execution_results`
- 不改 `execution_jobs`
- 不写 `outbox_events`
- 不读取或修改 Workflow / Review / Agent / MCP / Publisher 状态机

---

## 3. API

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/execution/evaluations/analytics` | 返回全局 evaluation 计数、平均分、低分数量、evaluator 分布 |
| `GET` | `/api/execution/evaluations/low-quality?threshold=60&limit=20` | 返回最低评分小于等于 threshold 的评价项 |

Analytics response：

```json
{
  "evaluation_count": 12,
  "result_count": 8,
  "job_count": 6,
  "average_quality_score": 82.5,
  "average_cost_score": 91.2,
  "average_latency_score": 76.8,
  "low_quality_count": 2,
  "evaluator_type_counts": { "human": 4, "rule": 8 },
  "latest_evaluated_at": "2026-06-09T12:00:00.000Z"
}
```

Low-quality response：

```json
{
  "threshold": 60,
  "limit": 20,
  "items": [
    {
      "evaluation_id": "uuid",
      "execution_result_id": "uuid",
      "execution_job_id": "uuid",
      "evaluator_type": "human",
      "quality_score": 35,
      "cost_score": 80,
      "latency_score": 90,
      "lowest_score": 35,
      "notes": "manual note",
      "tags": ["analytics"],
      "created_at": "2026-06-09T12:00:00.000Z"
    }
  ]
}
```

---

## 4. 规则语义

Analytics：

- `evaluation_count`：评价记录数量
- `result_count`：被评价过的 distinct execution result 数量
- `job_count`：被评价过的 distinct execution job 数量
- `average_*_score`：对应评分平均值，保留两位小数
- `low_quality_count`：`min(quality_score, cost_score, latency_score) <= 60` 的评价数量
- `evaluator_type_counts`：按 `human` / `rule` 等 evaluator type 分组计数
- `latest_evaluated_at`：最新评价创建时间

Low-quality：

- 默认 `threshold=60`
- 默认 `limit=20`
- 最大 `limit=100`
- 按 `lowest_score` 升序排序
- 最低分相同按 `created_at` 倒序排序

---

## 5. 边界

- 不新增 evaluator 类型。
- 不做自动评测。
- 不做 LLM judge。
- 不做 provider token / cost 归因。
- 不做 dashboard / UI。
- 不做跨项目权限 enforcement。
- 不 join 控制面业务表。
- 不替代 audit hash chain。

---

## 6. 非目标

- 不实现评分策略管理后台。
- 不实现趋势图或报表导出。
- 不实现 agent/profile 维度聚合。
- 不实现 workflow/stage 维度聚合。
- 不实现评价样本集回放。
- 不实现在线告警。

---

## 7. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Dashboard backend | 增加时间窗口、agent/profile、subject 维度聚合 |
| LLM judge | 在 runtime safety、预算和审计 gate 完成后接入 |
| Cost attribution | 结合 provider token/cost ledger 生成真实成本评分 |
| Evaluation dataset | 固定样本集回放和版本化回归 |
| UI | 在运营 dashboard 中展示质量趋势和低分队列 |
| RBAC integration | 接入真实 actor/session 权限与项目隔离 |

---

## 8. 验证

新增测试：

- `apps/api/test/integration/product-gap-7-evaluation-analytics-api.test.ts`
- 扩展 `apps/api/test/unit/execution-evaluation.test.ts`

覆盖：

- analytics API 返回评价计数、result/job distinct 计数、平均分、低分数量、evaluator 分布
- low-quality API 支持 threshold / limit，并不修改 job/result
- domain 空集合汇总
- domain 多 job/result 汇总
- low-quality 最低分排序与同分最新优先
