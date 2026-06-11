# Product Gap 18 — LLM Judge Evaluation Backend MVP（审计）

> 范围：在 execution result evaluation 账本和 agent real runtime 之上，补齐显式 LLM judge 评估写入口。
> 一句话目标：**为目标 execution result 创建独立 judge agent job，经现有 real runtime / secret injection / network allowlist / provider quota / result ledger 后解析严格 JSON，并追加 `llm` evaluation。**

---

## 1. 落地范围

新增 API：

- `POST /api/execution/results/:id/evaluate-llm`

新增请求字段：

- `credential_ref`：必填；复用 runtime credential reference 语义，只接受 ref，不接受 inline secret。
- `model`：可选；传给 judge agent job，并写入 `model:<id>` evaluation tag。
- `prompt`：可选；作为 judge 指令，系统仍会追加严格 JSON 约束。
- `tags`：可选；追加到最终 `llm` evaluation tags。

新增响应字段：

- `mode = llm_judge_evaluation`
- `judge_job_id`
- `judge_result_id`
- `llm_calls_performed = true`
- `writes_performed = true`
- `evaluation`

扩展模块：

- `packages/shared/src/enums.ts`
- `packages/shared/src/schemas.ts`
- `db/migrations/0033_llm_judge_evaluator_type.js`
- `application/execution-result-evaluation.service.ts`
- `domain/execution/evaluation.ts`
- `interfaces/http/routes/execution.ts`
- `application/mappers.ts`
- `application/execution-ops.service.ts`

---

## 2. 规则语义

- LLM judge 不直接调用 provider client，而是创建 `agent` execution job 并同步 tick 现有 `ExecutionWorker`。
- judge job 使用现有 real runtime 路径：runtime policy、credential resolver、secret injection、network allowlist、provider quota/cost ledger、execution result ledger。
- judge prompt 只包含白名单 result summary，不嵌入完整 `response_snapshot`、`request_snapshot`、`credential_ref` 或 provider request metadata。
- judge 输出必须是严格 JSON object，字段为 `quality_score`、`cost_score`、`latency_score`，可选 `notes`、`tags`。
- 最终 evaluation 的 `evaluator_type = "llm"`，并复用既有 `(execution_result_id, evaluator_type)` 唯一约束避免重复 LLM evaluation。
- 原始被评估的 execution job/result 不被修改；新增写入仅限 judge job/result 和 `execution_result_evaluations`。

---

## 3. 边界

- 不伪造 LLM judge 分数。
- 不绕过 secret injection、provider quota 或 result ledger。
- 不把原始 result 的完整 runtime snapshot 发送给 judge provider。
- 不修改 `execution_results` append-only 历史记录。
- 不替代 billing-grade 成本结算。
- 不做跨模型回归评测编排或后台调度。
- 不新增 dashboard 触发入口；当前 Web `/evaluations` 仍为只读看板。

---

## 4. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-18-llm-judge-evaluation-api.test.ts`

覆盖场景：

- subject agent job 先经 real runtime 成功写入 result ledger。
- `evaluate-llm` 创建独立 judge job，并产生第二次 provider fetch。
- judge result ledger 包含 provider quota、token usage 和 cost estimate metadata。
- judge 输出 strict JSON 被解析为 `llm` evaluation。
- judge 请求正文不携带原始 `credential_ref` 或完整 `response_snapshot`。
- 原始 evaluated job 在 evaluate 前后响应保持不变。

TDD 记录：

- RED 1：新增 Product Gap 18 集成测试，`POST /api/execution/results/:id/evaluate-llm` 返回 404。
- RED 2：初次实现后，judge prompt 嵌入完整 `response_snapshot`，provider HTTP boundary 以 `agent provider http boundary must not contain plain secret material` 拒绝。
- GREEN：改为白名单 result summary，并保留 real runtime / quota / ledger 路径后，Product Gap 18 测试通过。

已执行验证：

- `pnpm --filter @cf/api exec vitest run test/integration/product-gap-18-llm-judge-evaluation-api.test.ts`
- `pnpm --filter @cf/api exec vitest run test/integration/product-gap-18-llm-judge-evaluation-api.test.ts test/integration/product-gap-5-agent-evaluation-api.test.ts test/integration/product-route-readiness-api.test.ts test/unit/execution-evaluation.test.ts`
- `pnpm -r typecheck`
- `git diff --check`
- `pnpm --filter @cf/api test`（175 files / 810 tests）

---

## 5. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Billing-grade cost settlement | 接入 provider billing/rate card、模型价格、币种、时间窗口与误差审计 |
| Cross-model regression orchestration | 为同一任务族跨模型调度、评估和对比 |
| Judge prompt governance | 增加 prompt/version registry、人工审核、回放与漂移审计 |
| UI trigger policy | 若未来要在 Web 触发 judge，需要单独设计权限、确认、预算和审计 UX |
