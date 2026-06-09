/* eslint-disable */
// 0026 — Productization-P2.2 Publisher publish_records。
//
// 设计要点：
//   - 发布记录锚定 asset_version_id；版本不可变，更新由 DB trigger 拒绝。
//   - execution_job_id 可空，只有 publisher execution job 处理时回填。
//   - publish_records 是 Publisher 控制表，不回写 Workflow/Review 状态机。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE publish_records (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      content_task_id   uuid NOT NULL REFERENCES content_tasks(id),
      content_asset_id  uuid NOT NULL REFERENCES content_assets(id),
      asset_version_id  uuid NOT NULL REFERENCES asset_versions(id),
      execution_job_id  uuid REFERENCES execution_jobs(id),
      channel           varchar(64) NOT NULL,
      status            varchar(32) NOT NULL DEFAULT 'pending',
      external_ref      varchar(255),
      idempotency_key   varchar(200) NOT NULL UNIQUE,
      published_at      timestamptz,
      error_data        jsonb,
      metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT publish_records_status_chk
        CHECK (status IN ('pending','publishing','published','failed','withdrawn')),
      CONSTRAINT publish_records_channel_not_blank_chk
        CHECK (length(trim(channel)) > 0),
      CONSTRAINT publish_records_idempotency_key_not_blank_chk
        CHECK (length(trim(idempotency_key)) > 0),
      CONSTRAINT publish_records_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
      CONSTRAINT publish_records_error_data_object_chk
        CHECK (error_data IS NULL OR jsonb_typeof(error_data) = 'object')
    );

    CREATE INDEX idx_publish_records_task_channel ON publish_records(content_task_id, channel);
    CREATE INDEX idx_publish_records_asset_version ON publish_records(asset_version_id);
    CREATE INDEX idx_publish_records_status ON publish_records(status);
    CREATE INDEX idx_publish_records_execution_job ON publish_records(execution_job_id);

    CREATE OR REPLACE FUNCTION prevent_publish_record_asset_version_update()
    RETURNS trigger AS $$
    BEGIN
      IF OLD.asset_version_id IS DISTINCT FROM NEW.asset_version_id THEN
        RAISE EXCEPTION 'asset_version_id is immutable'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_publish_records_asset_version_immutable
      BEFORE UPDATE OF asset_version_id ON publish_records
      FOR EACH ROW
      EXECUTE FUNCTION prevent_publish_record_asset_version_update();

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON publish_records TO cf_app;
        REVOKE DELETE ON publish_records FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON publish_records TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_publish_records_asset_version_immutable ON publish_records;
    DROP FUNCTION IF EXISTS prevent_publish_record_asset_version_update();
    DROP TABLE IF EXISTS publish_records CASCADE;
  `);
};
