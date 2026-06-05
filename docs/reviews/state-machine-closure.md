# 状态机收口 — 冲突裁定与执行记录（State Machine Closure）

> 日期：2026-06-05 · 阶段：Sprint-1.5 Decision Closure · 状态：✅ **RESOLVED — Option 1 已执行**
> 触发：D1 漂移收口任务（Strict State Machine 模式）
> 裁定：经冲突分析（见 §1），任务指令 §1 声称的状态集 `{draft,in_review,approved,published,archived}` 与权威源（database-design §8.1 / DB）不可调和，依任务 🚨 条款先停止并上报；用户裁定采用 **Option 1（严格对齐真实 §8.1）**。
> 结论：以"收紧实现匹配 §8.1"收口 D1——移除 `draft→cancelled`，三端（领域状态机 / UI 动作 / 测试断言）已对齐 §8.1 子集。**全量回归 40/40 通过（API 37 + Web 3），typecheck/lint 全绿。未改 DB 结构、未改 API 形状、未进入 Sprint-2。**

---

## 1. 冲突原因（Conflict Reason）

任务要求"对齐 database-design §8.1"并以"DB 为唯一真相源"，但任务 §1 给出的状态集与二者均不符：

| 来源 | content_task 状态集 |
|------|---------------------|
| **database-design §8.1（权威文档）** | draft · ready · running · waiting_review · revision_required · failed · completed · cancelled · archived（9 态工作流机） |
| **当前 DB / 实现（S1 子集）** | draft · ready · running · completed · cancelled · archived（6 态，§8.1 的真子集） |
| **任务 §1 声称的"§8.1 对齐集"** | draft · **in_review** · **approved** · **published** · archived |

**核心矛盾**：`in_review / approved / published` 不属于 `content_tasks`，而分属其他实体的独立状态机——

| 状态 | 真实归属表 | 该表状态机（database-design） |
|------|-----------|------------------------------|
| `approved` | `asset_versions.status`（§5.20） | draft, review_pending, approved, rejected, stale, archived |
| `published` | `publish_records.status`（§5.21） | pending, publishing, published, failed, withdrawn |
| `in_review` | 全库不存在（近似：content_tasks 的 `waiting_review` / asset 的 `review_pending`） | — |

§1 将**任务生命周期 / 资产审核 / 发布**三个独立状态机合并进 `content_tasks.status`，违反架构的关注点分离（§5 line 433 明示"审核/发布产出走 review_records / publish_records"；§9 line 1014 明示"发布以 publish_records.asset_version_id 为权威指针"）。

**次级矛盾**：§2 Option A"删除 cancelled 状态"与 §8.1 直接冲突——§8.1 含 `cancelled`（ready→cancelled、running→cancelled、cancelled→archived）。

**结论**：无法同时满足〔对齐 §8.1〕〔采用 §1 状态集〕〔DB 为真相源〕〔三端一致 / 无未定义状态〕——这些约束相互矛盾，故 BLOCKED。

---

## 2. 与 D1 的关系

D1 原始漂移为：实现/UI 允许 `draft → cancelled`，而 §8.1 仅有 `ready/running → cancelled`。**在"Strict 模式 + §8.1 为真相源"下，D1 的正确收口是收紧实现以匹配 §8.1**（移除 draft→cancelled），而非引入 §1 的新状态集。§1 的状态集会制造比 D1 严重得多的新漂移（DB 与 §8.1 进一步背离，并冲击 S2/S3/S4 的资产/审核/发布表）。

---

## 3. 重设计提案（Proposed Redesign）

### ✅ Option 1 — 严格对齐真实 §8.1（推荐）

最符合任务原则（Strict / DB 为真相源 / 无未定义状态），改动最小，不冲击未来 Sprint：

- **状态集**：维持 S1 子集 `draft, ready, running, completed, cancelled, archived`（即 §8.1 的人工可达真子集；工作流驱动态 waiting_review/revision_required/failed 待 S2 接入时按 §8.1 启用）。
- **收紧 D1**：移除 `draft → cancelled`，使转换严格等于 §8.1 子集：
  - `draft → ready`
  - `ready → cancelled`
  - `completed → archived`
  - `cancelled → archived`
  - （`ready → running`、`running → *` 等工作流转换 S2 启用）
- **cancelled**：保留（§8.1 含之）。§2 Option A（删除 cancelled）**否决**——与 §8.1 冲突。

**最终状态机（Option 1，S1 有效子集）**：
```
draft --> ready        (确认需求)
draft --> (无 cancelled，收紧)
ready --> cancelled    (取消)
completed --> archived (归档)
cancelled --> archived (归档)
[S2 启用] ready --> running --> waiting_review/completed/failed/cancelled ...
```

