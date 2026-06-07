# Sprint-5 Execution Phase 1.7 — Runtime Contract Readiness（审计）

> 范围：在仍不接入真实 Agent / MCP / LLM / Publisher 的前提下，建立 Phase 2 Real Adapter 所需的
> **Runtime Contract、错误分类、输入/输出 envelope、timeout 契约、Adapter Factory**，把执行边界收敛为稳定契约。
> 一句话目标：**为真实 Runtime 接入建立稳定边界——契约先行、错误分类先行、retryable 语义先行。**
> 不接真实 runtime、不读 API Key、不实现 MCP transport、不新增 Real Adapter、不改 Sprint-4 控制平面。

---

## 1. Phase 1.6 vs Phase 1.7 差异

| 维度 | Phase 1.6 | Phase 1.7 |
| --- | --- | --- |
| Runtime 端口签名 | `execute(job: ExecutionJobRow) → ExecutionResult` | **`execute(request: RuntimeRequest) → RuntimeResponse`** |
| 输入/输出 | 直接传 DB 行、裸结果 | **RuntimeRequest / RuntimeResponse envelope**（稳定契约） |
| 错误语义 | 仅 error 字符串 + blocked 标记 | **RuntimeErrorType 分类 + retryable 布尔** |
| 失败处理 | 失败/blocked 一律走 retry policy（attempt<max→retry） | **非重试失败直接 failed**；可重试失败才走 retry policy |
| timeout | 无 | **timeout 契约**：env 默认 + payload 覆盖（范围校验）；mockDelayMs 模拟 |
| 适配器解析 | worker 持有 `ExecutionRuntimes` map | **RuntimeAdapterFactory.getRuntime(type)**（Phase 2 替换点） |
| runtime 元数据 | 无 | **runtime snapshot 写入 terminal/retry outbox payload**（不扩 DB） |
| 新增域 | — | `domain/execution/runtime-contract.ts`（纯契约） |

**未变**：ExecutionJob 状态机、retry policy 语义（仅“接入” errorType/retryable，未改退避/上限）、outbox relay、Sprint-4 控制平面、DB schema（**无迁移**）。

---

## 2. RuntimeRequest / RuntimeResponse Contract

```
RuntimeRequest（worker 由 ExecutionJobRow 构造 → 校验）
  jobId          : string                      作业标识
  jobType        : 'agent'|'mcp'|'publisher'   适配器路由键
  payload        : object                      作业输入（含 mock* 控制位 / timeoutMs 覆盖）
  attemptCount   : int >= 0                    当前尝试（claim 时已自增）
  idempotencyKey : string                      幂等键（Phase 2 真实副作用去重用）
  timeoutMs      : int > 0                     解析后的超时（env 默认或 payload 覆盖）
  metadata       : object                      传播上下文（如 maxAttempts）

RuntimeResponse（adapter 产出 → worker 校验后落库）
  jobId          : string
  status         : 'success' | 'failed'        runtime 只产这两态（job 终态/重试由 worker 决定）
  output         : object                       结果载荷
  error          : string | null                失败必填
  errorType      : RuntimeErrorType | null       失败分类
  retryable      : boolean                       是否可重试（驱动 worker 决策）
  durationMs     : int >= 0                      执行耗时（适配器自报）
  metadata       : object
```

Worker 职责：`ExecutionJobRow → RuntimeRequest`（含 timeout 解析、校验）；`RuntimeResponse → 状态更新`。
Adapter 职责：只处理 `RuntimeRequest`，产出 `RuntimeResponse`。**Mock 100% 本地，无网络。**
domain helpers：`validateRuntimeRequest` / `validateRuntimeResponse` / `normalizeRuntimeError` / `isRetryableRuntimeError` / `failedRuntimeResponse` / `toExecutionResult` / `resolveTimeoutMs`。

---

## 3. RuntimeErrorType 分类

| errorType | 含义 | 默认 retryable |
| --- | --- | --- |
| `validation_error` | 输入/契约校验失败 | **否**（重试无意义） |
| `permission_denied` | 越权/凭证不足 | **否** |
| `blocked` | 被策略/风控阻断 | **否**（且不可被覆盖为可重试） |
| `timeout` | 超时 | 是 |
| `rate_limited` | 限流 | 是 |
| `external_unavailable` | 外部不可用 | 是 |
| `unknown` | 未分类（thrown error 归一化默认） | 是 |

`isRetryableRuntimeError` = 不属于 {validation_error, permission_denied, blocked}。`normalizeRuntimeError(thrown)` → `unknown` + retryable。

---

## 4. retryable 与 retry policy 的关系（关键）

Phase 1.7 **不改** retry policy 语义（退避、max_attempts、next_run_at 不变），只把 runtime 的 `retryable` 接到失败处理前置闸门：

```
RuntimeResponse.status == success ─────────────► success + finished_at
RuntimeResponse.status == failed
   ├─ retryable == false ──────────────────────► failed 立即终态（无视剩余尝试，不回退 pending）
   └─ retryable == true  ──► markExecutionFailure(job)（既有策略）
                               ├─ attempt_count < max_attempts → pending + next_run_at（退避）
                               └─ attempt_count >= max_attempts → failed + finished_at
```

要点：**非重试失败短路到 failed**；可重试失败仍受 max_attempts / 退避治理。两者都把 runtime snapshot 写入对应 outbox 事件 payload。

---

## 5. Timeout Contract 设计

