/* eslint-disable */
// 0032 — Product Gap 13：Knowledge embedding pipeline MVP。
//
// 设计要点：
//   - 仅生成本地 deterministic embedding snapshot，不调用外部模型。
//   - 向量先以 jsonb 数组持久化，作为后续真实 vector index 的可追溯输入。
//   - 按 project_id 隔离；不改变 keyword search、context pack 或 LLM rerank 行为。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE knowledge_entry_embeddings (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      knowledge_entry_id uuid NOT NULL REFERENCES knowledge_entries(id) ON DELETE RESTRICT,
      provider           varchar(80) NOT NULL,
      dimensions         integer NOT NULL,
      vector             jsonb NOT NULL,
      text_hash          varchar(64) NOT NULL,
      status             varchar(32) NOT NULL DEFAULT 'active',
      generated_at       timestamptz NOT NULL DEFAULT now(),
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT knowledge_entry_embeddings_dimensions_chk CHECK (dimensions > 0),
      CONSTRAINT knowledge_entry_embeddings_vector_chk
        CHECK (jsonb_typeof(vector) = 'array' AND jsonb_array_length(vector) = dimensions),
      CONSTRAINT knowledge_entry_embeddings_text_hash_chk CHECK (text_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT knowledge_entry_embeddings_status_chk CHECK (status IN ('active','stale')),
      CONSTRAINT knowledge_entry_embeddings_entry_provider_unique UNIQUE (knowledge_entry_id, provider)
    );
    CREATE INDEX idx_knowledge_entry_embeddings_project_provider
      ON knowledge_entry_embeddings(project_id, provider, status);
    CREATE INDEX idx_knowledge_entry_embeddings_entry
      ON knowledge_entry_embeddings(knowledge_entry_id);

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON knowledge_entry_embeddings TO cf_app;
        REVOKE DELETE ON knowledge_entry_embeddings FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON knowledge_entry_embeddings TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS knowledge_entry_embeddings CASCADE;`);
};
