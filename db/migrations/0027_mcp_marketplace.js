/* eslint-disable */
// 0027 — Product Gap 1：MCP Marketplace Backend MVP。
//
// 设计要点：
//   - entries 是本地 marketplace catalog，不执行任何外部 marketplace 网络发现。
//   - installations 绑定 project；卸载只做 status='uninstalled'，不删除历史。
//   - 同项目同 entry 同时最多一个 active install（installed/disabled）。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE mcp_marketplace_entries (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug       varchar(120) NOT NULL,
      manifest   jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT mcp_marketplace_entries_slug_unique UNIQUE (slug),
      CONSTRAINT mcp_marketplace_entries_slug_chk
        CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
      CONSTRAINT mcp_marketplace_entries_manifest_object_chk
        CHECK (jsonb_typeof(manifest) = 'object')
    );

    CREATE INDEX idx_mcp_marketplace_entries_created_at
      ON mcp_marketplace_entries (created_at DESC);

    CREATE TABLE mcp_marketplace_installations (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      entry_id      uuid NOT NULL REFERENCES mcp_marketplace_entries(id) ON DELETE RESTRICT,
      mcp_server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE RESTRICT,
      status        varchar(32) NOT NULL DEFAULT 'installed',
      installed_by  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      installed_at  timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT mcp_marketplace_installations_status_chk
        CHECK (status IN ('installed','disabled','uninstalled'))
    );

    CREATE INDEX idx_mcp_marketplace_installations_project
      ON mcp_marketplace_installations (project_id, installed_at DESC);
    CREATE INDEX idx_mcp_marketplace_installations_entry
      ON mcp_marketplace_installations (entry_id);
    CREATE INDEX idx_mcp_marketplace_installations_server
      ON mcp_marketplace_installations (mcp_server_id);
    CREATE UNIQUE INDEX idx_mcp_marketplace_installations_active_unique
      ON mcp_marketplace_installations (project_id, entry_id)
      WHERE status IN ('installed','disabled');

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON mcp_marketplace_entries, mcp_marketplace_installations TO cf_app;
        REVOKE DELETE ON mcp_marketplace_entries, mcp_marketplace_installations FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON mcp_marketplace_entries, mcp_marketplace_installations TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS mcp_marketplace_installations CASCADE;
    DROP TABLE IF EXISTS mcp_marketplace_entries CASCADE;
  `);
};
