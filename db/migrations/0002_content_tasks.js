/* eslint-disable */
// 0002 — content_tasks（db §5.3 + 索引 §7.1；status S1 子集 roadmap §4.3）

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE content_tasks (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id       uuid NOT NULL REFERENCES projects (id),
      title            varchar(240) NOT NULL,
      content_type     varchar(64)  NOT NULL,
      priority         varchar(32)  NOT NULL,
      status           varchar(32)  NOT NULL DEFAULT 'draft',
      owner_id         uuid REFERENCES users (id),
      requirement_data jsonb        NOT NULL,
      due_at           timestamptz,
      created_at       timestamptz  NOT NULL DEFAULT now(),
      updated_at       timestamptz  NOT NULL DEFAULT now(),
      archived_at      timestamptz,
      CONSTRAINT content_tasks_status_chk
        CHECK (status IN ('draft','ready','running','completed','cancelled','archived')),
      CONSTRAINT content_tasks_priority_chk
        CHECK (priority IN ('low','normal','high','urgent'))
    );
    CREATE INDEX idx_content_tasks_project_status_updated
      ON content_tasks (project_id, status, updated_at DESC);
    CREATE INDEX idx_content_tasks_owner_status
      ON content_tasks (owner_id, status);
    CREATE INDEX idx_content_tasks_due_at
      ON content_tasks (due_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS content_tasks;`);
};
