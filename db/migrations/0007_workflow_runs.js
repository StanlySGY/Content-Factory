/* eslint-disable */
// 0007 — 工作流运行层（db §5.6 / §5.7 + 索引 §7.1）
//
// 设计要点：
//   - 循环外键 Pair-2（C-2 实证）：workflow_runs.current_stage_run_id ↔ stage_runs.workflow_run_id。
//     顺序：先建两表（stage_runs.workflow_run_id 正向 NOT NULL FK + workflow_runs.current_stage_run_id 仅列）
//     → ALTER 补反向指针 FK 为 DEFERRABLE INITIALLY DEFERRED，支持同事务先插实例后回填当前阶段指针。
//   - 状态 CHECK 为 S2 子集（C-1 裁决 / review-gate-decision §5；仿 content_tasks S1 子集→后续单向扩展）：
//       workflow_runs：pending/running/completed/failed/terminated/archived（6/8，禁 waiting_review、revision_required → S3）
//       stage_runs   ：pending/running/waiting_review/approved/failed/skipped（6/7，禁 revision_required → S3）
//   - MJ-1 活跃实例唯一：同任务非终态实例至多一个（部分唯一索引）。
//   - MJ-5 乐观锁：updated_at 作为版本令牌（领域层校验，Step-3），列在此建模。
//   - agent_profile_id 按 ADR-020 / roadmap §5.3 仅保留列、暂不加 FK（agent_profiles 于 S4 建表后补）。
//   - RESTRICT 保护运行/血缘数据不被级联清除（§6.5/§11 精神）。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE workflow_runs (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      content_task_id        uuid NOT NULL REFERENCES content_tasks (id) ON DELETE RESTRICT,
      workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions (id) ON DELETE RESTRICT,
      workflow_version       integer NOT NULL,
      current_stage_run_id   uuid,                 -- Pair-2 指针，FK 于下方 ALTER 补充（DEFERRABLE）
      status                 varchar(32) NOT NULL DEFAULT 'pending',
      started_at             timestamptz,
      completed_at           timestamptz,
      created_at             timestamptz NOT NULL DEFAULT now(),
      updated_at             timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT workflow_runs_status_chk
        CHECK (status IN ('pending','running','completed','failed','terminated','archived')),
      CONSTRAINT workflow_runs_version_chk CHECK (workflow_version >= 1)
    );
    CREATE INDEX idx_workflow_runs_task_status ON workflow_runs (content_task_id, status);
    -- MJ-1：同任务非终态（pending/running/failed）实例至多一个
    CREATE UNIQUE INDEX idx_workflow_runs_active_unique
      ON workflow_runs (content_task_id)
      WHERE status NOT IN ('completed','terminated','archived');

    CREATE TABLE stage_runs (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_run_id     uuid NOT NULL REFERENCES workflow_runs (id) ON DELETE RESTRICT,
      workflow_stage_id   uuid NOT NULL REFERENCES workflow_stages (id) ON DELETE RESTRICT,
      agent_profile_id    uuid,                    -- ADR-020：仅列，agent_profiles S4 建表后补 FK
      parent_stage_run_id uuid REFERENCES stage_runs (id) ON DELETE RESTRICT,  -- 重做血缘（§5.7）
      status              varchar(32) NOT NULL DEFAULT 'pending',
      attempt_count       integer     NOT NULL DEFAULT 1,   -- 首次执行为 1（content-workflow §5.4）
      parallel_group      varchar(64),
      gate_result         jsonb,                   -- 门禁判定快照（§5.7）；schema_version 建议项，不强制
      started_at          timestamptz,
      completed_at        timestamptz,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT stage_runs_status_chk
        CHECK (status IN ('pending','running','waiting_review','approved','failed','skipped')),
      CONSTRAINT stage_runs_attempt_chk CHECK (attempt_count >= 1)
    );
    CREATE INDEX idx_stage_runs_workflow_status ON stage_runs (workflow_run_id, status);

    -- Pair-2 反向指针 FK（DEFERRABLE）：同事务先插 workflow_run 再插首 stage_run 后回填指针
    ALTER TABLE workflow_runs
      ADD CONSTRAINT workflow_runs_current_stage_run_fk
      FOREIGN KEY (current_stage_run_id) REFERENCES stage_runs (id)
      DEFERRABLE INITIALLY DEFERRED;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS stage_runs CASCADE;
    DROP TABLE IF EXISTS workflow_runs CASCADE;
  `);
};