**改动清单（已执行）**：
- **DB**：`content_tasks_status_chk` 已含全部 6 态——**未改 DDL**（draft→cancelled 是应用层转换规则，非 DB 约束）。状态值集已与 §8.1 子集一致。
- **API validation**：`UpdateTaskBodySchema.status` 枚举未改（仍是 6 态）；**领域层 `status.ts`** 已改 `draft: ["ready"]`（移除 "cancelled"）。
- **Type 定义**：`TASK_STATUSES` 未改（状态集不变，仅转换收紧）。
- **前端**：`TaskDetailPage.ACTIONS.draft` 已移除 `{label:"取消", to:"cancelled"}`，仅留 `{label:"确认需求", to:"ready"}`。
- **测试**：`content-task.test.ts` 中 draft→cancelled 断言已改为非法（`canTransition` 返回 `false`），并新增 `ready→cancelled` 合法用例。`tasks.api.test.ts` 的 409 用例本就用 `ready→running`（仍非法），无需改。

> 注：本 Option 不新增功能、不改 DB 结构、不改 API 形状，仅"收紧转换规则 + UI 动作"，契合 Sprint-1.5 边界。

---

### ⚠️ Option 2 — 按 §1 字面重设计 content_tasks 生命周期为发布流（不推荐）

将 content_tasks.status 改为 `draft, in_review, approved, published, archived`：

- **代价**：需**重写 database-design §8.1**；与 `asset_versions`（approved/review_pending）、`publish_records`（published）、`review_records` 的既有设计**结构性冲突**——同一语义出现在两处 = 双源漂移；S2/S3/S4 须大规模返工。
- **违反**：架构关注点分离（任务 ≠ 资产 ≠ 发布）；ADR/设计中"发布以 publish_records 为权威"。
- **风险**：高。等同推翻既有数据模型主干，超出 Sprint-1.5"收敛/不扩张"边界。
- 若确需此生命周期，应作为**独立的架构变更提案（新 ADR）**走评审，而非在稳定化阶段以"对齐"名义引入。

---

### Option 3 — 放宽文档以匹配实现（已被用户否决）

将 §8.1 补 `draft→cancelled`。与本次"Strict 模式"决策相悖，不采纳，仅列存档。

---

## 4. 是否保留 cancelled

**保留**。`cancelled` 是 §8.1 的正式状态（ready/running → cancelled → archived）。任务 §2 Option A（删除 cancelled）与权威 §8.1 冲突，否决。Option 1 下 `cancelled` 仅从 `ready`（及 S2 的 `running`）可达，不再从 `draft` 直达。

---

## 5. 修改清单汇总（Option 1 — 已执行）

| 端 | 文件 | 改动 | 是否改 DB 结构 |
|----|------|------|----------------|
| DB | — | 无（CHECK 已含 6 态，值集已对齐） | 否 |
| API/Domain | `apps/api/src/domain/content-task/status.ts` | `draft: ["ready","cancelled"]` → `["ready"]` ✅ | 否 |
| API test | `test/unit/content-task.test.ts` | draft→cancelled 断言改为 `false`；新增 ready→cancelled 合法用例 ✅ | 否 |
| API test | `test/integration/tasks.api.test.ts` | 无需改（409 用例用 ready→running，仍非法） | 否 |
| Frontend | `apps/web/src/features/tasks/TaskDetailPage.tsx` | `ACTIONS.draft` 移除"取消" ✅ | 否 |
| Type | `packages/shared/src/enums.ts` | 无（状态集不变） | 否 |

---

## 6. 执行与验证记录（Execution & Verification）

**裁定**：用户选定 **Option 1**（严格对齐真实 §8.1，收紧 `draft→cancelled`，保留 `cancelled`）。Option 2（按 §1 字面重设计为发布生命周期）需新 ADR + 重写 §8.1 + 协调资产/发布表，超出本阶段、风险高，**否决**。

**收口后最终状态机（content_tasks，S1 有效子集）**：

```
draft  ── 确认需求 ──▶ ready
ready  ── 取消 ─────▶ cancelled
completed ── 归档 ──▶ archived
cancelled ── 归档 ──▶ archived
（draft→cancelled 已收紧移除；ready→running→… 工作流转换 S2 启用）
```

**验证（2026-06-05）**：

| 项 | 结果 |
|----|------|
| `pnpm typecheck`（3 包） | ✅ 通过 |
| `pnpm lint` | ✅ 通过（0 error） |
| API 测试（`@cf/api`） | ✅ 37/37（content-task 19 + tasks.api 9 + audit-security 6 + redaction 3） |
| Web 测试（`@cf/web`） | ✅ 3/3 |

**Strict State Machine 三原则核对**：

- **DB 为唯一真相源**：状态值集 = DB `content_tasks_status_chk`（6 态），未改 DDL；转换规则收紧至 §8.1 子集。✅
- **UI 不得自由新增状态**：`TaskDetailPage.ACTIONS` 仅映射领域机允许的转换，已移除越界的 draft→cancelled 动作。✅
- **API 不得放行未定义转换**：权威校验在 `assertTransition`（非法→`InvalidTransitionError`→409）；draft→cancelled 现返回 409。✅

> 后续：`waiting_review/revision_required/failed` 等工作流驱动态待 S2 接入时按 §8.1 全集扩展本表与 DB CHECK（见 sprint-1.5 审计 R7）。本次收口**不进入 Sprint-2**。
