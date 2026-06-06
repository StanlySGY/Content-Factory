/* eslint-disable */
// 0014 — MCP 壳层（Sprint-4.2）：mcp_servers 配置 + mcp_tools + tool_invocations 调用日志。
//
// 设计要点（仅配置 + 观测，无真实调用/Runtime）：
//   - mcp_servers：项目级 MCP Server 配置；status 闭集 active/disabled/archived；risk_level 闭集 low/medium/high。
//   - mcp_tools：Server 下挂 Tool；manifest 为 jsonb 声明；enabled 布尔开关。
//   - tool_invocations：只追加调用日志（与 asset_versions/agent_sessions 一致）——状态于插入时定稿，
//     DB 级 append-only 由 0015 grants 落地（撤 cf_app U/D）。request/response_snapshot 为快照。
//   - FK 全部 ON DELETE RESTRICT；created_by uuid FK users（引用完整性，对齐既有约定）。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE mcp_servers (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
      name        varchar(160) NOT NULL,
      description text,
      endpoint    text NOT NULL,
      status      varchar(32) NOT NULL DEFAULT 'active',
      risk_level  varchar(16) NOT NULL DEFAULT 'low',
      created_by  uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      created_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT mcp_servers_status_chk CHECK (status IN ('active','disabled','archived')),
      CONSTRAINT mcp_servers_risk_chk   CHECK (risk_level IN ('low','medium','high'))
    );
    CREATE INDEX idx_mcp_servers_project        ON mcp_servers (project_id);
    CREATE INDEX idx_mcp_servers_status         ON mcp_servers (status);
    CREATE INDEX idx_mcp_servers_risk           ON mcp_servers (risk_level);
    CREATE INDEX idx_mcp_servers_project_status ON mcp_servers (project_id, status);

    CREATE TABLE mcp_tools (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mcp_server_id uuid NOT NULL REFERENCES mcp_servers (id) ON DELETE RESTRICT,
      name          varchar(160) NOT NULL,
      description   text,
      manifest      jsonb NOT NULL DEFAULT '{}'::jsonb,
      enabled       boolean NOT NULL DEFAULT true,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_mcp_tools_server  ON mcp_tools (mcp_server_id);
    CREATE INDEX idx_mcp_tools_enabled ON mcp_tools (enabled);

    CREATE TABLE tool_invocations (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id        uuid NOT NULL REFERENCES projects (id)       ON DELETE RESTRICT,
      mcp_server_id     uuid NOT NULL REFERENCES mcp_servers (id)    ON DELETE RESTRICT,
      mcp_tool_id       uuid NOT NULL REFERENCES mcp_tools (id)      ON DELETE RESTRICT,
      agent_profile_id  uuid REFERENCES agent_profiles (id)         ON DELETE RESTRICT,  -- 可空
      status            varchar(32) NOT NULL,
      request_snapshot  jsonb NOT NULL,
      response_snapshot jsonb NOT NULL,
      created_by        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      created_at        timestamptz NOT NULL DEFAULT now(),  -- 只追加：状态于插入时定稿
      CONSTRAINT tool_invocations_status_chk CHECK (status IN ('success','failed','blocked'))
    );
    CREATE INDEX idx_tool_invocations_project ON tool_invocations (project_id);
    CREATE INDEX idx_tool_invocations_server  ON tool_invocations (mcp_server_id);
    CREATE INDEX idx_tool_invocations_tool    ON tool_invocations (mcp_tool_id);
    CREATE INDEX idx_tool_invocations_status  ON tool_invocations (status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS tool_invocations CASCADE;
    DROP TABLE IF EXISTS mcp_tools CASCADE;
    DROP TABLE IF EXISTS mcp_servers CASCADE;
  `);
};
