# Product Gap 15 — Knowledge Context Pack Auto-refresh Backend MVP（审计）

> 范围：在 Knowledge Context Pack Materialization 和 Knowledge 本地检索能力之上，补齐 append-only 的自动刷新策略。
> 一句话目标：**当由 knowledge entries 物化的 task 级 context pack 受知识条目新增、归档、恢复或 source active/archive 变化影响时，自动追加下一版 context pack 快照；当前不调用 LLM、不做后台 scheduler、不改历史快照。**

---

## 1. 落地范围

新增行为：

- `POST /api/tasks/:taskId/knowledge-context-pack` 写入 `data.limit` 与 `data.refresh_policy = on_knowledge_change`。
- 匹配的 knowledge entry 创建后，自动追加下一版 task-scoped context pack。
- referenced knowledge entry 归档后，自动追加下一版并排除 archived entry。
- knowledge entry restore、source archive/restore 也触发同一刷新策略。
- 刷新只追加 `context_packs` 新版本，不更新旧版本。

扩展模块：

- `application/context-pack.service.ts`
- `application/knowledge.service.ts`
- `infrastructure/repositories/context-pack.repository.ts`
- `application/execution-ops.service.ts`

无新增 DB 迁移：沿用 `context_packs` 的 task-scope version 唯一约束。

---

## 2. 规则语义

- 仅处理 `scope = task` 且 `data.materialized_from = knowledge_entries` 的 context pack。
- 同一 task + query 只以最高 version 为刷新基线。
- 刷新时重新执行现有 keyword search；archived entries 和 archived sources 自然排除。
- 搜索结果和上一版 `source_refs.knowledge_entry_ids` 相同则不追加新版本。
- 搜索结果为空时仍可追加空候选版本，用于表达最新上下文已无 active 知识来源。
- 新版本写入：
  - `data.refresh_policy = on_knowledge_change`
  - `data.refreshed_from_context_pack_id`
  - `data.refreshed_from_version`
  - `source_refs.refreshed_from_context_pack_id`

---

## 3. 架构图

```text
Knowledge mutation
  -> KnowledgeService
    -> create/archive/restore entry or source in current transaction
    -> refreshMaterializedKnowledgeContextPacks()
      -> contextRepo.listTaskScoped(project)
      -> pick latest pack per task + query
      -> knowledgeRepo.searchEntries(query, limit)
      -> if source refs changed:
           contextRepo.create(version + 1)
```

---

## 4. 边界

- 不调用 LLM。
- 不做 vector rerank。
- 不启动后台 scheduler / worker。
- 不修改既有 `context_packs` 记录。
- 不主动物化从未创建过的 context pack。
- 不改变手动 `POST /api/tasks/:taskId/knowledge-context-pack` 的入口语义；初次物化仍由调用方显式触发。
- 不做 Web UI。

---

## 5. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-15-knowledge-context-refresh-api.test.ts`

更新测试：

- `apps/api/test/integration/product-route-readiness-api.test.ts`

覆盖场景：

- 匹配 query 的新 knowledge entry 创建后，task context pack 自动追加 version 2。
- referenced knowledge entry 归档后，task context pack 自动追加 version 2 并排除 archived entry。
- product route readiness 将 context pack auto-refresh 从 missing requirements 移入 delivered capabilities。

TDD 记录：

- RED：新增 Product Gap 15 集成测试，当前只返回 context pack version `[1]`，证明没有自动刷新。
- GREEN：补 context pack 列表查询、knowledge mutation 后刷新逻辑、初始 materialization refresh metadata 后，Product Gap 15 测试通过。

---

## 6. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Refresh scheduler | 为大规模知识变更提供异步批处理和重试 |
| Refresh audit | 独立记录刷新触发来源和影响范围 |
| Hybrid refresh | 合并 vector retrieval / rerank 后刷新 context pack |
| UI visibility | 在 knowledge candidate review UI 展示 context pack refresh lineage |
