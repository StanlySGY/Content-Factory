/* eslint-disable */
// 0020 — 执行结果账本权限（承袭 grants 模式）。
//   execution_results 为 append-only ledger：cf_app SELECT + INSERT，显式撤销 UPDATE/DELETE。
//   cf_audit_reader：SELECT only。角色不存在则跳过（provision.sql 前置）。

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT ON execution_results TO cf_app;
        REVOKE UPDATE, DELETE ON execution_results FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON execution_results TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        REVOKE ALL ON execution_results FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        REVOKE ALL ON execution_results FROM cf_audit_reader;
      END IF;
    END $$;
  `);
};
