/* eslint-disable */
// 0004 — 最小权限授权（ADR-008 写/读分离）
//   cf_app          : 业务表 S/I/U（无 DELETE，软删除 db §6.5）；audit_events 仅 S/I（无 U/D → append-only 权限层兜底）
//   cf_audit_reader : audit_events 仅 SELECT（审计读取身份）
// 角色不存在则跳过（provision.sql 为前置），保证迁移在缺角色环境不硬失败

exports.up = (pgm) => {
  pgm.sql(`
    REVOKE ALL ON audit_events FROM PUBLIC;
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT USAGE ON SCHEMA public TO cf_app;
        GRANT SELECT, INSERT, UPDATE ON users, projects, content_tasks TO cf_app;
        GRANT SELECT, INSERT ON audit_events TO cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT USAGE ON SCHEMA public TO cf_audit_reader;
        GRANT SELECT ON audit_events TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        REVOKE ALL ON users, projects, content_tasks, audit_events FROM cf_app;
        REVOKE USAGE ON SCHEMA public FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        REVOKE ALL ON audit_events FROM cf_audit_reader;
        REVOKE USAGE ON SCHEMA public FROM cf_audit_reader;
      END IF;
    END $$;
  `);
};
