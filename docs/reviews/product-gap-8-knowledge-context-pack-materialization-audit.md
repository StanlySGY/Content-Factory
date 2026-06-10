# Product Gap 8 — Knowledge Context Pack Materialization Backend MVP（审计）

> 范围：在 Product Gap 4 的 Knowledge/RAG Backend MVP 和既有 `context_packs` 之上，新增手动触发的知识上下文包物化 API。
> 一句话目标：**让系统可以把关键词命中的 knowledge entries 固化为 task 级 `context_packs`，为后续 RAG / Agent 输入上下文提供可追溯材料；当前不做 embedding、不调用 LLM、不做 UI。**

---

## 1. 落地范围

新增能力：

- task 级知识上下文包物化
- 关键词检索 active knowledge entries
- 将命中 entries 写入 `context_packs.data.knowledge_entries`
- 将 entry/source ids 写入 `context_packs.source_refs`

复用既有表：

- `knowledge_sources`
- `knowledge_entries`
- `context_packs`
- `content_tasks`

扩展模块：

- `domain/context-pack/context-pack.ts`
- `application/context-pack.service.ts`
- `interfaces/http/routes/context-packs.ts`
- `packages/shared/src/schemas.ts`

无新增 DB 迁移。

---

## 2. 架构图

```text
POST /api/tasks/:taskId/knowledge-context-pack
  body: { q, limit?, version }
    -> ContextPackService.materializeKnowledgeContextPack()
      -> runInProject(project_id)
      -> assert content_task exists in project
      -> search active knowledge_entries by keyword
      -> buildKnowledgeContextPackPayload()
      -> createContextPack(scope='task', sensitivity='internal')
      -> insert context_packs
```

事务边界：

- task 校验、知识检索、payload 构造、context_pack 创建在同一个 project-scoped transaction 中完成。
- 物化只写 `context_packs`，不回写 knowledge 记录。

---

## 3. API

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/tasks/:taskId/knowledge-context-pack` | 把关键词命中的 knowledge entries 物化为 task 级 context pack |

Request：

```json
{
  "q": "wechat",
  "limit": 5,
  "version": 1
}
```

Response：既有 `ContextPackSchema`。

核心字段：

```json
{
  "content_task_id": "uuid",
  "stage_run_id": null,
  "version": 1,
  "scope": "task",
  "sensitivity_level": "internal",
  "data": {
    "materialized_from": "knowledge_entries",
    "query": "wechat",
    "knowledge_entries": [
      { "id": "uuid", "title": "Publishing rules", "reason": "keyword_match" }
    ]
  },
  "source_refs": {
    "knowledge_entry_ids": ["uuid"],
    "knowledge_source_ids": ["uuid"]
  }
}
```

错误语义：

- unknown task：`404`
- no matched active candidates：`404`
- invalid body：`400`
- duplicate task-scope version：沿用 context pack unique guard，`409`

---

## 4. 规则语义

- 只检索当前 project 的 active `knowledge_entries`。
- archived source 下的 entries 不参与物化。
- `q` 使用既有 keyword matching 规则。
- `limit` 沿用 knowledge search 限制：默认 10，范围 1-50。
- 物化结果固定为 task scope：
  - `scope = task`
  - `stage_run_id = null`
  - `sensitivity_level = internal`
- `version` 由调用方显式传入，便于后续用 context pack version 表达重新物化。

---

## 5. 边界

- 不调用 embedding。
- 不调用 LLM。
- 不做 rerank。
- 不创建或修改 `context_packs` 之外的业务状态。
- 不改 `knowledge_sources` / `knowledge_entries`。
- 不写 `audit_events`。
- 不触碰 Workflow / Review / Agent / MCP / Publisher 状态机。
- 不做 UI。

---

## 6. 非目标

- 不做向量库。
- 不做语义检索。
- 不做 context pack 自动刷新。
- 不做 stage 级物化。
- 不做 Agent 自动消费。
- 不做跨项目权限 enforcement。
- 不做 materialization history 独立表。

---

## 7. 后续路线

| 后续项 | 说明 |
| --- | --- |
| Embedding backend | 为 knowledge entries 生成向量索引 |
| Vector search | 用向量召回替代或补充 keyword matching |
| LLM rerank | 对候选知识进行语义重排 |
| Stage materialization | 支持 stage scoped context pack |
| Agent consumption | 在 execution bridge/runtime 中读取 context pack |
| UI | 任务详情中选择知识条目并物化上下文 |

---

## 8. 验证

新增/扩展测试：

- `apps/api/test/integration/product-gap-8-knowledge-context-pack-api.test.ts`
- 扩展 `apps/api/test/unit/context-pack.test.ts`

覆盖：

- keyword candidates 可物化为 task-scoped context pack
- `data.knowledge_entries` 和 `source_refs` 可追溯
- 物化后可通过 task context packs 列表读取
- unknown task 返回 `404`
- empty candidate set 返回 `404`
- 物化不修改 knowledge entries
- domain payload builder 去重 source ids
