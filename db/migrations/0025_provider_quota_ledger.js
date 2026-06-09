/* eslint-disable */
// 0025 — Productization-P1 provider quota/cost ledger。
//
// 设计要点：
//   - execution plane 独立账本：不含 project_id、不 FK/不 join 业务表。
//   - 按 provider + key_ref + window_key(日) 聚合用量，供多实例共享限额。
//   - 可 UPDATE 是账本计数语义，不是 append-only 历史；execution_results 仍保留每次 attempt 历史。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE execution_provider_quota_ledger (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider        varchar(80) NOT NULL,
      key_ref         varchar(240) NOT NULL,
      window_key      varchar(10) NOT NULL,
      used_requests   integer NOT NULL DEFAULT 0,
      used_cost_cents integer NOT NULL DEFAULT 0,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT execution_provider_quota_nonnegative_chk
        CHECK (used_requests >= 0 AND used_cost_cents >= 0),
      CONSTRAINT execution_provider_quota_window_key_chk
        CHECK (window_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
      CONSTRAINT execution_provider_quota_scope_uniq
        UNIQUE (provider, key_ref, window_key)
    );
    CREATE INDEX idx_execution_provider_quota_provider_window
      ON execution_provider_quota_ledger (provider, window_key);
    CREATE INDEX idx_execution_provider_quota_key_ref
      ON execution_provider_quota_ledger (key_ref);

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON execution_provider_quota_ledger TO cf_app;
        REVOKE DELETE ON execution_provider_quota_ledger FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON execution_provider_quota_ledger TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS execution_provider_quota_ledger CASCADE;`);
};
