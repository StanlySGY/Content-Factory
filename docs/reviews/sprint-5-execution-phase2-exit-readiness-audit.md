# Sprint-5 Execution Phase 2 Exit — Readiness Closure Audit

> 范围：冻结 Sprint-5 Execution Phase 2 readiness / disabled harness 阶段。
> 结论：**Phase 2 停止于 Phase 2.29。后续不再新增 Phase 2.30 / 2.31 disabled harness，下一阶段进入 Sprint-6 真实能力落地路线选择。**

---

## 1. 收口结论

| 项目 | 结论 |
|---|---|
| Phase 2 最后阶段 | Phase 2.29 — Writeback Executor Registration Contract Disabled Harness |
| 是否继续 Phase 2.30 | 不继续 |
| 是否继续新增 disabled harness | 不继续 |
| 下一阶段 | Sprint-6 implementation roadmap |
| 当前真实外部调用 | 仍为禁用 |
| 当前真实 writeback | 仍为禁用 |
| 当前 Sprint-4 Control Plane | 未改动 |

Phase 2.29 已经把真实 writeback executor 的注册入口建模为 fail-closed readiness contract：

- `registered=false`
- `registration_allowed=false`
- `executable=false`
- `control_plane_read_allowed=false`
- `control_plane_write_allowed=false`
- `audit_write_allowed=false`

继续添加 no-op invocation 或更多 disabled harness 只会增加表面积，不能显著降低真实实现风险。因此 Phase 2 在此收口。

---

## 2. Phase 2.0 到 Phase 2.29 完成概览

| 区间 | 主题 | 已完成能力 |
|---|---|---|
| Phase 2.0-2.4 | Runtime safety / provider preflight | runtime mode、kill switch、credential ref、provider-like fake/preflight runtime、error mapping |
| Phase 2.5-2.10 | Secret / HTTP / quota-cost preflight | secret resolver contract、HTTP boundary、real HTTP skeleton、timeout/abort、quota/cost readiness |
| Phase 2.11-2.15 | Agent real adapter fail-closed path | registration guard、disabled fixture、provider config、transport disabled harness、minimum closed-loop with injected fake/local client |
| Phase 2.16-2.18 | Relay writeback readiness | terminal outbox writeback handler skeleton、outbox lease、writeback ledger/idempotency |
| Phase 2.19-2.23 | Single subject writeback model | workflow_stage_run guard、transaction plan、dry-run executor、apply guard、disabled transaction prototype |
| Phase 2.24-2.29 | Real writeback executor prerequisites | transaction port、state transition policy、subject snapshot、preflight matrix、feature flag、registration contract |

这些阶段建立了真实能力接入前的安全边界，但没有启用真实外部调用或真实控制面回写。

---

## 3. 为什么 Phase 2.29 是合理停止线

Phase 2.29 已满足 Phase 2 的核心目标：真实执行与真实回写的危险入口都有显式 fail-closed gate。

| 风险入口 | 当前 gate |
|---|---|
| 真实 Agent runtime | runtime mode、adapter registry、registration guard、disabled fixture、transport disabled harness |
| 真实 HTTP provider | network allowlist、secret injection preflight、timeout/abort harness、provider config preflight |
| relay 写回控制面 | durable lease、writeback ledger、idempotency key、writeback guard、apply guard |
| workflow_stage_run 状态写回 | transaction plan、transaction port、state transition policy、subject snapshot |
| 真实 writeback executor | feature flag、preflight matrix、registration contract |

Phase 2.29 之后再做 “no-op invocation disabled harness” 会重复证明同一件事：真实 executor 仍不可执行。这个证明已经由 registration contract、preflight matrix 和 apply guard 覆盖。

---

## 4. 为什么不继续做 Phase 2.30 / 2.31 disabled harness

