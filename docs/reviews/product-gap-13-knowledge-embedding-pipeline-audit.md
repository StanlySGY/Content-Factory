# Product Gap 13 — Knowledge Embedding Pipeline Backend MVP（审计）

> 范围：在 Knowledge/RAG 后端 MVP、inventory read API 与 context pack materialization 之上，补齐本地 deterministic embedding snapshot 管线。
> 一句话目标：**让新建 active knowledge entry 在同事务内生成可追溯 embedding snapshot，并提供覆盖率 readiness；当前不调用外部模型、不接真实 vector index、不做 LLM rerank、不自动刷新 context pack。**

---

## 1. 落地范围

新增表：

- `knowledge_entry_embeddings`

新增后端模块：

- `domain/knowledge/embedding.ts`

扩展模块：

- `infrastructure/db/schema.ts`
- `infrastructure/repositories/knowledge.repository.ts`
- `application/knowledge.service.ts`
- `interfaces/http/routes/knowledge.ts`
- `packages/shared/src/schemas.ts`
- `application/execution-ops.service.ts`

新增迁移：

- `db/migrations/0032_knowledge_embedding_pipeline.js`

---

## 2. 数据模型

`knowledge_entry_embeddings` 字段：

| 字段 | 说明 |
| --- | --- |
| `id` | embedding snapshot ID |
| `project_id` | 项目隔离维度 |
| `knowledge_entry_id` | 关联 knowledge entry |
| `provider` | 当前为 `local_hash_v1` |
| `dimensions` | 当前为 `16` |
| `vector` | JSONB 数组，长度必须等于 dimensions |
| `text_hash` | 标准化文本 SHA-256 |
| `status` | `active` / `stale` |
| `generated_at` | 生成时间 |

关键约束：

- `(knowledge_entry_id, provider)` 唯一。
- `dimensions > 0`。
- `vector` 必须为 JSON array，且长度等于 `dimensions`。
- `text_hash` 必须为 64 位十六进制 SHA-256。
- `cf_app` 可 `SELECT, INSERT, UPDATE`，不可 `DELETE`。

---

## 3. API

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/knowledge/embedding-readiness` | 返回当前 project active knowledge entries 的 embedding 覆盖率 |

响应要点：

- `mode = knowledge_embedding_readiness`
- `provider = local_hash_v1`
- `dimensions = 16`
- `external_calls_performed = false`
- `vector_index_integrated = false`
- `ready = missing_embeddings === 0`

---

## 4. 架构图

```text
POST /api/knowledge/sources/:id/entries
  -> KnowledgeService.createEntry()
    -> runInProject(project_id)
      -> repository.createEntry()
      -> buildLocalKnowledgeEmbedding(title, body, tags)
      -> repository.createEntryEmbedding()

GET /api/knowledge/embedding-readiness
  -> KnowledgeService.getEmbeddingReadiness()
    -> repository.getEmbeddingCoverage(project_id, provider)
```

创建 entry 与 embedding snapshot 在同一事务内完成；如果 embedding 写入失败，entry 创建也回滚。

---

## 5. 边界

- 不调用 OpenAI、Claude、Gemini 或其他外部 embedding provider。
- 不建立 pgvector / Milvus / Pinecone / Weaviate 等真实 vector index。
- 不改变 keyword search、task candidates 或 context pack materialization 的排序语义。
- 不做 LLM rerank。
- 不自动刷新已经物化的 context pack。
- 不做批量 backfill 任务；本阶段覆盖新建 entry。
- 不做 Web UI。

---

## 6. 测试覆盖

新增测试：

- `apps/api/test/integration/product-gap-13-knowledge-embedding-api.test.ts`

更新测试：

- `apps/api/test/integration/product-route-readiness-api.test.ts`

覆盖场景：

- 新建 active knowledge entries 后，readiness 返回 ready。
- active entries 总数与 embedded active entries 一致。
- 响应显式声明本地 provider、维度、无外部调用、未集成真实 vector index。
- product route readiness 将 embedding pipeline 从 missing requirements 移到 delivered capabilities。

TDD 记录：

- RED：先新增 Product Gap 13 集成测试，`/api/knowledge/embedding-readiness` 未实现时失败。
- GREEN：补迁移、schema、repository、service、route 与本地 embedding 生成后，Product Gap 13 测试通过。

---

## 7. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Backfill job | 为历史 active entries 补齐 embedding snapshot，并标记 stale/active |
| Vector index | 将 snapshot 同步到 pgvector 或外部向量库，提供语义召回 |
| Hybrid retrieval | keyword + vector + source/recency weighting |
| LLM rerank | 在 runtime gate、成本和审计边界齐备后接入 reranker |
| Context refresh | entry/source 变化后按策略自动刷新或提示刷新 context pack |
