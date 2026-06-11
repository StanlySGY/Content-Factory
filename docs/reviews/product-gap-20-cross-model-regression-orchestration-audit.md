# Product Gap 20 — Cross-model Regression Orchestration Backend MVP（审计）

> 范围：在 execution job/result 和 evaluation ledger 之上，补齐同一 prompt 跨多个 model 的回归评测编排。
> 一句话目标：**为多个模型创建隔离 execution jobs，同步执行，并为每个 result 追加带模型标签的 rule evaluation，使现有 model comparison API 可直接聚合。**

---

## 1. 落地范围

新增 API：

- `POST /api/execution/evaluations/cross-model-regression-run`

新增请求字段：

- `prompt`：必填，同一轮所有模型共用。
- `models`：必填，2 到 10 个唯一模型名。
- `idempotency_key`：必填，作为本轮 run id，并参与各模型 execution job idempotency key。
- `credential_ref`：可选；传给每个 agent job，只接受 ref，不接受 inline secret。
- `max_attempts`：可选，默认 1。
- `tags`：可选，追加到本轮生成的 rule evaluations。

新增响应字段：

- `mode = cross_model_regression_run`
- `run_id`
- `model_count`
- `job_count`
- `evaluation_count`
- `runtime_jobs_executed = true`
- `writes_performed = true`
- `items[]`：包含 `model`、`execution_job_id`、`execution_result_id`、`evaluation_id`、job/result status 与 evaluator type。

扩展模块：

- `packages/shared/src/schemas.ts`
- `application/execution-result-evaluation.service.ts`
- `interfaces/http/routes/execution.ts`
- `application/mappers.ts`
- `application/execution-ops.service.ts`

---

## 2. 规则语义

- 每个 model 创建一个独立 `agent` execution job，payload 中写入 `prompt`、`model` 和 `regression` 追溯信息。
- 每个 job 同步经过现有 `ExecutionWorker.tickJob`，因此复用既有 runtime mode、adapter、secret injection、provider quota、result ledger 和 outbox 语义。
- 每个 result 追加一条 `rule` evaluation。
- 自动添加 evaluation tags：`cross-model-regression`、`model:<model>`、`regression:<run_id>`，并保留请求传入 tags。
- 现有 `GET /api/execution/evaluations/model-comparison` 可按 `model_prefix` 直接聚合本轮结果。

---

## 3. 边界

- 不新增专用 orchestration 状态表；权威记录仍是 execution jobs/results/evaluations。
- 不绕过 runtime gate、credential resolver、network allowlist 或 provider quota。
- 不自动调用 LLM judge；本轮默认评价为 deterministic rule evaluation。
- 不更新既有 execution jobs/results/evaluations。
- Web `/evaluations` 仍不触发该写接口。

---

## 4. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-20-cross-model-regression-orchestration-api.test.ts`

覆盖场景：

- 同一 prompt 对两个模型创建并执行两个 agent jobs。
- 每个 job payload 保留 model 和 regression run 追溯信息。
- 每个 result 追加一条带 `model:<id>` / `regression:<run_id>` tag 的 rule evaluation。
- `model-comparison` 可按本轮 run id 聚合两个模型。
- product route readiness 将 cross-model regression orchestration 移入 delivered capabilities。

TDD 记录：

- RED：新增 Product Gap 20 集成测试，`POST /api/execution/evaluations/cross-model-regression-run` 返回 404。
- GREEN：新增 shared schema、service 编排方法、route、mapper 和 readiness 更新后，Product Gap 20 测试通过。

已执行验证：

- `pnpm --filter @cf/api exec vitest run test/integration/product-gap-20-cross-model-regression-orchestration-api.test.ts`
- `pnpm --filter @cf/api exec vitest run test/integration/product-gap-20-cross-model-regression-orchestration-api.test.ts test/integration/product-gap-16-evaluation-model-comparison-api.test.ts test/integration/product-route-readiness-api.test.ts test/unit/execution-evaluation.test.ts`

---

## 5. 后续路线

| 后续项 | 说明 |
| --- | --- |
| UI trigger policy | 若未来在 Web 触发跨模型回归，需要单独设计权限、确认、预算和审计 UX |
| LLM judge integration | 可在本轮 result 生成后按显式策略追加 LLM judge，不应默认自动触发 |
| Regression dataset registry | 将 prompt 集、基准任务族、模型矩阵和版本治理产品化 |
| Provider billing reconciliation | 将 Gap 19 结算结果与真实 provider invoice / usage export 对账 |
