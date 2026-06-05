/* eslint-disable */
// 0010 — Sprint-3 评审层：review_records（只追加）+ content_assets.status 全集（roadmap §6 / db §5.x）
//
// 设计要点：
//   - review_records 只追加（与 asset_versions 一致）：无 updated_at；DB 级 append-only 由 0011 grants 落地（撤 cf_app U/D）。
//   - 全量评审历史：每次 approve / request_revision 各落一行，不更新旧行（审计追溯）。
//   - FK 全部 ON DELETE RESTRICT：保护评审血缘不随上游删除被级联清除（对齐 §11）。
//   - review_action 闭集 CHECK：approve / request_revision；退回必须指定目标阶段（target_stage_run_id）。
//   - content_assets.status 由 S2 子集 {draft,archived} 扩展为全集 {draft,review_pending,approved,rejected,stale,archived}
//     仅替换 CHECK（可逆）；列定义/默认值不变（roadmap §6）。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE review_records (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id          uuid NOT NULL REFERENCES projects (id)        ON DELETE RESTRICT,
      task_id             uuid NOT NULL REFERENCES content_tasks (id)   ON DELETE RESTRICT,
      workflow_run_id     uuid NOT NULL REFERENCES workflow_runs (id)   ON DELETE RESTRICT,
      stage_run_id        uuid NOT NULL REFERENCES stage_runs (id)      ON DELETE RESTRICT,
      asset_id            uuid REFERENCES content_assets (id)           ON DELETE RESTRICT,  -- 评审对象（可空）
      asset_version_id    uuid REFERENCES asset_versions (id)           ON DELETE RESTRICT,  -- 被评审版本（可空）
      reviewer_id         uuid NOT NULL REFERENCES users (id)           ON DELETE RESTRICT,
      review_action       varchar(32) NOT NULL,
      review_comment      text,                                                              -- 退回原因/审批意见
      target_stage_run_id uuid REFERENCES stage_runs (id)              ON DELETE RESTRICT,   -- 退回目标阶段
      created_at          timestamptz NOT NULL DEFAULT now(),                                -- 只追加：无 updated_at
      CONSTRAINT review_records_action_chk
        CHECK (review_action IN ('approve','request_revision')),
      -- 退回（request_revision）必须指定目标阶段（roadmap §6）
      CONSTRAINT review_records_revision_target_chk
        CHECK (review_action <> 'request_revision' OR target_stage_run_id IS NOT NULL)
    );
    CREATE INDEX idx_review_records_reviewer      ON review_records (reviewer_id);
    CREATE INDEX idx_review_records_stage_run     ON review_records (stage_run_id);
    CREATE INDEX idx_review_records_asset_version ON review_records (asset_version_id);
    CREATE INDEX idx_review_records_created_at    ON review_records (created_at);
    CREATE INDEX idx_review_records_task          ON review_records (task_id);
    CREATE INDEX idx_review_records_project       ON review_records (project_id);

    -- content_assets.status 扩展为全集（仅替换 CHECK，可逆）
    ALTER TABLE content_assets DROP CONSTRAINT content_assets_status_chk;
    ALTER TABLE content_assets ADD CONSTRAINT content_assets_status_chk
      CHECK (status IN ('draft','review_pending','approved','rejected','stale','archived'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- 还原 content_assets.status 为 S2 子集（清洁回滚前提：无新值残留）
    ALTER TABLE content_assets DROP CONSTRAINT content_assets_status_chk;
    ALTER TABLE content_assets ADD CONSTRAINT content_assets_status_chk
      CHECK (status IN ('draft','archived'));

    DROP TABLE IF EXISTS review_records CASCADE;
  `);
};
