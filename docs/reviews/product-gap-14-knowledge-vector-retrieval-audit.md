# Product Gap 14 — Knowledge Local Vector Retrieval Backend MVP（审计）

> 范围：在 Product Gap 13 的本地 embedding snapshot 之上，补齐只读本地 vector retrieval API。
> 一句话目标：**让后端可以基于 `local_hash_v1` embedding snapshot 返回 active knowledge entries 的相似候选；当前不调用外部模型、不建立生产级 vector index、不做 ANN、不做 LLM rerank、不自动刷新 context pack。**

---

## 1. 落地范围

新增 API：

- `GET /api/knowledge/vector-search?q=&limit=`

复用既有表：

- `knowledge_entries`
- `knowledge_sources`
- `knowledge_entry_embeddings`

扩展模块：

- `domain/knowledge/embedding.ts`
- `infrastructure/repositories/knowledge.repository.ts`
- `application/knowledge.service.ts`
- `application/mappers.ts`
- `interfaces/http/routes/knowledge.ts`
- `packages/shared/src/schemas.ts`
- `application/execution-ops.service.ts`

无新增 DB 迁移：本阶段只读取 Product Gap 13 已生成的 embedding snapshot。

---

## 2. API

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/knowledge/vector-search?q=&limit=` | 返回当前 project active knowledge entries 的本地向量相似候选 |

响应要点：

- `mode = knowledge_vector_search`
- `provider = local_hash_v1`
- `dimensions = 16`
- `external_calls_performed = false`
- `vector_index_integrated = false`
- item `reason = local_vector_similarity`
- item `similarity_score` 范围为 `-1..1`

---

## 3. 架构图

```text
GET /api/knowledge/vector-search?q=&limit=
  -> KnowledgeService.vectorSearch()
    -> buildLocalKnowledgeEmbedding(query)
    -> repository.listActiveEmbeddedEntries(project_id, provider)
      -> active knowledge_entries
      -> active knowledge_sources
      -> active knowledge_entry_embeddings
    -> calculateLocalKnowledgeVectorSimilarity()
    -> sort desc by similarity_score
```

---

## 4. 边界

- 不调用外部 embedding provider。
- 不建立 pgvector / Milvus / Pinecone / Weaviate 等生产级 vector index。
- 不做 ANN；当前是在应用层对本地 snapshot 做确定性相似度排序。
- 不改变 `/api/knowledge/search` 的 keyword search 语义。
- 不改变 `/api/tasks/:id/knowledge-candidates` 的 keyword candidate 语义。
- 不做 LLM rerank。
- 不自动刷新 context pack。
- 不做 Web UI。

---

## 5. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-14-knowledge-vector-retrieval-api.test.ts`

更新测试：

- `apps/api/test/integration/product-route-readiness-api.test.ts`

覆盖场景：

- `/api/knowledge/vector-search` 返回 active embedded entries。
- 返回项按 `similarity_score` 降序排列。
- archived entry 不返回。
- 响应显式声明本地 provider、维度、无外部调用、未集成生产 vector index。
- product route readiness 将本地 vector retrieval 纳入 delivered capabilities，并保留生产级 vector index / LLM rerank / 自动刷新为缺口。

TDD 记录：

- RED：先新增 Product Gap 14 集成测试，`/api/knowledge/vector-search` 未实现时返回 `404`。
- GREEN：补 schema / repository / service / mapper / route 后，Product Gap 14 集成测试通过。

---

## 6. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Production vector index | 接入 pgvector 或外部向量库，避免应用层全量扫描 |
| Hybrid retrieval | keyword + vector + source/recency weighting |
| Task candidates integration | 明确何时把 vector retrieval 合并进 task candidates |
| LLM rerank | 在 runtime gate、成本和审计边界齐备后接入 reranker |
| Context refresh | entry/source 变化后按策略自动刷新或提示刷新 context pack |
