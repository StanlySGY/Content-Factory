# Product Gap 12 — Knowledge Inventory Read API Backend MVP（审计）

> 范围：在 Knowledge/RAG 后端 MVP、source/entry archive/restore 能力之上，补齐知识库管理所需的只读 inventory API。
> 一句话目标：**让后端可以列出、查看 knowledge sources，并查看 source 下 active/archived entries，为后续知识库 UI 提供稳定读模型；当前不做 UI、不做分页、不做 embedding/LLM。**

---

## 1. 落地范围

新增只读能力：

- 列出当前 project 的 knowledge sources。
- 按 `status` / `source_type` 过滤 sources。
- 查看单个 knowledge source 详情。
- 列出某 source 下的 knowledge entries。
- 按 `status` 过滤 source 下 entries，包含 archived inventory rows。

复用既有表：

- `knowledge_sources`
- `knowledge_entries`

扩展模块：

- `packages/shared/src/schemas.ts`
- `infrastructure/repositories/knowledge.repository.ts`
- `application/knowledge.service.ts`
- `interfaces/http/routes/knowledge.ts`

无新增 DB 迁移：全部为只读查询能力。

---

## 2. API

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/knowledge/sources?status=&source_type=` | 列出当前 project 的 sources |
| `GET` | `/api/knowledge/sources/:id` | 查看 source 详情 |
| `GET` | `/api/knowledge/sources/:id/entries?status=` | 列出 source 下 entries |

响应：

- source 列表：`KnowledgeSourcesResponseSchema`
- source 详情：`KnowledgeSourceResponseSchema`
- entry 列表：`KnowledgeEntriesResponseSchema`

错误语义：

- unknown source detail：`404`
- unknown source entries：`404`
- query enum 非法：`400`

---

## 3. 架构图

```text
GET /api/knowledge/sources
  -> KnowledgeService.listSources()
    -> runInProject(project_id)
      -> repository.listSources(project_id, filter)

GET /api/knowledge/sources/:id
  -> KnowledgeService.getSource()
    -> runInProject(project_id)
      -> repository.getSource(project_id, source_id)
      -> missing => 404

GET /api/knowledge/sources/:id/entries
  -> KnowledgeService.listEntriesBySource()
    -> runInProject(project_id)
      -> repository.getSource(project_id, source_id)
      -> missing => 404
      -> repository.listEntriesBySource(project_id, source_id, filter)
```

---

## 4. 规则语义

- 所有查询均 project-scoped。
- source inventory 默认包含 `active` 与 `archived` sources。
- entry inventory 默认包含 `active` 与 `archived` entries。
- 过滤仅使用已有状态/类型 enum，不引入新状态。
- 该 inventory API 不改变 keyword search 语义；search 仍只返回 active source + active entry。
- 该 inventory API 不写 `audit_events`，不改变任何状态。

---

## 5. 边界

- 不做分页。
- 不做模糊搜索。
- 不做跨 source 的 entry 全局列表。
- 不做 source/entry update。
- 不做批量 archive/restore。
- 不自动刷新 context pack。
- 不新增 embedding / vector index。
- 不调用 LLM / rerank。
- 不做 UI。
- 不触碰 Workflow / Review / Agent / MCP / Publisher 状态机。

---

## 6. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-12-knowledge-inventory-api.test.ts`

覆盖场景：

- `GET /api/knowledge/sources` 返回 active 与 archived sources。
- `status` + `source_type` 过滤生效。
- `GET /api/knowledge/sources/:id` 返回 source 详情。
- `GET /api/knowledge/sources/:id/entries` 返回 active 与 archived entries。
- entry `status` 过滤生效。
- unknown source detail / entries 返回 `404`。

TDD 记录：

- RED：新增测试先失败，列表/详情端点返回 `404`，证明 inventory API 尚未实现。
- GREEN：补 shared schema / repository / service / route 后，Product Gap 12 集成测试通过。

---

## 7. 非目标

- 不做前端 UI。
- 不做分页 / 排序参数。
- 不做全文检索或语义检索。
- 不做 embedding、向量库或 LLM rerank。
- 不做状态修改。
- 不写 audit。

---

## 8. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Pagination | source / entry inventory 增加分页与总数 |
| Query filter | 支持 name/title/tag/body 的管理面查询 |
| Update metadata | 支持 source / entry 元数据更新 |
| Bulk operations | 批量归档 / 恢复 |
| UI | 知识库 source / entry 管理页 |
