# Sprint-3 Audit Package — Review / Revision / Dashboard / Compare

发布裁决文档（仅保留交付能力 / 测试结果 / 风险状态 / 已知非阻塞项 / 最终裁决）。

## 1. 交付能力

| 层 | 交付 |
| --- | --- |
| DB | `review_records`（append-only，8 FK RESTRICT，action+退回目标 CHECK，6 索引）；`content_assets.status` 扩为全集 `{draft,review_pending,approved,rejected,stale,archived}`（可逆 CHECK）；审计动作/主体扩展；`review_records` 最小权限（cf_app S/I 撤 U/D、cf_audit_reader S） |
| Domain | Review 状态机（`pending→approved\|revision_requested`，独立于 StageRun）；退回规则收敛（`resolveReviewDecision`，目标必填）；AssetStatus 6 态转换矩阵；评审→资产目标态桥接 |
| Repository | `ReviewRepository`（create/get/listByStageRun/listByAssetVersion，append-only，自带 project_id 直接谓词隔离）；`DashboardRepository.summaryByProject`（5 原子计数）；`compareVersions`（取两版本，不做 diff） |
| Service | `ReviewService.approveReview/requestRevision`（单 `runInProject` 事务：review→状态机→stage→asset→workflow→audit，全提交或全回滚）；`DashboardService`；`AssetService.compareAssetVersions`（字段级 diff） |
| API | `POST /reviews/:stageRunId/approve\|request-revision`、`GET /dashboard/summary`、`GET /assets/:id/compare`、`GET /stage-runs/:id`（薄控制器） |
| UI | Dashboard 聚合卡片、审核台 + approve/退回操作、StageRun 详情 + 重试、Asset 详情 + 版本对比 diff（TanStack Query，invalidate 刷新） |

退回机制采 Sprint-3 Step-2 裁定 **Option C**：不引入 `revision_required`、不改/不回退旧 stage_run；退回新建 pending stage_run 重执行，旧 stage_run 保持历史态。

## 2. 测试结果

| 门禁 | 结果 |
| --- | --- |
| `pnpm -r typecheck` | PASS |
| `pnpm lint` | PASS（0 warning） |
| 测试（api 237 / web 17 / shared 4 = 258） | PASS |
| 覆盖率门禁 | PASS（全局 98.3/84.32/98.88/98.3；`src/domain/**` ≥90/85；routes 100%；application 99.8% 行） |
| 迁移 up→down→up（干净 schema） | PASS（三轮 EXIT 0） |

**E2E 链路（review-e2e.test.ts）**：审核通过 / 退回 / 重执行（新建 pending stage_run，旧态不变）/ Compare / Dashboard 聚合 全链 PASS。

**事务原子性**：approveReview、requestRevision 失败场景（非法资产转换）均验证整体回滚——无残留 review、stage 与 asset 状态不变。

**安全/回归（既有用例重跑全绿）**：`review_records` 与 `asset_versions` DB 级 append-only（cf_app U/D 被拒）、项目隔离（review/dashboard/compare/stage 跨项目不可读）、审计哈希链连续、角色最小权限；Sprint-1/2/3 无回归。

## 3. 风险状态

| 编号 | 项 | 状态 |
| --- | --- | --- |
| R1 | 退回事务一致性 | 已验证（单事务 + 回滚用例） |
| R2 | append-only（review_records / asset_versions） | 已验证（权限层 + DML 拒绝） |
| R3 | 项目隔离 | 已验证（直接谓词 + JOIN） |
| R4 | 迁移可逆性 | 已验证（清洁 schema up/down/up） |
| R5 | 审计链连续 | 已验证（audit-security 重跑） |

## 4. 已知非阻塞项

1. **Option C 取舍**：退回后旧 stage_run 悬置 `waiting_review`，重执行经新建 pending stage_run；偏离 db §8.3 的 `revision_required` 路径（经用户裁定）。
2. **审核台为查询式**：S3 无「列出待审阶段 / 审核历史」HTTP 端点（不在范围），UI 以 stage_run id 进入；真队列需后续补 list 端点。
3. **Dashboard projectId 前端硬编码种子**：S1 单项目 MVP 无项目选择器（`lib/config.ts`）。
4. **迁移 down 需干净 schema**：seed-down 硬删除 + RESTRICT FK，线上回滚须先迁移数据（既有约束，非 S3 引入）。
5. **最小必要新增**：`content-asset` 仓储 `updateStatus`（纯 SQL，Step-4）、`WorkflowRunService.getStageRun`（只读，Step-5）——仅为暴露能力，无业务/状态机逻辑。

## 5. 最终裁决

**PASS / GO** — Release Gate 全绿，E2E 与事务一致性验证通过，安全不变量与既有 Sprint 无回归。不阻塞 Sprint-4。
