/* eslint-disable */
// 0035 — Orchestrator 前置：workflow_stages 增 agent_profile_id 绑定字段。
// stage 定义时即可声明由哪个 agent 执行，Orchestrator 据此自动触发 execution。

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE workflow_stages
      ADD COLUMN agent_profile_id uuid REFERENCES agent_profiles(id) ON DELETE SET NULL;

    COMMENT ON COLUMN workflow_stages.agent_profile_id
      IS 'Optional default agent binding; Orchestrator auto-triggers execution when stage enters running';

    CREATE INDEX idx_workflow_stages_agent_profile ON workflow_stages(agent_profile_id)
      WHERE agent_profile_id IS NOT NULL;

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, UPDATE(agent_profile_id) ON workflow_stages TO cf_app;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_workflow_stages_agent_profile;
    ALTER TABLE workflow_stages DROP COLUMN IF EXISTS agent_profile_id;
  `);
};
