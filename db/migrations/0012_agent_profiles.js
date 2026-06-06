/* eslint-disable */
// 0012 — Agent 壳层（Sprint-4.1）：agent_profiles 配置 + agent_sessions 模拟执行记录（ADR-5：仅 Session，不建 Message）。
//
// 设计要点：
//   - agent_profiles：项目级配置；status 闭集 active/disabled/archived（独立状态机，ADR-006，领域层 Step-2 落地）。
//   - agent_sessions：只追加执行记录（与 asset_versions / review_records 一致）——状态于插入时定稿，不就地流转；
//     DB 级 append-only 由 0013 grants 落地（撤 cf_app U/D）。profile_snapshot 固化配置快照（db §9.4）。
//   - created_by 采 uuid FK users（引用完整性，对齐既有 created_by/reviewer_id；非自由文本）。
//   - FK 全部 ON DELETE RESTRICT（保护配置/记录不被级联清除）。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE agent_profiles (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id   uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
      name         varchar(160) NOT NULL,
      description  text,
      status       varchar(32) NOT NULL DEFAULT 'active',
      capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
      constraints  jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      created_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT agent_profiles_status_chk CHECK (status IN ('active','disabled','archived'))
    );
    CREATE INDEX idx_agent_profiles_project        ON agent_profiles (project_id);
    CREATE INDEX idx_agent_profiles_status         ON agent_profiles (status);
    CREATE INDEX idx_agent_profiles_project_status ON agent_profiles (project_id, status);

    CREATE TABLE agent_sessions (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id       uuid NOT NULL REFERENCES projects (id)        ON DELETE RESTRICT,
      agent_profile_id uuid NOT NULL REFERENCES agent_profiles (id)  ON DELETE RESTRICT,
      status           varchar(32) NOT NULL DEFAULT 'pending',
      profile_snapshot jsonb NOT NULL,
      started_at       timestamptz NOT NULL DEFAULT now(),  -- 只追加：状态于插入时定稿
      completed_at     timestamptz,
      created_by       uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      CONSTRAINT agent_sessions_status_chk
        CHECK (status IN ('pending','running','completed','failed'))
    );
    CREATE INDEX idx_agent_sessions_profile ON agent_sessions (agent_profile_id);
    CREATE INDEX idx_agent_sessions_project ON agent_sessions (project_id);
    CREATE INDEX idx_agent_sessions_status  ON agent_sessions (status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS agent_sessions CASCADE;
    DROP TABLE IF EXISTS agent_profiles CASCADE;
  `);
};