| 继续添加 harness 的收益 | 判断 |
|---|---|
| 更细的 no-op invocation DTO | 收益低，registration contract 已阻止调用 |
| 更多 blocked API | 增加维护负担和 API 表面积 |
| 更多文档化缺口 | Phase 2 checklist 已足够承载 |
| 更接近真实执行 | 不会，因为仍不触碰真实 dependency |

继续铺 disabled harness 的主要风险：

- 项目看起来持续推进，但真实能力没有落地。
- ops API 数量膨胀，后续真实实现需要维护更多兼容面。
- 测试与文档越来越偏向证明“没有执行”，而不是证明“真实执行正确”。

因此 Phase 2 在 Phase 2.29 停止，后续必须选择一条真实能力路线进入 Sprint-6。

---

## 5. 当前系统已经具备的能力

| 能力 | 状态 |
|---|---|
| 异步 execution job lifecycle | 已具备 |
| DB polling worker | 已具备，默认 feature flag 控制 |
| mock / dry-run / fake provider / provider_preflight adapter mode | 已具备 |
| execution_results append-only ledger | 已具备 |
| outbox relay skeleton + lease | 已具备 |
| writeback ledger + idempotent disabled no-op handler | 已具备 |
| ops health / retry / stale recovery / relay batch | 已具备 |
| runtime safety / secret / HTTP / quota-cost readiness | 已具备 |
| agent real adapter skeleton with injected fake/local HTTP client | 已具备 |
| workflow_stage_run writeback readiness stack | 已具备 |
| real writeback executor registration contract | 已具备 |

---

## 6. 当前系统仍明确不具备的能力

| 能力 | 状态 |
|---|---|
| 生产级真实 Agent / LLM 调用 | 未具备 |
| 真实 secret material 解析与注入 | 未具备 |
| 真实 provider quota enforcement / billing cost calculation | 未具备 |
| 真实 workflow_stage_run 控制面回写 | 未具备 |
| 控制面写入 + audit append 同事务执行版 | 未具备 |
| MCP 真实 transport / process sandbox | 未具备 |
| high-risk MCP tool 人工确认 | 未具备 |
| Publisher 真实发布 | 未具备 |
| publish_records 数据模型 | 未具备 |

这些缺口不应再通过 disabled harness 继续模拟，而应在 Sprint-6 中按路线真实实现。

---

## 7. Control Plane 边界确认

Phase 2 收口时，以下边界仍成立：

- 未改 Workflow / Review / Agent / MCP 既有状态机。
- 未改 audit hash chain。
- 未改 append-only 权限模型。
- 未让 execution job 状态机参与 workflow/review 状态流转。
- 未自动写回 `stage_runs` / `content_assets` / `review_records`。
- 未让 writeback readiness API 读取或 join 业务表。

Sprint-6 若选择 Workflow Stage Writeback MVP，必须显式打开新的受控写入路径，并重新证明：

- ADR-006 状态边校验不被绕过。
- 控制面更新与 audit append 在同一事务内完成。
- writeback ledger 幂等性覆盖 at-least-once relay。

---

## 8. Execution Plane 边界确认

Execution plane 当前负责：

- job 创建、领取、retry、stale recovery
- runtime adapter invocation
- execution result ledger
- outbox event emission / relay
- writeback ledger planning
- ops visibility / readiness

Execution plane 当前不负责：

- 直接修改 workflow/review/asset 状态
- 直接写 audit hash chain
- 读取真实 secret material
- 访问真实 provider network
- spawn 外部 MCP process
- 发布到外部平台

---

## 9. Real Adapter 进入条件

真实 Agent Runtime MVP 进入前必须满足：

| 条件 | 当前状态 |
|---|---|
| runtime mode / kill switch | 已具备 |
| provider config preflight | 已具备 |
| HTTP boundary skeleton | 已具备 |
| timeout / abort | 已具备 |
| credential ref contract | 已具备 |
| secret material resolver | 未具备 |
| network allowlist production policy | 未具备 |
| provider quota enforcement | 未具备 |
| cost calculation policy | 未具备 |

