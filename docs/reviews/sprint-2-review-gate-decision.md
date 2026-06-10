# Sprint-2 Review Gate 架构裁决（C-1）

> 日期：2026-06-05 · 阶段：Sprint-2 Phase-1（解除 Critical C-1）· 基线：`170a33c`
> 性质：架构裁决（只读分析 + 决策）。未写业务代码、未改 src/迁移、未进入 Sprint-2。
> 依据：database-design §8.2/§8.3/§8.4/§5.7/§5.9 · content-workflow §4.1/§4.2/§5.4/§7.5/§8 · agent-architecture §7.3/§15.3 · decision-log ADR-006/017/020 · sprint-2-readiness-audit C-1 · 迁移 0002（content_tasks CHECK）。

---

## 1. 问题定义

S2 交付 Workflow Engine（workflow_runs / stage_runs / content_assets / asset_versions / context_packs，roadmap §5.3），但**审核能力（review_records 表 + `POST /reviews/:id/approve`、`request-revision`）属 S3**（roadmap §6.3/§6.4）。由此产生阶段推进死锁：

- **`waiting_review` 是 S3 能力的入口**：db §8.3 阶段机 `running → waiting_review → approved`；§8.2 工作流机 `running → waiting_review`。`waiting_review` 表示"等待人工/自动审查"。
- **`approved` 由审查驱动**：db §8.4 明示「审查『是否通过』以 `review_records.decision` 为权威，同事务驱动 `stage_runs.status`（approved/revision_required），不反向写回；结论产生前 stage_run 停留 `waiting_review`」。无 `review_records` 即无 `approved`。
- **`revision_required` 是审查退回**：仅由 `review_records.decision = revision_required` 产生（db §8.4 / workflow §5.4「业务退回」），亦属 S3。
- **依赖激活依赖 `approved`**：workflow §7.5 join_all/join_any 要求上游分支 `approved` 后才激活下游；finish_to_start 线性依赖同理。

**死锁链**：S2 阶段 `complete` 后按 §8.3 进入 `waiting_review` → 无 S3 审核 → 无法到 `approved` → 下游依赖永不激活 → **多阶段工作流无法推进**。这与 S2 最小结果"推进阶段"（roadmap §3/§5.2）直接冲突。agent-architecture §7.3 + ADR-020 进一步确认：S2 阶段为人工完成、无 Agent 自动驱动（`agent_profile_id` 仅列、FK 延后 S4），故无法靠 Agent 旁路推进。

---

## 2. 候选方案

### Option A — 自动门禁（gate_schema 自动判定，无需 reviewer）
阶段 `complete` 时，对门禁类型为「自动」的阶段（`gate_schema` 未声明人工审查），由领域阶段机依 `gate_schema`/`gate_result` 自动判定，在**同一事务内** `running → waiting_review → approved`（自动门禁充当 reviewer 角色，判定快照落 `gate_result`），随后激活下游。S3 在其上叠加人工审查：`gate_schema` 声明人工审查的阶段 `running → waiting_review` 后**停留**，由 `review_records.decision` 驱动 `→ approved | revision_required`（§8.4）。

> 架构依据：db §5.7 明示「`gate_result` 为门禁判定快照；审查结论仍以 `review_records` 为权威，二者不冲突」——**自动门禁（gate_result 驱动）与人工审查（review_records 驱动）是两条并存的合法门禁机制**，非互斥。

### Option B — 伪审核（系统生成 review_records，模拟 reviewer）
S2 即建 `review_records` 表，`complete` 时系统自动插入一条 `reviewer_id = NULL, decision = approved` 记录，走 §8.4 canonical 路径驱动 `stage_runs.status`。

### Option C — 保留 waiting_review，S2 不推进，等待 S3
S2 阶段 `complete` 后停留 `waiting_review`，不实现任何越门机制；多阶段推进推迟到 S3 审核闭环落地。

---

## 3. 架构影响分析

