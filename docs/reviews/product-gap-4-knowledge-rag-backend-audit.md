# Product Gap 4 — Knowledge/RAG Backend MVP（审计）

> 范围：新增 Knowledge/RAG 后端最小控制面，为内容调研、上下文候选和未来 RAG 接入建立 DB-first 基础。
> 一句话目标：**让系统可以保存知识源与知识条目，并用确定性关键词检索返回任务上下文候选；当前不引入向量库、不调用 LLM、不自动生成 context pack。**

---

## 1. 落地范围

新增表：

- `knowledge_sources`
- `knowledge_entries`

新增后端模块：

- `domain/knowledge/knowledge.ts`
- `application/knowledge.service.ts`
- `infrastructure/repositories/knowledge.repository.ts`
- `interfaces/http/routes/knowledge.ts`

新增共享契约：

- KnowledgeSource / KnowledgeEntry DTO
- create source / create entry request schema
- knowledge search query / response schema
- task knowledge candidates response schema

---

## 2. 架构图

```text
HTTP /api/knowledge/*
  -> KnowledgeService
    -> Knowledge Domain Rules
    -> KnowledgeRepository
      -> knowledge_sources
      -> knowledge_entries

HTTP /api/tasks/:id/knowledge-candidates
  -> KnowledgeService
    -> assert task belongs to current project
    -> keyword search active knowledge entries
```

本阶段不接入：

- vector database
- embedding pipeline
- LLM reranker
- MCP search tool
- context_packs 自动写入

---

## 3. API

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/knowledge/sources` | 创建知识源 |
| `POST` | `/api/knowledge/sources/:id/entries` | 在 active source 下创建知识条目 |
| `POST` | `/api/knowledge/sources/:id/archive` | 归档知识源 |
| `GET` | `/api/knowledge/search?q=&limit=` | 项目内关键词检索 active 条目 |
| `GET` | `/api/tasks/:id/knowledge-candidates?q=&limit=` | 为任务返回候选知识条目 |

---

## 4. 检索语义

当前检索是确定性关键词匹配：

- `title ILIKE`
- `body ILIKE`
- `tags::text ILIKE`
- 只返回 active source + active entry
- project_id 显式隔离
- 返回 reason 固定为 `keyword_match`

这保证测试稳定、无外部依赖，也为后续 embedding/rerank 留出替换点。

---

## 5. 状态与约束

KnowledgeSource:

- `source_type`: `document | url | note | dataset`
- `status`: `active | archived`

KnowledgeEntry:

- `status`: `active | archived`
- `title` / `body` 非空
- `tags` 为 JSON array
- `metadata` 为 JSON object

归档 source 后：

- source status 变为 `archived`
- 不允许新增 entry，返回 `409`
- 既有 entry 不删除、不级联归档
- 搜索不返回 archived source 下的 entry

---

## 6. 非目标

- 不做真实 RAG。
- 不做 embedding。
- 不做向量库。
- 不调用 LLM。
- 不自动生成或修改 `context_packs`。
- 不改 Workflow / Review / Agent / MCP / Execution / RBAC 状态机。
- 不做前端 UI。
- 不做文件上传、网页抓取、外部知识源同步。

---

## 7. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Embedding pipeline | 为 knowledge_entries 生成 embedding，写入独立索引或向量库 |
| Hybrid retrieval | keyword + vector + recency/source weighting |
| Rerank | LLM 或本地 reranker，必须受 runtime safety gate 控制 |
| Context pack materialization | 将候选条目显式写入 context_packs，保留来源引用 |
| Source ingestion | 文件/URL/第三方知识源导入、去重、分块 |
| UI | 知识库管理、搜索、任务候选选择 |

---

## 8. 验证

新增集成测试：

- `apps/api/test/integration/product-gap-4-knowledge-api.test.ts`

覆盖：

- 创建 knowledge source
- 创建 knowledge entry
- 关键词搜索 active entries
- 任务上下文候选查询
- source archive 后禁止新增 entry

