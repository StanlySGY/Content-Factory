/* eslint-disable */
// 0024 — Sprint-9 workflow_stage_run real writeback MVP.
//   Expand execution_writebacks.status with applied so the idempotent consumer
//   ledger can record exactly-once successful control-plane writeback.

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE execution_writebacks DROP CONSTRAINT execution_writebacks_status_chk;
    ALTER TABLE execution_writebacks
      ADD CONSTRAINT execution_writebacks_status_chk
      CHECK (status IN ('planned','applied','skipped','failed'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE execution_writebacks DROP CONSTRAINT execution_writebacks_status_chk;
    ALTER TABLE execution_writebacks
      ADD CONSTRAINT execution_writebacks_status_chk
      CHECK (status IN ('planned','skipped','failed'));
  `);
};
