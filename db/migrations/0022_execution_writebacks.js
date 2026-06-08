/* eslint-disable */
// 0022 — Execution Phase 2.18：writeback ledger / idempotent consumer readiness。
//
// 设计要点：
//   - execution_writebacks 仅记录 execution relay writeback readiness 的 disabled no-op plan。
//   - 通过 idempotency_key UNIQUE 保证 terminal outbox 重复投递只生成一条消费记录。
//   - 仅 FK execution_results / execution_jobs / outbox_events；不 FK stage_runs/assets/reviews。
//   - 当前不真实回写控制面，不写 audit_events，不引入 MQ/Redis。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE execution_writebacks (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key     varchar(200) NOT NULL,
      outbox_event_id     uuid NOT NULL REFERENCES outbox_events(id),
      execution_result_id uuid NOT NULL REFERENCES execution_results(id),
      execution_job_id    uuid NOT NULL REFERENCES execution_jobs(id),
      subject_type        varchar(80) NOT NULL,
      subject_id          varchar(200) NOT NULL,
      status              varchar(32) NOT NULL,
      plan                jsonb NOT NULL,
      error               text,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT execution_writebacks_idempotency_uniq UNIQUE (idempotency_key),
      CONSTRAINT execution_writebacks_status_chk CHECK (status IN ('planned','skipped','failed'))
    );

    CREATE INDEX idx_execution_writebacks_result ON execution_writebacks (execution_result_id);
    CREATE INDEX idx_execution_writebacks_subject ON execution_writebacks (subject_type, subject_id);
    CREATE INDEX idx_execution_writebacks_status ON execution_writebacks (status);
    CREATE INDEX idx_execution_writebacks_created_at ON execution_writebacks (created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_execution_writebacks_created_at;
    DROP INDEX IF EXISTS idx_execution_writebacks_status;
    DROP INDEX IF EXISTS idx_execution_writebacks_subject;
    DROP INDEX IF EXISTS idx_execution_writebacks_result;
    DROP TABLE IF EXISTS execution_writebacks;
  `);
};
