/* eslint-disable */
// 0028 — Product Gap 2：Publisher Platform Backend MVP。
//
// 设计要点：
//   - publisher_channels 是项目级发布渠道配置控制面。
//   - publish_records 创建时由应用层校验 channel 必须 active。
//   - 默认 seed wechat_mp，保持既有 publish_records API 兼容。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE publisher_channels (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      key          varchar(64) NOT NULL,
      display_name varchar(160) NOT NULL,
      status       varchar(32) NOT NULL DEFAULT 'active',
      endpoint_ref varchar(240),
      config       jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT publisher_channels_status_chk CHECK (status IN ('active','disabled','archived')),
      CONSTRAINT publisher_channels_key_chk CHECK (key ~ '^[a-z0-9][a-z0-9_:-]*$'),
      CONSTRAINT publisher_channels_display_name_chk CHECK (length(trim(display_name)) > 0),
      CONSTRAINT publisher_channels_config_object_chk CHECK (jsonb_typeof(config) = 'object'),
      CONSTRAINT publisher_channels_project_key_unique UNIQUE (project_id, key)
    );

    CREATE INDEX idx_publisher_channels_project_status ON publisher_channels(project_id, status);

    INSERT INTO publisher_channels (project_id, key, display_name, status, endpoint_ref, config, created_by)
      VALUES (
        '00000000-0000-0000-0000-000000000010',
        'wechat_mp',
        'WeChat Official Account',
        'active',
        'publisher://wechat',
        '{}'::jsonb,
        '00000000-0000-0000-0000-000000000001'
      )
      ON CONFLICT (project_id, key) DO NOTHING;

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON publisher_channels TO cf_app;
        REVOKE DELETE ON publisher_channels FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON publisher_channels TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS publisher_channels CASCADE;
  `);
};
