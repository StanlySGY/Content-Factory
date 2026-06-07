/* eslint-disable */
// 0016 — 执行层骨架（Sprint-5 Phase 1）：execution_jobs（可变生命周期）+ outbox_events。
//
// 设计要点（与控制平面完全隔离）：
//   - 独立 schema：无 project_id、无 FK、不与业务表 join；执行层为通用异步基座。
//   - execution_jobs 为可变作业（pending→running→success/failed），承载生命周期 → 允许 UPDATE（非 append-only）。
//     与控制平面的 append-only trace 表（asset_versions/review_records/agent_sessions/tool_invocations）分工不同。
//   - outbox_events：状态变更同事务写出箱（Phase 2 消费）；当前不消费。
//   - idempotency_key 唯一，支撑 at-least-once 队列去重。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE execution_jobs (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      type            varchar(32) NOT NULL,
      status          varchar(32) NOT NULL DEFAULT 'pending',
      payload         jsonb NOT NULL,
      idempotency_key varchar(200) NOT NULL,
      attempt_count   integer NOT NULL DEFAULT 0,
      locked_at       timestamptz,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT execution_jobs_type_chk   CHECK (type IN ('agent','mcp','publisher')),
      CONSTRAINT execution_jobs_status_chk CHECK (status IN ('pending','running','success','failed'))
    );
    CREATE UNIQUE INDEX idx_execution_jobs_idempotency ON execution_jobs (idempotency_key);
    CREATE INDEX idx_execution_jobs_status ON execution_jobs (status);
    CREATE INDEX idx_execution_jobs_type   ON execution_jobs (type);

    CREATE TABLE outbox_events (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      aggregate_type varchar(64)  NOT NULL,
      aggregate_id   uuid         NOT NULL,
      event_type     varchar(120) NOT NULL,
      payload        jsonb        NOT NULL,
      created_at     timestamptz  NOT NULL DEFAULT now(),
      processed_at   timestamptz
    );
    -- 未处理出箱事件的拉取索引（Phase 2 relay 用）
    CREATE INDEX idx_outbox_unprocessed ON outbox_events (created_at) WHERE processed_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS outbox_events CASCADE;
    DROP TABLE IF EXISTS execution_jobs CASCADE;
  `);
};