- 默认：`EXECUTION_RUNTIME_TIMEOUT_MS=30000`；`payload.timeoutMs` 可覆盖。
- 范围校验：`100 <= timeoutMs <= 300000`，越界 → `validation_error`（非重试，立即 failed）。
- Phase 1.7 **不真正中断外部请求**（无 AbortController、无真实网络）：Mock 经 `payload.mockDelayMs` **模拟耗时**（不真正 sleep，确保测试确定性）。
- `mockDelayMs > timeoutMs` → RuntimeResponse：`status=failed, errorType=timeout, retryable=true, durationMs=timeoutMs`。

---

## 6. Adapter Factory 设计

- `RuntimeAdapterFactory.getRuntime(type)` 按 jobType 解析适配器。
- Phase 1.7 仅 `MockRuntimeAdapterFactory`（agent/mcp/publisher → 对应 Mock）。
- worker 仅依赖工厂接口，**不感知 Mock/Real**——Phase 2 注入 Real 工厂即可切换，worker/契约/状态机零改动。
- 不读真实 API Key、不接 MCP transport、不新增 Real Adapter。

---

## 7. API / DTO 取舍（不扩 DB）

按 §6 建议**不新增 DB 字段**（避免 Phase 1.7 过度扩表）：
- `ExecutionJobDTO` 不增 `last_error_type` / `last_runtime_duration_ms`。
- runtime 元数据（status/error/error_type/retryable/duration_ms）以 **snapshot 写入 terminal/retry_scheduled outbox 事件 payload**（`payload.runtime`）。
- 取舍理由：outbox 已是可观测/可投递通道（Phase 1.6），runtime 快照随事件天然可追溯；execution_jobs 保持精简（`last_error` 仍承载最近错误摘要）。Phase 2 若需要按 job 直接过滤 error_type，可再评估补列。

---

## 8. 为什么仍不接真实 LLM / MCP / Publisher

1. **契约先冻结**：RuntimeRequest/Response + 错误分类 + retryable 是真实接入的稳定边界；先以 Mock 在确定性下验证“契约 + 失败决策”闭环，避免与外部不确定性耦合。
2. **隔离层未就位**：真实执行跨信任边界，需超时中断、资源限额、凭证作用域化（沿用 `sensitivity_level`/`risk_level`），属 Phase 2 前置。
3. **替换点已留**：Adapter Factory + 端口让 Real Adapter 以“替换工厂”接入，骨架不动。
4. **控制平面零回改**：执行层独立演进，Sprint-4 内核不受影响。

---

## 9. Phase 2 Real Adapter 准入条件

- [ ] **Runtime 隔离层**：真实超时中断（AbortController/取消）、资源/并发限额、凭证按 `sensitivity_level` 注入。
- [ ] **Real Adapter 实现**：Agent（LLM + tool-calling）、MCP（stdio/HTTP/SSE/WS transport）、Publisher（外部发布）各自实现 `execute(RuntimeRequest)`。
- [ ] **凭证管理**：API Key/密钥经引用注入（不入库、不入日志），与 `metadata` 传播隔离。
- [ ] **真实结果契约**：`output` 针对各 jobType 定型（消息/工具轨迹、请求响应、发布记录引用）；append-only trace 落点确定。
- [ ] **幂等 + 至少一次**：`idempotencyKey` 驱动真实副作用去重；与 outbox relay 投递语义对账。
- [ ] **错误映射**：外部错误 → RuntimeErrorType 的真实映射表（限流/超时/鉴权/不可用）。
- [ ] **可观测**：runtime 耗时分布、errorType 分布、超时率、重试率指标。

满足后注入 Real `RuntimeAdapterFactory`，worker / 契约 / 状态机 / retry policy 全部复用、不回改。

---

## 10. 非目标（本阶段严格不做）

- ❌ 不做真实 Agent / MCP / LLM 执行
- ❌ 不做 Publisher 实际发布
- ❌ 不引入 Redis / MQ / BullMQ
- ❌ 不改 Workflow / Review / Agent / MCP 状态机
- ❌ 不做 UI 改造
- ❌ 不消费外部系统
- ❌ 不读取真实 API Key
- ❌ 不实现 MCP transport
- ❌ 不新增 Real Adapter

---

## 11. 验证结果

| 项 | 结果 |
| --- | --- |
| DB 迁移 | **无新增**（不扩表；runtime 元数据落 outbox payload）✔ |
| API 全量测试 | **445 passed / 46 files**（+16）✔ |
| 覆盖率门控（overall ≥80/70；domain ≥90/85） | 98.84 / 91.11；`src/domain` 100/100 ✔ |
| shared / web 测试 | 6 ✔ / 40 ✔ |
| typecheck（shared + api + web） | 通过 ✔ |
| lint | 0 error / 0 warning ✔ |

新增/扩展测试：RuntimeRequest/Response 校验、normalizeRuntimeError 归一化、blocked 非重试、timeout 可重试、mockDelayMs>timeoutMs 返回 timeout、Adapter Factory 按类型解析、worker 非重试失败→立即 failed、worker 可重试失败→pending+next_run_at、terminal/retry outbox payload 含 runtime snapshot；Phase 1.5/1.6 既有测试经签名适配后全绿。

**裁决：GO** —— Runtime Contract 边界（envelope + 错误分类 + retryable + timeout + Adapter Factory）已就位并经 Mock 验证；非重试/可重试失败决策正确接入既有 retry policy；DB/控制平面零改动。Phase 2 真实 Runtime 以“替换工厂 + 隔离层”接入。
