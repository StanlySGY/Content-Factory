/* eslint-disable */
// 0021 — Execution Phase 2.17：outbox relay 持久 claim lease readiness。
//
// 设计要点：
//   - claimed_at / claimed_owner / claim_expires_at 让 relay claim 从事务内临时锁升级为可观测、可恢复租约。
//   - 未处理且无有效租约，或租约过期的事件可被 claim。
//   - processed/failed 后由 repository 清空租约，避免 stale owner 阻塞后续重试。
//   - 不引入 MQ/Redis，不回写控制面，不改变 audit_events。

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE outbox_events
      ADD COLUMN claimed_at timestamptz,
      ADD COLUMN claimed_owner varchar(120),
      ADD COLUMN claim_expires_at timestamptz;

    CREATE INDEX idx_outbox_claimable
      ON outbox_events (claim_expires_at, created_at)
      WHERE processed_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_outbox_claimable;
    ALTER TABLE outbox_events
      DROP COLUMN IF EXISTS claimed_at,
      DROP COLUMN IF EXISTS claimed_owner,
      DROP COLUMN IF EXISTS claim_expires_at;
  `);
};
