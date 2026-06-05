/* eslint-disable */
// 0009 — Sprint-2 表最小权限授权（承袭 0004：ADR-008 写/读分离；§6.5 软删除 → 无 DELETE）
//   cf_app：7 张表 S/I/U（无 DELETE）；asset_versions 仅 S/I（无 U/D → append-only 权限层兜底，MJ-3/F5，对齐 audit_events 模式）
//   角色不存在则跳过（provision.sql 为前置），保证迁移在缺角色环境不硬失败

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON
          workflow_definitions, workflow_stages, workflow_stage_dependencies,
          workflow_runs, stage_runs, content_assets, context_packs
          TO cf_app;
        -- asset_versions 只追加：仅授 S/I，并显式撤回 U/D（DB 级 append-only，§9.2/§11）
        GRANT SELECT, INSERT ON asset_versions TO cf_app;
        REVOKE UPDATE, DELETE ON asset_versions FROM cf_app;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        REVOKE ALL ON
          workflow_definitions, workflow_stages, workflow_stage_dependencies,
          workflow_runs, stage_runs, content_assets, asset_versions, context_packs
          FROM cf_app;
      END IF;
    END $$;
  `);
};
