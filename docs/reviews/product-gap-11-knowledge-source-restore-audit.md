# Product Gap 11 — Knowledge Source Restore Backend MVP（审计）

> 范围：在 Product Gap 4 的 Knowledge/RAG Backend MVP 之上，补齐单条 knowledge source 恢复能力。
> 一句话目标：**让 archived knowledge source 恢复为 active，并让其下知识条目重新参与 keyword search、task candidates 与 context pack materialization；当前不做 UI、不做 source 级批量操作、不接 embedding/LLM。**

---

## 1. 落地范围

新增能力：

- 单条 knowledge source restore API。
- archived source 可恢复为 `active`。
- source 恢复后，其下 active knowledge entries 重新进入既有 keyword search。
- source 恢复后，其下 active entries 可再次参与 task candidates 与 context pack materialization。

复用既有表：

- `knowledge_sources`
- `knowledge_entries`
- `context_packs`
- `content_tasks`

扩展模块：

- `infrastructure/repositories/knowledge.repository.ts`
- `application/knowledge.service.ts`
- `interfaces/http/routes/knowledge.ts`

无新增 DB 迁移：继续复用 `knowledge_sources.status = active | archived`。

---

## 2. API

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/knowledge/sources/:id/restore` | 将当前 project 内的单条 knowledge source 恢复为 `active` |

Response：既有 `KnowledgeSourceSchema`。

错误语义：

- unknown source：`404`

---

## 3. 架构图

```text
POST /api/knowledge/sources/:id/restore
  -> KnowledgeService.restoreSource()
    -> runInProject(project_id)
      -> restoreSource()
        -> UPDATE knowledge_sources
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

因此 source 恢复后，其下 active entries 会自然重新进入所有既有知识召回入口。

---

## 4. 规则语义

- restore 是 project-scoped，只能恢复当前 project 内的 source。
- restore 不修改 `knowledge_entries`。
- restore 不自动恢复 archived entries。
- source 恢复后，仅 active entries 会重新可见。
- 对已 active 的 source 调用 restore 保持幂等式结果：仍返回 active row。

---

## 5. 边界

- 不恢复单条 knowledge entry。
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

- `apps/api/test/integration/product-gap-11-knowledge-source-restore-api.test.ts`

覆盖场景：

- archived source restore 后返回 `status=active`。
- restored source 下 active entry 重新出现在 `/api/knowledge/search`。
- restored source 下 active entry 可被 `GET /api/tasks/:taskId/knowledge-candidates` 召回。
- restored source 下 active entry 可被 `POST /api/tasks/:taskId/knowledge-context-pack` 物化。
- unknown source 返回 `404`。

验证记录：

- 新增 Product Gap 11 集成测试覆盖 source restore 的核心行为与未知 source 错误语义。
- 补 repository / service / route 后，Product Gap 11 集成测试通过。

---

## 7. 非目标

- 不做 entry restore。
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
| Batch restore | 支持按 source / 查询结果批量恢复 sources 或 entries |
| Source archive policy | 定义 source 归档时是否级联处理 entries |
| Materialization history | 记录 context pack 物化批次与来源快照 |
| Embedding invalidation | 未来接向量库后，归档 / 恢复 source 同步维护向量索引 |
| UI | 知识库管理页中归档 / 恢复条目与源 |
