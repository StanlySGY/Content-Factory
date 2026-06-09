/* eslint-disable */
// 0031 — Product Gap 5：Agent Evaluation Backend MVP。
//
// 设计要点：
//   - 对 execution_results 写独立评价账本，不修改 execution_results append-only 语义。
//   - 当前仅人工/规则评价，不调用 LLM、不做自动评测、不回写控制平面。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE execution_result_evaluations (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      execution_result_id uuid NOT NULL REFERENCES execution_results(id) ON DELETE RESTRICT,
      execution_job_id    uuid NOT NULL REFERENCES execution_jobs(id) ON DELETE RESTRICT,
      evaluator_type      varchar(32) NOT NULL,
      quality_score       integer NOT NULL,
      cost_score          integer NOT NULL,
      latency_score       integer NOT NULL,
      notes               text,
      tags                jsonb NOT NULL DEFAULT '[]'::jsonb,
      evaluated_by        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT execution_result_evaluations_type_chk CHECK (evaluator_type IN ('human','rule')),
      CONSTRAINT execution_result_evaluations_quality_chk CHECK (quality_score BETWEEN 0 AND 100),
      CONSTRAINT execution_result_evaluations_cost_chk CHECK (cost_score BETWEEN 0 AND 100),
      CONSTRAINT execution_result_evaluations_latency_chk CHECK (latency_score BETWEEN 0 AND 100),
      CONSTRAINT execution_result_evaluations_tags_array_chk CHECK (jsonb_typeof(tags) = 'array'),
      CONSTRAINT execution_result_evaluations_result_type_unique UNIQUE (execution_result_id, evaluator_type)
    );
    CREATE INDEX idx_execution_result_evaluations_result ON execution_result_evaluations(execution_result_id);
    CREATE INDEX idx_execution_result_evaluations_job ON execution_result_evaluations(execution_job_id);
    CREATE INDEX idx_execution_result_evaluations_type ON execution_result_evaluations(evaluator_type);
    CREATE INDEX idx_execution_result_evaluations_created_at ON execution_result_evaluations(created_at DESC);

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT ON execution_result_evaluations TO cf_app;
        REVOKE UPDATE, DELETE ON execution_result_evaluations FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON execution_result_evaluations TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS execution_result_evaluations CASCADE;
  `);
};
