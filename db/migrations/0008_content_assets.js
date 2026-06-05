/* eslint-disable */
// 0008 — 内容资产与上下文层（db §5.8 / §5.9 / §5.10 + 索引 §7.1）
//
// 设计要点：
//   - 循环外键 Pair-1（C-2 实证）：content_assets.current_version_id ↔ asset_versions.content_asset_id。
//     顺序：先建两表（asset_versions.content_asset_id 正向 NOT NULL FK + content_assets.current_version_id 仅列）
//     → ALTER 补反向指针 FK 为 DEFERRABLE INITIALLY DEFERRED。
//   - asset_versions 只追加（§6.5/§9.2/§11）：无 updated_at（永不修改）；DB 级 append-only 由 0009 grants 落地（撤 cf_app U/D）。
//   - content_assets.status 为 S2 子集 {draft,archived}（roadmap §5.3 / C-1）；其余值（review_pending/approved/rejected/stale）→ S3。
//   - asset_versions.content_asset_id → content_assets 用 RESTRICT，保护版本不随资产删除被级联清除（§11）。
//   - context_packs：task 级/stage 级两条部分唯一索引消除版本号键歧义（§5.8）；scope↔stage_run_id 一致性 CHECK。
//   - metadata 须含数值 schema_version（§6.4）；data/source_refs 为快照（schema_version 建议项，不强制）。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE content_assets (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      content_task_id    uuid NOT NULL REFERENCES content_tasks (id) ON DELETE RESTRICT,
      stage_run_id       uuid REFERENCES stage_runs (id) ON DELETE RESTRICT,  -- 来源阶段（血缘）
      asset_type         varchar(64)  NOT NULL,
      title              varchar(240) NOT NULL,
      status             varchar(32)  NOT NULL DEFAULT 'draft',
      current_version    integer      NOT NULL DEFAULT 0,  -- 展示冗余；权威指针为 current_version_id
      current_version_id uuid,                              -- Pair-1 指针，FK 于下方 ALTER 补充（DEFERRABLE）
      created_at         timestamptz  NOT NULL DEFAULT now(),
      updated_at         timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT content_assets_status_chk CHECK (status IN ('draft','archived')),
      CONSTRAINT content_assets_asset_type_chk
        CHECK (asset_type IN ('topic_brief','research_report','outline','draft',
                              'polished_draft','image_plan','image_asset','layout_draft'))
    );
    CREATE INDEX idx_content_assets_task_type ON content_assets (content_task_id, asset_type);

    CREATE TABLE asset_versions (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      content_asset_id    uuid NOT NULL REFERENCES content_assets (id) ON DELETE RESTRICT,
      version             integer      NOT NULL,
      storage_uri         text         NOT NULL,
      checksum            varchar(128) NOT NULL,
      metadata            jsonb        NOT NULL,
      source_stage_run_id uuid REFERENCES stage_runs (id) ON DELETE RESTRICT,  -- 分叉血缘（§5.10）
      created_by          uuid REFERENCES users (id) ON DELETE RESTRICT,       -- 系统生成可空
      created_at          timestamptz  NOT NULL DEFAULT now(),                 -- 只追加：无 updated_at
      CONSTRAINT asset_versions_version_chk CHECK (version >= 1),
      CONSTRAINT asset_versions_metadata_ver_chk
        CHECK ((metadata->>'schema_version') IS NOT NULL
               AND jsonb_typeof(metadata->'schema_version') = 'number')
    );
    -- (content_asset_id, version) 唯一（§7.1 idx_asset_versions_asset_version）
    CREATE UNIQUE INDEX idx_asset_versions_asset_version
      ON asset_versions (content_asset_id, version);

    -- Pair-1 反向指针 FK（DEFERRABLE）：同事务先插资产再插首版本后回填当前版本指针
    ALTER TABLE content_assets
      ADD CONSTRAINT content_assets_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES asset_versions (id)
      DEFERRABLE INITIALLY DEFERRED;

    CREATE TABLE context_packs (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      content_task_id   uuid NOT NULL REFERENCES content_tasks (id) ON DELETE RESTRICT,
      stage_run_id      uuid REFERENCES stage_runs (id) ON DELETE RESTRICT,
      version           integer     NOT NULL,
      scope             varchar(64) NOT NULL,
      data              jsonb       NOT NULL,
      source_refs       jsonb       NOT NULL,
      sensitivity_level varchar(32) NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT context_packs_version_chk CHECK (version >= 1),
      CONSTRAINT context_packs_scope_chk CHECK (scope IN ('task','stage','review')),
      CONSTRAINT context_packs_sensitivity_chk
        CHECK (sensitivity_level IN ('public','internal','sensitive')),
      -- §5.8：scope=stage → stage_run_id 非空；scope=task → stage_run_id 为空
      CONSTRAINT context_packs_scope_stage_chk
        CHECK ((scope <> 'stage' OR stage_run_id IS NOT NULL)
               AND (scope <> 'task' OR stage_run_id IS NULL))
    );
    -- task 级（stage_run_id 空）与 stage 级（stage_run_id 非空）两条部分唯一索引（§5.8）
    CREATE UNIQUE INDEX idx_context_packs_task_unique
      ON context_packs (content_task_id, scope, version) WHERE stage_run_id IS NULL;
    CREATE UNIQUE INDEX idx_context_packs_stage_unique
      ON context_packs (stage_run_id, scope, version) WHERE stage_run_id IS NOT NULL;
    CREATE INDEX idx_context_packs_task_stage ON context_packs (content_task_id, stage_run_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS context_packs CASCADE;
    DROP TABLE IF EXISTS asset_versions CASCADE;
    DROP TABLE IF EXISTS content_assets CASCADE;
  `);
};