| 维度 | Option A 自动门禁 | Option B 伪审核 | Option C 保留等待 |
|------|------------------|----------------|------------------|
| **ADR-006**（四层机集中化）| ✅ 阶段状态由集中领域机依门禁判定驱动；`gate_result` 与 `review_records` 各司其职（db §5.7）| ⚠️ 形式合规（走 review_records），但用合成记录驱动，权威源被伪造 | ✅ 不触发，但机器空转 |
| **roadmap**（S2=工作流+资产；S3=审核）| ✅ 严守边界：S2 不建 review_records | ❌ **越界**：把 S3 表 review_records 拉入 S2 | ✅ 守边界但 S2"推进阶段"目标未达 |
| **Workflow Engine** | ✅ 可推进、可测依赖激活/join/禁跳阶段 | ✅ 可推进 | ❌ 单阶段后死锁，依赖激活/join 无法测 |
| **stage_runs** | `running→waiting_review→approved` 同事务（§8.3 边沿原样）；`gate_result` 记判定 | 同 A 的状态路径，但额外写 review_records | 停在 `waiting_review` |
| **workflow_runs** | `pending→running→completed`（auto 不触发工作流级 waiting_review）| 同 A | 停在 `running`/阶段 `waiting_review` |
| **API 契约** | 6 端点不变；`complete` 内含门禁判定，无新增端点 | 须隐式写 review_records（污染审计/审核链）| `complete` 后无后续端点可推进 |
| **过程可追溯（PRD §2.3）** | ✅ `gate_result` 真实记录自动判定，无伪造 | ❌ 合成 reviewer 决策污染审计链，真假难辨 | ✅ 但闭环未达 |
| **content_tasks.status** | ✅ **无需改**：迁移 0002 CHECK 已为 {draft,ready,running,completed,cancelled,archived}（本就无 waiting_review）；auto 保持 task `running→completed` | ⚠️ 同 A | ❌ 须给 content_tasks CHECK **加** `waiting_review`（任务级也要等待），改既定子集 |
| **S3 返工** | ✅ 纯增量：人工审查叠加在 waiting_review 上，auto 阶段不变，无数据迁移、无合成记录清理 | ❌ 须区分/迁移 S2 合成 review_records，与真实人工记录混淆 | ⚠️ S3 才首次打通推进，S2 投入仅半成品 |

---

## 4. 推荐方案

**推荐 Option A — 自动门禁。** 唯一选定。

**原因**：
1. **架构原生支持**：db §5.7 明确 `gate_result`（自动门禁快照）与 `review_records`（人工审查权威）二者并存不冲突——自动门禁不是绕过审查，而是审查机制的另一合法形态。ADR-006 的"集中机驱动"在 A 下成立（门禁判定集中在领域阶段机）。
2. **守 roadmap 边界**：S2 不建 review_records（不越 S3），仅用 S2 既有的 `gate_schema`/`gate_result`（workflow_stages/stage_runs 字段，本就 S2 建表）。
3. **既有约束已对齐**：迁移 0002 的 `content_tasks_status_chk` **本就不含 `waiting_review`**——这是 S1 已固化的子集选择，恰好与"任务在自动门禁下保持 running→completed"一致。Option C 反而要求给 content_tasks CHECK 补 `waiting_review`，破坏既定子集、增量更大。
4. **可交付、可测**：S2 能真正推进多阶段、测试依赖激活/join/禁止跳阶段回归（roadmap §5.6），达成"推进阶段"目标。

**为什么不会造成未来返工**：
- **S3 纯增量叠加**：S3 引入人工审查时，`gate_schema` 声明人工审查的阶段在 `running→waiting_review` 后**停留**，由 `review_records.decision` 驱动 `waiting_review→approved|revision_required`（§8.4 canonical 路径）。**自动门禁阶段的代码路径不变**，无需重写。
- **状态机边沿不变**：A 复用 db §8.3 的 `running→waiting_review→approved` 原样边沿（自动门禁只是让这两步在同事务内连续发生），不发明新转换，S3 无需修订状态机。
- **无数据债**：S2 不产生任何合成 `review_records`（对比 B），S3 无须清理/迁移；审计链只记真实 `gate_result` 自动判定。
- **CHECK 仅单向扩展**：S2 CHECK 见 §5；S3 仅向 stage/workflow CHECK **追加** `revision_required`、向 content_tasks 追加 `waiting_review`（与 S1→当前的子集扩展模式一致），不回改已放行值。

