/* eslint-disable */
// 0034 — Product Gap 19：Agent evaluation billing-grade cost settlement ledger。
//
// 设计要点：
//   - 使用显式 rate card + execution_results token_usage 生成结算记录，不调用外部模型。
//   - append-only：只允许 INSERT/SELECT；不修改 execution_jobs、execution_results 或 evaluations。
//   - (execution_result_id, rate_card_version) 保证同一费率版本下幂等结算。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE execution_cost_settlements (
      id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      execution_result_id               uuid NOT NULL REFERENCES execution_results(id) ON DELETE RESTRICT,
      execution_job_id                  uuid NOT NULL REFERENCES execution_jobs(id) ON DELETE RESTRICT,
      provider                          varchar(80) NOT NULL,
      model                             varchar(120) NOT NULL,
      prompt_tokens                     integer NOT NULL,
      completion_tokens                 integer NOT NULL,
      total_tokens                      integer NOT NULL,
      prompt_micro_cents_per_token      integer NOT NULL,
      completion_micro_cents_per_token  integer NOT NULL,
      amount_micro_cents                bigint NOT NULL,
      amount_cents                      integer NOT NULL,
      currency                          varchar(12) NOT NULL,
      rate_card_version                 varchar(120) NOT NULL,
      settlement_source                 varchar(80) NOT NULL,
      created_at                        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT execution_cost_settlements_tokens_chk
        CHECK (prompt_tokens >= 0 AND completion_tokens >= 0 AND total_tokens >= prompt_tokens + completion_tokens),
      CONSTRAINT execution_cost_settlements_rates_chk
        CHECK (prompt_micro_cents_per_token >= 0 AND completion_micro_cents_per_token >= 0),
      CONSTRAINT execution_cost_settlements_amount_chk
        CHECK (amount_micro_cents >= 0 AND amount_cents >= 0),
      CONSTRAINT execution_cost_settlements_nonblank_chk
        CHECK (
          length(trim(provider)) > 0
          AND length(trim(model)) > 0
          AND length(trim(currency)) > 0
          AND length(trim(rate_card_version)) > 0
        ),
      CONSTRAINT execution_cost_settlements_source_chk
        CHECK (settlement_source IN ('explicit_rate_card_token_usage')),
      CONSTRAINT execution_cost_settlements_result_rate_unique
        UNIQUE (execution_result_id, rate_card_version)
    );
    CREATE INDEX idx_execution_cost_settlements_result ON execution_cost_settlements(execution_result_id);
    CREATE INDEX idx_execution_cost_settlements_job ON execution_cost_settlements(execution_job_id);
    CREATE INDEX idx_execution_cost_settlements_rate_card ON execution_cost_settlements(rate_card_version);
    CREATE INDEX idx_execution_cost_settlements_created_at ON execution_cost_settlements(created_at DESC);

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT ON execution_cost_settlements TO cf_app;
        REVOKE UPDATE, DELETE ON execution_cost_settlements FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON execution_cost_settlements TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS execution_cost_settlements CASCADE;`);
};
