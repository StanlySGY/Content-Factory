/* eslint-disable */
// 0018 — 执行层 Phase 1.5（异步骨架加固）：execution_jobs 生命周期字段 + outbox 中继字段。
//
// 设计要点（仍与控制平面完全隔离，无 project_id/无 FK/不与业务表 join）：
//   - max_attempts/last_error/next_run_at/finished_at 支撑：重试上限、失败诊断、退避调度、终态时刻。
//   - next_run_at 为 NULL 或 <= now() 方可领取 → 退避窗口内不被 claim（部分索引 idx_..._claimable）。
//   - locked_at + status='running' 用于 stale-lock 恢复（部分索引 idx_..._stale）。
//   - outbox_events 增 error/retry_count：为 Phase 2 relay 消费预留（当前不消费）。
//   - 列继承 0017 表级 GRANT（cf_app S/I/U；cf_audit_reader S），无需新增 grants 迁移。

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE execution_jobs
      ADD COLUMN max_attempts integer NOT NULL DEFAULT 3,
      ADD COLUMN last_error   text,
      ADD COLUMN next_run_at  timestamptz,
      ADD COLUMN finished_at  timestamptz;
    ALTER TABLE execution_jobs
      ADD CONSTRAINT execution_jobs_max_attempts_chk CHECK (max_attempts > 0);

    -- 可领取作业（pending 且到期）拉取索引
    CREATE INDEX idx_execution_jobs_claimable ON execution_jobs (next_run_at) WHERE status = 'pending';
    -- stale running 恢复扫描索引
    CREATE INDEX idx_execution_jobs_stale ON execution_jobs (locked_at) WHERE status = 'running';

    ALTER TABLE outbox_events
      ADD COLUMN error       text,
      ADD COLUMN retry_count integer NOT NULL DEFAULT 0;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_execution_jobs_claimable;
    DROP INDEX IF EXISTS idx_execution_jobs_stale;
    ALTER TABLE execution_jobs
      DROP CONSTRAINT IF EXISTS execution_jobs_max_attempts_chk,
      DROP COLUMN IF EXISTS max_attempts,
      DROP COLUMN IF EXISTS last_error,
      DROP COLUMN IF EXISTS next_run_at,
      DROP COLUMN IF EXISTS finished_at;
    ALTER TABLE outbox_events
      DROP COLUMN IF EXISTS error,
      DROP COLUMN IF EXISTS retry_count;
  `);
};
