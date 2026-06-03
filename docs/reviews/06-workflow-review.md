# 06 工作流审查

> 状态：已完成　|　最近更新：2026-06-03　|　规则：[00-review-master.md](./00-review-master.md)

## 1. 审查对象

- `docs/07-workflow/content-workflow.md`
- 关联：`docs/03-database/database-design.md`（workflow 系列表、状态机 §8、`publish_records` §5.21）、`docs/02-architecture/system-architecture.md`（§8、§15）

## 2. 审查目标

验证内容生产工作流的阶段、状态流转、回滚、版本、多 Agent 协作与质量门禁是否完整、自洽、可落地。

## 3. 审查清单

- [x] 阶段覆盖完整：选题、调研、大纲、写作、润色、配图、排版、审核、发布
- [x] 版本机制只追加，版本链路清晰（单线 happy path，分叉见 WF-004）
- [x] 不以聊天上下文作为阶段产出或状态来源
- [ ] 工作流与阶段状态流转图自洽，且与 DB §8 一致（WF-001/002）
- [ ] 回滚机制覆盖阶段、资产、配置，血缘语义清晰（WF-003/004/009）
- [ ] 多 Agent 并行汇聚（join）与上下文合并机制明确（WF-005）
- [ ] 数据映射与数据库设计一致（WF-006/008）
- [ ] 阶段集与架构抽象一致（WF-007）

## 4. 发现的问题

| ID | 级别 | 类型 | 问题 | 位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| WF-001 | Major | 状态机一致性 | §4.2 含 `failed --> skipped` 转移，DB §8.3 仅 `pending --> skipped`，合法转移集不一致 | wf §4.2 ↔ db §8.3 | 待修复 |
| WF-002 | Major | 状态机一致性 | §4.1 以阶段名建模工作流状态、缺 `terminated`，与 DB §8.2 通用状态口径不同；审查 rejected/terminated 无落点 | wf §4.1 ↔ db §8.2 | 待修复 |
| WF-003 | Major | Workflow/血缘 | "原地重试(attempt_count++)"与"新建 stage_run 重做(parent_stage_run_id)"无判定规则，血缘记录方式二义 | wf §5.3/§4.2 | 待修复 |
| WF-004 | Major | Workflow/版本 | 回滚使下游资产相对旧上游失效，未定义下游作废/标记 stale/重算策略；版本链路未表达分叉血缘 | wf §5/§6.2 | 待修复 |
| WF-005 | Major | Workflow | 并行汇聚(join)未定义为显式阶段；join_any 部分失败、各分支 gate_result 聚合规则缺失 | wf §7.3/§8 ↔ db §5.5.1 | 待修复 |
| WF-006 | Minor | 数据映射 | §9 仍称发布"后续扩展 publish_records"，DB §5.21 已落地；缺 agent_sessions/messages、stage_dependencies 映射 | wf §9 | 待修复 |
| WF-007 | Minor | 一致性 | §2 九阶段与架构 §8.2 抽象骨架命名/粒度不同，无映射说明 | wf §2 ↔ arch §8.2 | 待修复 |
| WF-008 | Minor | 一致性 | 细粒度 asset_type 词表与 DB §5.9 示例枚举对不上；review/publish 已独立表非 asset | wf §3 ↔ db §5.9 | 待修复 |
| WF-009 | Minor | 完整性 | §5.1 配置回滚未引用既有版本化机制（workflow_version / *_config_versions / profile_snapshot） | wf §5.1 | 待修复 |
| WF-010 | Minor | 完整性 | §4.1 取消(cancelled)仅部分阶段有出边，中间态可否取消未说明 | wf §4.1 | 待修复 |

## 5. 修复建议

- **WF-001/002**：以 DB §8.2/§8.3 为权威状态机；§4.1 标注为"业务阶段视图"非状态机权威；补 `terminated` 与审查 rejected/terminated 落点；统一 `skipped` 入边。
- **WF-003**：显式区分"同 run 重试（attempt_count++，技术失败）"与"新 run 重做（新建 stage_run + parent_stage_run_id，业务退回/回滚）"及触发条件。
- **WF-004**：定义回滚后下游资产失效/重算策略，版本链路表达分支血缘（借 stage_run parent 链 + asset 来源推导）。
- **WF-005**：把"汇总/合并"定义为显式阶段或编排步骤，规定门禁、上下文合并、join_any/部分失败语义，与 §5.5.1 `dependency_type` 对齐。
- **WF-006~010**：§9 映射指向权威表并补全；两文档互标抽象/实例关系；统一 asset_type 受控词表；配置回滚引用既有版本机制；明确取消允许态集合。

## 6. 最终结论

有条件通过 —— 流程、版本与多 Agent 协作框架完整且与已修复 DB 结构基本契合，无 Critical；需先消除两套状态机不一致（WF-001/002）、补全回滚血缘与并行汇聚判定（WF-003/004/005）后进入实现。

## 7. 审查记录

| 日期 | 审查者 | 动作 | 说明 |
| --- | --- | --- | --- |
| 2026-06-03 | 架构评审 | 完成审查 | 0 Critical / 5 Major / 5 Minor；结论有条件通过 |