建议：Sprint-6 首选 Agent Real Runtime MVP，但仍先使用 local/fake secret material adapter 或测试 secret resolver，不直接接生产密钥。

---

## 10. Writeback 真实执行进入条件

Workflow Stage Writeback MVP 进入前必须满足：

| 条件 | 当前状态 |
|---|---|
| writeback ledger / idempotency | 已具备 |
| outbox lease | 已具备 |
| transaction plan | 已具备 |
| apply guard | 已具备 |
| transaction port contract | 已具备 |
| state transition policy contract | 已具备 |
| subject snapshot contract | 已具备 |
| executor registration contract | 已具备 |
| control-plane repository adapter | 未具备 |
| same-transaction audit append | 未具备 |
| applied marker semantics | 未具备 |

建议：这条路线风险高于 Agent Real Runtime MVP，因为会首次重新打开控制面写入。

---

## 11. MCP Runtime 进入条件

MCP Runtime Safety MVP 进入前必须满足：

| 条件 | 当前状态 |
|---|---|
| MCP dry-run readiness | 已具备 |
| runtime context / AbortSignal | 已具备 |
| process spawn kill switch | 已具备 |
| stdio / HTTP / SSE / WS transport | 未具备 |
| process sandbox | 未具备 |
| CPU / memory / duration limit | 未具备 |
| high-risk tool confirmation | 未具备 |
| tool result sanitization | 未具备 |

建议：MCP 真实执行必须先做 sandbox / resource limit，不应先接通 transport。

---

## 12. Publisher 进入条件

Publisher MVP 进入前必须满足：

| 条件 | 当前状态 |
|---|---|
| Publisher dry-run readiness | 已具备 |
| publisher runtime port | 已具备 |
| publish_records model | 未具备 |
| preview / publish approval flow | 未具备 |
| external platform credential model | 未具备 |
| rollback / unpublish strategy | 未具备 |

建议：Publisher 属于独立产品线，不混入 Real Adapter 或 Writeback MVP。

---

## 13. 风险清单

| 风险 | 等级 | 说明 |
|---|---|---|
| 真实 Agent 调用泄漏 secret | 高 | 需要真实 secret resolver 与脱敏审计 |
| 真实 Agent 成本失控 | 高 | 需要 quota enforcement 与 cost calculation |
| Writeback 状态机绕过 | 高 | 必须经 ADR-006 和 audit 同事务 |
| Relay at-least-once 重放 | 高 | 必须以 writeback ledger idempotency 收敛 |
| MCP process escape | 高 | 必须先完成 sandbox / resource limit |
| Publisher 误发布 | 高 | 必须引入 preview / approval / rollback |

---

## 14. 下一阶段路线选择

| 优先级 | 路线 | 推荐理由 |
|---|---|---|
| 1 | Agent Real Runtime MVP | 最低控制面写入风险，可先在 execution ledger 内闭环 |
| 2 | Workflow Stage Writeback MVP | 产品价值高，但会首次打开控制面写入，风险更高 |
| 3 | MCP Runtime Safety MVP | 需要 sandbox / process isolation，安全工程量较大 |
| 4 | Publisher MVP | 独立产品线，依赖 publish_records 与审批流，暂缓 |

推荐 Sprint-6 从 **Agent Real Runtime MVP** 开始。原因：它可以继续把真实输出限制在 execution_results/outbox 内，不立即修改 Sprint-4 Control Plane。

---

## 15. 本次收口非目标

- 不新增 Phase 2.30。
- 不新增 disabled harness。
- 不新增 DB migration。
- 不改 Sprint-4 Control Plane 状态机。
- 不改 audit hash chain。
- 不改 append-only 权限模型。
- 不接真实网络 / LLM / MCP / Publisher。
- 不提交 sprint-2 未跟踪文档。

