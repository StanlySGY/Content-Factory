# Sprint-3.5 Audit Package — Editor / Queues / Dashboard Lists

只读补齐增量的发布裁决文档。

## 1. 交付能力
- **Repository（只读聚合）**：`listPendingReviews`（waiting_review）、`listWorkQueue`（running/waiting_review/failed）、`getEditorState`（task→run→current stage→latest asset+versions→context→latest review）；隔离复用 content_tasks JOIN / 直接 project_id 谓词。
- **Service（纯查询，无事务/状态机）**：`EditorQueryService.getEditorState`、`DashboardService.getPendingReviews/getWorkQueue`。
- **Shared DTO**：`EditorStateSchema` / `PendingReviewSchema` / `WorkQueueItemSchema`（+ 响应包装）。
- **API（薄只读）**：`GET /api/tasks/:id/editor-state`、`GET /api/dashboard/pending-reviews`、`GET /api/dashboard/work-queue`。
- **UI**：Editor 页 MVP（状态 + 版本历史 + 追加版本，textarea 复用 createAssetVersion）、Context Side Panel、待审核队列页、工作队列页、Dashboard 队列列表补充。

零新增：表 / 迁移 / 状态机 / 事务编排 / 审计动作 / 权限模型；未改 Review 流程、工作流状态机、退回逻辑、Review API 契约。

## 2. 测试结果
- 全栈测试：**299 通过**（api 266 / web 27 / shared 6），0 失败。
- 新增 E2E（5 条全绿）：Editor flow（append-only 版本历史保留）、Pending Reviews 队列、Work Queue、Dashboard Summary↔队列计数一致、Context Panel 与 editor-state 上下文一致。
- 覆盖率：api line 98.38% / branch 84.99%；domain 100%；application 99.81%；routes 100%——均不低于基线。

## 3. Release Gate
| 项 | 结果 |
| --- | --- |
| `pnpm -r typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm -r test` | PASS |
| coverage（api ≥98/≥84，domain ≥90） | PASS |
| web build | PASS |

## 4. 风险状态
| 项 | 状态 |
| --- | --- |
| 只读隔离（editor/queue 跨项目不可读） | 已验证 |
| append-only 版本历史 | 已验证（E2E-1） |
| Summary 与队列计数一致 | 已验证（E2E-4） |
| Context 一致性 | 已验证（E2E-5） |
| 既有 Sprint-1/2/3 回归 | 无回归 |

## 5. 非阻塞项
1. Editor 追加版本将内容写入 `storage_uri`（`asset_versions` 无正文列、`metadata` 严格为 `{schema_version}`）——MVP 折中，复用既有写端点。
2. `editor-state` 未携带阶段显示名，UI 以 `workflow_stage_id` 短码 + 状态呈现；如需阶段名后续补聚合字段。
3. Dashboard/队列 projectId 前端硬编码种子（S1 单项目，无项目选择器）。
4. `dashboard.repository` 文件级分支约 68%，源自 Step-3 `summaryByProject` 防御性 `??`（COUNT 恒返一行，分支不可达）；全局门禁 PASS。
5. Review API 契约形状（stageRunId-keyed）裁定仍延后（承自 Sprint-3 Audit）。

## 6. Sprint-4 建议
1. 批准 Review API 契约形状（保留 stageRunId-keyed 并同步 roadmap，或补 review-first 流程）。
2. 接入 Agent/MCP 阶段执行（roadmap §3 下一 MVP 层）。
3. 真审核队列排序/优先级 + 通知；`attempt_count`/退回计数语义落地。
4. 项目选择器替换硬编码 projectId；按需评估 Editor 富编辑能力。

## 7. 裁决
**PASS / GO** — Sprint-3.5 只读补齐收口 roadmap §6 编辑/队列缺口，全门禁绿、E2E 与隔离/一致性验证通过，无回归。不阻塞 Sprint-4。
