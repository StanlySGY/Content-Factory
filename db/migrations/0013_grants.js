/* eslint-disable */
// 0013 — Agent 壳层最小权限（承袭 0009/0011）
//   agent_profiles：cf_app S/I/U（配置可更新）；cf_audit_reader S
//   agent_sessions：cf_app 仅 S/I 并撤回 U/D（执行记录只追加，对齐 asset_versions/review_records）；cf_audit_reader S
//   角色不存在则跳过（provision.sql 为前置）

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON agent_profiles TO cf_app;
        GRANT SELECT, INSERT ON agent_sessions TO cf_app;
        REVOKE UPDATE, DELETE ON agent_sessions FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON agent_profiles, agent_sessions TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        REVOKE ALL ON agent_profiles, agent_sessions FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        REVOKE ALL ON agent_profiles, agent_sessions FROM cf_audit_reader;
      END IF;
    END $$;
  `);
};