**否决理由**：
- **Option B**：把 S3 表提前拉入 S2（越界）；合成 reviewer 决策污染审计/审核链、损害过程可追溯率（无法区分真实审查与系统伪造）；S3 须区分迁移合成记录——制造数据债与返工。
- **Option C**：S2 单阶段后死锁，无法推进/测依赖激活，"推进阶段"目标落空；且须给 content_tasks CHECK 加 `waiting_review`，反向偏离 S1 既定子集。

---

## 5. S2 状态子集

> 设计取舍：自动门禁下，`waiting_review` 为**同事务瞬态**（进入即由门禁判定离开，不作为静止态）；`revision_required` 为人工退回，**整体留 S3**。三机 CHECK 与领域转换器据此收敛；S3 仅单向追加。

### `stage_runs.status`（db §8.3 全集 7 态：pending/running/waiting_review/approved/revision_required/failed/skipped）

| 状态 | S2 | 说明 |
|------|----|------|
| `pending` | ✅ 允许 | 阶段创建初值 |
| `running` | ✅ 允许 | 开始执行（`start`）|
| `waiting_review` | ✅ 允许（**瞬态**）| 自动门禁同事务内经过；S3 起人工审查时作静止态 |
| `approved` | ✅ 允许 | 自动门禁通过（终态，激活下游）|
| `failed` | ✅ 允许 | 执行失败（`failed→running` 重试）|
| `skipped` | ✅ 允许 | 条件跳过（仅 `pending→skipped`）|
| `revision_required` | ❌ **禁止（S3）** | 人工退回，依赖 review_records |

**S2 阶段转换边沿**：`pending→running`、`pending→skipped`、`running→waiting_review→approved`（自动门禁，同事务）、`running→failed`、`failed→running`。**禁止**：任何到 `revision_required` 的边；下游 `pending→running` 须上游 `approved`（禁止跳阶段，依赖图强制）。自动门禁不通过 → `complete` 返回 422（门禁未达），阶段留 `running` 待修正重提（不引入 revision_required）。

### `workflow_runs.status`（db §8.2 全集 8 态：pending/running/waiting_review/revision_required/completed/failed/terminated/archived）

| 状态 | S2 | 说明 |
|------|----|------|
| `pending` | ✅ 允许 | 实例创建初值 |
| `running` | ✅ 允许 | 阶段推进中 |
| `completed` | ✅ 允许 | 全部阶段 `approved`/`skipped` |
| `failed` | ✅ 允许 | 不可恢复错误（`failed→running` 人工恢复）|
| `terminated` | ✅ 允许 | 人工终止 |
| `archived` | ✅ 允许 | `completed`/`terminated → archived` |
| `waiting_review` | ❌ **禁止（S3）** | 工作流级等待审查，依赖 review_records |
| `revision_required` | ❌ **禁止（S3）** | 工作流级退回，依赖 review_records |

### `content_tasks.status`：**不变**（迁移 0002 子集 {draft,ready,running,completed,cancelled,archived}）。自动门禁下任务保持 `running→completed`，**无需改 CHECK**。

### `content_assets.status`：S2 子集 {draft, archived}（roadmap §5.3），不变。

---

## 6. 最终裁决

# ✅ PASS

C-1 解除。裁定 **Option A 自动门禁**：S2 阶段经 `gate_schema`/`gate_result` 自动门禁在同事务内 `running→waiting_review→approved` 推进，不建 review_records、不产生合成数据；状态子集如 §5（stage 6/7、workflow 6/8、task/asset 不变），`revision_required` 与工作流/任务级 `waiting_review` 整体留 S3 单向追加。S3 人工审查纯增量叠加，**零返工**。

> 同时解除 readiness-audit 的 **MJ-4（S2 状态 CHECK 子集未定）**——子集已由本裁决锁定。
