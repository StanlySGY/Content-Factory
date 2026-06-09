/* eslint-disable */
// 0030 — Product Gap 4：Knowledge/RAG Backend MVP。
//
// 设计要点：
//   - DB-first 知识库控制面：source + entry。
//   - 当前仅关键词检索，不引入向量库、不调用 LLM、不生成 embedding。
//   - 项目隔离显式落在 project_id；不改 context_packs / workflow / execution 行为。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE knowledge_sources (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      name        varchar(160) NOT NULL,
      source_type varchar(32) NOT NULL,
      uri         text,
      status      varchar(32) NOT NULL DEFAULT 'active',
      metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT knowledge_sources_type_chk CHECK (source_type IN ('document','url','note','dataset')),
      CONSTRAINT knowledge_sources_status_chk CHECK (status IN ('active','archived')),
      CONSTRAINT knowledge_sources_name_chk CHECK (length(trim(name)) > 0),
      CONSTRAINT knowledge_sources_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
    );
    CREATE INDEX idx_knowledge_sources_project_status ON knowledge_sources(project_id, status);
    CREATE INDEX idx_knowledge_sources_type ON knowledge_sources(source_type);

    CREATE TABLE knowledge_entries (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      source_id   uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
      title       varchar(240) NOT NULL,
      body        text NOT NULL,
      tags        jsonb NOT NULL DEFAULT '[]'::jsonb,
      status      varchar(32) NOT NULL DEFAULT 'active',
      metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT knowledge_entries_status_chk CHECK (status IN ('active','archived')),
      CONSTRAINT knowledge_entries_title_chk CHECK (length(trim(title)) > 0),
      CONSTRAINT knowledge_entries_body_chk CHECK (length(trim(body)) > 0),
      CONSTRAINT knowledge_entries_tags_array_chk CHECK (jsonb_typeof(tags) = 'array'),
      CONSTRAINT knowledge_entries_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
    );
    CREATE INDEX idx_knowledge_entries_project_status ON knowledge_entries(project_id, status);
    CREATE INDEX idx_knowledge_entries_source_status ON knowledge_entries(source_id, status);
    CREATE INDEX idx_knowledge_entries_created_at ON knowledge_entries(created_at DESC);

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON knowledge_sources, knowledge_entries TO cf_app;
        REVOKE DELETE ON knowledge_sources, knowledge_entries FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON knowledge_sources, knowledge_entries TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS knowledge_entries CASCADE;
    DROP TABLE IF EXISTS knowledge_sources CASCADE;
  `);
};
