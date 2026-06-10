# Product Gap 9 — Knowledge Entry Archive Backend MVP（审计）

> 范围：在 Product Gap 4/8 的 Knowledge/RAG Backend MVP 与 Context Pack Materialization 之上，补齐单条 knowledge entry 归档能力。
> 一句话目标：**让系统可以停用单条知识条目，并确保后续关键词检索、task candidates 与 context pack materialization 不再使用该条目；当前不做 UI、不做 embedding、不调用 LLM。**

---

## 1. 落地范围

新增能力：

- 单条 knowledge entry 归档 API。
- 归档后 entry 状态变为 `archived`。
- 归档 entry 自动从既有 keyword search 结果中排除。
- 归档 entry 自动从 task knowledge candidates 和 context pack materialization 中排除。

复用既有表：

- `knowledge_entries`
- `knowledge_sources`
- `context_packs`
- `content_tasks`

扩展模块：

- `infrastructure/repositories/knowledge.repository.ts`
- `application/knowledge.service.ts`
- `interfaces/http/routes/knowledge.ts`

无新增 DB 迁移：`knowledge_entries.status` 已在 Product Gap 4 中支持 `active | archived`。

---

## 2. API

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/knowledge/entries/:id/archive` | 将当前 project 内的单条 knowledge entry 置为 `archived` |

Response：既有 `KnowledgeEntrySchema`。

核心字段：

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "source_id": "uuid",
  "title": "Archive candidate",
  "status": "archived",
  "updated_at": "date-time"
}
```

错误语义：

- unknown entry：`404`

---

## 3. 架构图

```text
POST /api/knowledge/entries/:id/archive
  -> KnowledgeService.archiveEntry()
    -> runInProject(project_id)
      -> KnowledgeRepository.archiveEntry()
        -> UPDATE knowledge_entries
             SET status='archived', updated_at=now()
             WHERE id=:id AND project_id=:project_id
        -> returning row
```

读取路径复用既有逻辑：

```text
searchEntries()
  WHERE knowledge_entries.status='active'
    AND knowledge_sources.status='active'

taskCandidates()
  -> searchEntries()

materializeKnowledgeContextPack()
  -> searchEntries()
```

因此归档 entry 后，所有现有知识召回入口自然排除该 entry。

---

## 4. 边界

- 不删除 knowledge entry。
- 不归档 knowledge source。
- 不阻止同一 source 下继续创建新 entry。
- 不修改已有 context packs 的历史快照。
- 不写 `audit_events`。
- 不新增 embedding / vector index。
- 不调用 LLM / rerank。
- 不做 UI。
- 不触碰 Workflow / Review / Agent / MCP / Publisher 状态机。

---

## 5. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-9-knowledge-entry-archive-api.test.ts`

覆盖场景：

- 可归档单条 entry，并返回 `status=archived`。
- 已归档 entry 不再出现在 `/api/knowledge/search`。
- 已归档 entry 不再被 `POST /api/tasks/:taskId/knowledge-context-pack` 物化。
- 归档 entry 不会归档 source，也不会阻止同 source 创建新 entry。
- unknown entry 返回 `404`。

TDD 记录：

- RED：新增测试先失败，核心失败为归档接口返回 `404`，证明接口尚未实现。
- GREEN：补 repository / service / route 后，Product Gap 9 集成测试通过。

---

## 6. 非目标

- 不做 hard delete。
- 不做批量归档。
- 不做恢复 / unarchive。
- 不做 source 与 entry 的级联状态重算。
- 不做 context pack 自动刷新或历史快照重写。
- 不做 embedding、向量库、语义检索或 LLM rerank。
- 不做跨项目权限 enforcement。
- 不做前端 UI。

---

## 7. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Restore entry | 支持 archived entry 恢复为 active |
| Batch archive | 支持按 source / 查询结果批量归档 |
| Materialization history | 记录 context pack 物化批次与来源快照 |
| Embedding invalidation | 未来接向量库后，归档 entry 同步失效向量索引 |
| UI | 知识库管理页中归档 / 恢复条目 |
