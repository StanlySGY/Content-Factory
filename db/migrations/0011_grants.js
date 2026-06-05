/* eslint-disable */
// 0011 — review_records 最小权限（承袭 0009：asset_versions 只追加模式）
//   cf_app：仅 S/I，并显式撤回 U/D（DB 级 append-only，§9.2/§11）
//   cf_audit_reader：仅 S（审计只读）
//   角色不存在则跳过（provision.sql 为前置），保证迁移在缺角色环境不硬失败

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT ON review_records TO cf_app;
        REVOKE UPDATE, DELETE ON review_records FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON review_records TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        REVOKE ALL ON review_records FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        REVOKE ALL ON review_records FROM cf_audit_reader;
      END IF;
    END $$;
  `);
};
