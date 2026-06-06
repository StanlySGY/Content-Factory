/* eslint-disable */
// 0015 — MCP 壳层最小权限（承袭 0013）
//   mcp_servers / mcp_tools：cf_app S/I/U 并撤 DELETE；cf_audit_reader S
//   tool_invocations：cf_app 仅 S/I 并撤 U/D（只追加日志，对齐 asset_versions/agent_sessions）；cf_audit_reader S
//   角色不存在则跳过（provision.sql 为前置）

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON mcp_servers, mcp_tools TO cf_app;
        REVOKE DELETE ON mcp_servers, mcp_tools FROM cf_app;
        GRANT SELECT, INSERT ON tool_invocations TO cf_app;
        REVOKE UPDATE, DELETE ON tool_invocations FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON mcp_servers, mcp_tools, tool_invocations TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        REVOKE ALL ON mcp_servers, mcp_tools, tool_invocations FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        REVOKE ALL ON mcp_servers, mcp_tools, tool_invocations FROM cf_audit_reader;
      END IF;
    END $$;
  `);
};
