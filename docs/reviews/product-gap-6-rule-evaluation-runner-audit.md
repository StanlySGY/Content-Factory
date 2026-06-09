# Product Gap 6 — Rule Evaluation Runner Backend MVP（审计）

> 范围：在 Product Gap 5 的 `execution_result_evaluations` 账本之上，新增确定性 rule evaluator runner。
> 一句话目标：**让系统可以手动触发规则评估，把 execution result 的状态、错误、耗时转换为 `rule` 评价记录；当前不调用 LLM、不自动后台评测、不做 UI。**

---

## 1. 落地范围

新增能力：

- 单 result 规则评估
- 单 job 批量规则评估
- 已存在 `rule` 评价时跳过或冲突

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
POST /api/execution/results/:id/evaluate-rule
  -> ExecutionResultEvaluationService.evaluateResultWithRules
    -> read execution_results(id)
    -> buildRuleEvaluation(status/runtimeStatus/errorType/retryable/durationMs)
    -> insert execution_result_evaluations(evaluator_type='rule')

POST /api/execution/jobs/:id/evaluate-rule
  -> list execution_results by job
  -> skip result with existing rule evaluation
  -> create rule evaluations for remaining results
```

不接入：

- LLM judge
- background scheduler
- queue / worker
- external provider
- control-plane writeback

---

## 3. API

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/execution/results/:id/evaluate-rule` | 为单个 execution result 创建 `rule` 评价 |
| `POST` | `/api/execution/jobs/:id/evaluate-rule` | 为 job 下尚无 `rule` 评价的 results 批量创建评价 |

Batch response：

```json
{
  "job_id": "uuid",
  "created_count": 1,
  "skipped_count": 0,
  "evaluations": [],
  "skipped_result_ids": []
}
```

错误语义：

- unknown result：`404`
- 单 result 重复 rule evaluation：`409`
- job 批处理对已评价 result：跳过并返回 `skipped_result_ids`

---

## 4. 规则语义

当前规则只依赖 `execution_results` 的只读字段：

- `status`
- `runtime_status`
- `error_type`
- `retryable`
- `duration_ms`

评分：

| 信号 | quality_score |
| --- | --- |
| `status=success` 且 `runtime_status=success` | 100 |
| `status=failed` 且 `retryable=true` | 55 |
| 其他 failed | 40 |

| 信号 | cost_score |
| --- | --- |
| `error_type=rate_limited` | 30 |
| 其他 | 100 |

| 耗时 | latency_score |
| --- | --- |
| `<=1000ms` | 100 |
| `<=5000ms` | 80 |
| `<=15000ms` | 60 |
| `>15000ms` | 40 |

tags 固定包含：

- `rule`
- `deterministic`
- `runtime-success` 或 `runtime-{runtime_status}`
- 可选 `error-{error_type}`

---

## 5. 边界

- 不修改 `execution_results` append-only 账本。
- 不修改 `execution_jobs` 状态。
- 不写 `outbox_events`。
- 不触碰 Workflow / Review / Agent / MCP / Publisher 状态机。
- 不读取或写入控制平面业务表。
- 不做自动后台评价；必须由 API 显式触发。

---

## 6. 非目标

- 不做 LLM judge。
- 不做 prompt 质量语义判断。
- 不做真实 provider cost attribution。
- 不做 dashboard / UI。
- 不做定时任务或 outbox relay 消费。
- 不做跨项目权限 enforcement。

---

## 7. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Rule policy registry | 将当前硬编码规则升级为版本化策略 |
| Dataset regression | 对固定样本集批量运行规则评估 |
| LLM judge | 在 runtime safety、预算和审计 gate 完成后接入 |
| Cost attribution | 结合 provider token/cost ledger 生成真实成本评分 |
| Evaluation dashboard | 按 agent/profile/workflow 汇总趋势 |
| RBAC integration | 接入真实 actor/session 权限 |

---

## 8. 验证

新增测试：

- `apps/api/test/integration/product-gap-6-rule-evaluation-api.test.ts`
- 扩展 `apps/api/test/unit/execution-evaluation.test.ts`

覆盖：

- 单 result 创建 deterministic `rule` 评价
- 单 result 重复 rule evaluation 返回 `409`
- job 批处理跳过已有 rule evaluation
- unknown result 返回 `404`
- domain 规则评分边界
