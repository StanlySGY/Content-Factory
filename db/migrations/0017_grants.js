/* eslint-disable */
// 0017 — 执行层权限（承袭既有 grants 模式）
//   execution_jobs / outbox_events 为可变操作表（非 append-only trace）：cf_app S/I/U，撤 DELETE（软删除模型）。
//   cf_audit_reader：SELECT only。
//   角色不存在则跳过（provision.sql 前置）。

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON execution_jobs, outbox_events TO cf_app;
        REVOKE DELETE ON execution_jobs, outbox_events FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON execution_jobs, outbox_events TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        REVOKE ALL ON execution_jobs, outbox_events FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        REVOKE ALL ON execution_jobs, outbox_events FROM cf_audit_reader;
      END IF;
    END $$;
  `);
};
