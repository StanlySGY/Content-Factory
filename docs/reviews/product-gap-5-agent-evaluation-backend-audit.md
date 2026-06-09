# Product Gap 5 — Agent Evaluation Backend MVP（审计）

> 范围：新增 execution result 评价账本，为 Agent 输出质量、成本和延迟评分建立后端最小闭环。
> 一句话目标：**让系统可以对 `execution_results` 追加人工或规则评价，并按 job 汇总评价指标；当前不调用 LLM、不做自动评测、不做 UI。**

---

## 1. 落地范围

新增表：

- `execution_result_evaluations`

新增后端模块：

- `domain/execution/evaluation.ts`
- `application/execution-result-evaluation.service.ts`
- `infrastructure/repositories/execution-result-evaluation.repository.ts`

扩展现有模块：

- `interfaces/http/routes/execution.ts`
- `application/mappers.ts`
- `infrastructure/db/schema.ts`
- `packages/shared/src/enums.ts`
- `packages/shared/src/schemas.ts`

---

## 2. 架构图

```text
HTTP /api/execution/results/:id/evaluations
  -> ExecutionResultEvaluationService
    -> ExecutionResult lookup
    -> Evaluation Domain Rules
    -> ExecutionResultEvaluationRepository
      -> execution_result_evaluations

HTTP /api/execution/jobs/:id/evaluation-summary
  -> ExecutionResultEvaluationService
    -> list evaluations by execution_job_id
    -> summarize averages/latest evaluator
```

本阶段只写评价账本，不修改 `execution_results`、`execution_jobs` 或控制平面业务表。

---

## 3. Schema

`execution_result_evaluations` 字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 评价记录 ID |
| `execution_result_id` | 关联 execution result，FK `execution_results(id)` |
| `execution_job_id` | 冗余记录 job id，便于按 job 汇总 |
| `evaluator_type` | `human | rule` |
| `quality_score` | 0-100 |
| `cost_score` | 0-100 |
| `latency_score` | 0-100 |
| `notes` | 可选备注，最长 4000 |
| `tags` | JSON array |
| `evaluated_by` | 评价人，FK `users(id)` |
| `created_at` | 创建时间 |

约束：

- `UNIQUE (execution_result_id, evaluator_type)`
- scores 均为 0-100
- `tags` 必须为 JSON array
- `cf_app` 仅授予 `SELECT, INSERT`，撤销 `UPDATE, DELETE`

---

## 4. API

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/execution/results/:id/evaluations` | 为 execution result 创建一条评价 |
| `GET` | `/api/execution/results/:id/evaluations` | 列出某 result 的评价 |
| `GET` | `/api/execution/jobs/:id/evaluation-summary` | 汇总某 job 的评价均值和最新评价来源 |

错误语义：

- unknown result：`404`
- 同一 result 重复提交同一 `evaluator_type`：`409`
- 非法 evaluator type / score / tag / notes：`400`

---

## 5. Append-only 边界

本阶段新增的是独立评价账本：

- 不更新 `execution_results`
- 不删除或覆盖历史评价
- 不修改 `execution_jobs` 状态
- 不写 `outbox_events`
- 不替代 Sprint-4 audit hash chain
- 不 join Workflow / Review / Agent / MCP / Publisher 业务表

评价记录只通过 `execution_result_id` 和 `execution_job_id` 关联 execution plane。

---

## 6. 非目标

- 不做 LLM judge。
- 不做自动评测 runner。
- 不做真实成本结算。
- 不做 dashboard / UI。
- 不改 Workflow / Review / Agent / MCP / Publisher 状态机。
- 不改 ExecutionJob / ExecutionResult 状态语义。
- 不做跨项目、多租户全局权限 enforcement。

---

## 7. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Rule evaluator runner | 根据 deterministic rules 自动生成 `rule` 评价 |
| LLM judge | 在 runtime gate、预算、审计齐备后接入真实 LLM judge |
| Cost attribution | 将 provider cost / token / duration 汇入评价视图 |
| Evaluation dashboards | 按 agent、workflow、publisher channel 汇总质量、成本、延迟 |
| Dataset regression | 固化样本集，比较不同 runtime adapter 和 prompt 版本 |
| RBAC integration | 接入真实 actor/session 与项目权限 enforcement |

---

## 8. 验证

新增集成测试：

- `apps/api/test/integration/product-gap-5-agent-evaluation-api.test.ts`

覆盖：

- 为 execution result 创建并列出评价
- 同一 result + evaluator type 唯一约束
- job 级评价 summary
- unknown result 返回 404
- 评价不修改 `execution_results` append-only 账本
