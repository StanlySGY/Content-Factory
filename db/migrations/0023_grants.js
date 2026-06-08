/* eslint-disable */
// 0023 — 执行 writeback ledger 权限。
//   execution_writebacks 是 execution-side idempotent consumer ledger：
//   cf_app 可 S/I/U（失败标记需要 UPDATE），显式撤 DELETE；cf_audit_reader 只读。

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON execution_writebacks TO cf_app;
        REVOKE DELETE ON execution_writebacks FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON execution_writebacks TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        REVOKE ALL ON execution_writebacks FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        REVOKE ALL ON execution_writebacks FROM cf_audit_reader;
      END IF;
    END $$;
  `);
};
