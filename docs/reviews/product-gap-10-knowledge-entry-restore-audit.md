# Product Gap 10 — Knowledge Entry Restore Backend MVP（审计）

> 范围：在 Product Gap 9 的单条 knowledge entry 归档能力之上，补齐单条恢复能力。
> 一句话目标：**让系统可以把 archived knowledge entry 恢复为 active，并重新参与 keyword search、task candidates 与 context pack materialization；恢复前必须确保所属 source 仍为 active。**

---

## 1. 落地范围

新增能力：

- 单条 knowledge entry restore API。
- archived entry 可恢复为 `active`。
- restored entry 会重新进入既有 keyword search。
- restored entry 可再次被 task context pack materialization 使用。
- parent source 已 archived 时，restore 返回 `409`。

复用既有表：

- `knowledge_entries`
- `knowledge_sources`
- `context_packs`
- `content_tasks`

扩展模块：

- `infrastructure/repositories/knowledge.repository.ts`
- `application/knowledge.service.ts`
- `interfaces/http/routes/knowledge.ts`

无新增 DB 迁移：继续复用 `knowledge_entries.status = active | archived`。

---

## 2. API

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/knowledge/entries/:id/restore` | 将当前 project 内的单条 knowledge entry 恢复为 `active` |

Response：既有 `KnowledgeEntrySchema`。

核心字段：

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "source_id": "uuid",
  "title": "Restore candidate",
  "status": "active",
  "updated_at": "date-time"
}
```

错误语义：

- unknown entry：`404`
- parent source archived：`409`

---

## 3. 架构图

```text
POST /api/knowledge/entries/:id/restore
  -> KnowledgeService.restoreEntry()
    -> runInProject(project_id)
      -> getEntry(project_id, entry_id)
      -> getSource(project_id, entry.source_id)
      -> assertKnowledgeSourceActive(source.status)
      -> restoreEntry()
        -> UPDATE knowledge_entries
             SET status='active', updated_at=now()
             WHERE id=:id AND project_id=:project_id
        -> returning row
```

读取路径仍复用既有逻辑：

```text
searchEntries()
  WHERE knowledge_entries.status='active'
    AND knowledge_sources.status='active'

taskCandidates()
  -> searchEntries()

materializeKnowledgeContextPack()
  -> searchEntries()
```

因此 restored entry 会重新进入所有既有知识召回入口。

---

## 4. 规则语义

- restore 是 project-scoped，只能恢复当前 project 内的 entry。
- restore 不修改 `knowledge_sources`。
- restore 前必须校验 parent source 为 `active`。
- source archived 时返回 `409`，避免 active entry 挂在 archived source 下。
- 对已 active 的 entry 调用 restore 保持幂等式结果：仍返回 active row。

---

## 5. 边界

- 不恢复 knowledge source。
- 不批量恢复。
- 不自动重建 context packs。
- 不修改已有 context pack 历史快照。
- 不写 `audit_events`。
- 不新增 embedding / vector index。
- 不调用 LLM / rerank。
- 不做 UI。
- 不触碰 Workflow / Review / Agent / MCP / Publisher 状态机。

---

## 6. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-10-knowledge-entry-restore-api.test.ts`

覆盖场景：

- archived entry restore 后返回 `status=active`。
- restored entry 重新出现在 `/api/knowledge/search`。
- restored entry 可被 `POST /api/tasks/:taskId/knowledge-context-pack` 物化。
- parent source archived 时 restore 返回 `409`。
- unknown entry 返回 `404`。

TDD 记录：

- RED：新增测试先失败，核心失败为 restore 接口返回 `404`，证明接口尚未实现。
- GREEN：补 repository / service / route 后，Product Gap 10 集成测试通过。

---

## 7. 非目标

- 不做 source restore。
- 不做批量 restore。
- 不做 restore reason / actor ledger。
- 不做 context pack 自动刷新或历史快照重写。
- 不做 embedding、向量库、语义检索或 LLM rerank。
- 不做跨项目权限 enforcement。
- 不做前端 UI。

---

## 8. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Batch restore | 支持按 source / 查询结果批量恢复 |
| Source restore policy | 定义 source 恢复时是否允许批量恢复 entries |
| Materialization history | 记录 context pack 物化批次与来源快照 |
| Embedding invalidation | 未来接向量库后，归档 / 恢复 entry 同步维护向量索引 |
| UI | 知识库管理页中归档 / 恢复条目 |
