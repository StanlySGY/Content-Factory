/* eslint-disable */
// 0019 — 执行结果账本（Sprint-5 Phase 1.9）：execution_results（只追加）。
//
// 设计要点（仍与控制平面隔离）：
//   - 每次 runtime attempt 一条记录：request/response/subject 快照 + 错误分类 + 耗时 + retryable + 最终结果。
//   - append-only：无 UPDATE/DELETE（授权见 0020）。仅 FK 到 execution_jobs（同属 execution plane）；不 FK 业务表。
//   - 不写 project_id 独立列（subject_snapshot 内可含）；不与业务表 join。
//   - unique(execution_job_id, attempt_no)：一次尝试一条，幂等且可回放。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE execution_results (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      execution_job_id  uuid NOT NULL REFERENCES execution_jobs(id),
      attempt_no        integer NOT NULL,
      job_type          varchar(32) NOT NULL,
      status            varchar(16) NOT NULL,
      runtime_status    varchar(16) NOT NULL,
      error_type        varchar(32),
      retryable         boolean NOT NULL,
      duration_ms       integer NOT NULL,
      request_snapshot  jsonb NOT NULL,
      response_snapshot jsonb NOT NULL,
      subject_snapshot  jsonb,
      created_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT execution_results_status_chk         CHECK (status IN ('success','failed')),
      CONSTRAINT execution_results_runtime_status_chk CHECK (runtime_status IN ('success','failed')),
      CONSTRAINT execution_results_attempt_chk        CHECK (attempt_no >= 1),
      CONSTRAINT execution_results_duration_chk       CHECK (duration_ms >= 0),
      CONSTRAINT execution_results_job_attempt_uniq   UNIQUE (execution_job_id, attempt_no)
    );
    CREATE INDEX idx_execution_results_job        ON execution_results (execution_job_id);
    CREATE INDEX idx_execution_results_job_type   ON execution_results (job_type);
    CREATE INDEX idx_execution_results_status     ON execution_results (status);
    CREATE INDEX idx_execution_results_error_type ON execution_results (error_type);
    CREATE INDEX idx_execution_results_created_at ON execution_results (created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS execution_results CASCADE;`);
};
