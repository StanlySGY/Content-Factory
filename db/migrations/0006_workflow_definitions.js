/* eslint-disable */
// 0006 — 工作流定义层（db §5.4 / §5.5 / §5.5.1 + 索引 §7.1/§7.2）
//
// 设计要点：
//   - workflow_definitions：版本化定义；(project_id,name,version) 唯一 + 同名仅一个 active（§9.1 部分唯一）
//   - workflow_stages / workflow_stage_dependencies 为定义的组合子件 → ON DELETE CASCADE（清理草稿定义不留孤儿边）
//   - 依赖图无环（DAG）校验由领域层在发布时执行（roadmap §5.3 / db §5.5.1），非 DB 约束
//   - JSON 契约（definition_schema/input/output/gate_schema/condition_schema）须内含数值 schema_version（§6.4/ADR-015）；
//     存在性 + 数值性以 CHECK 兜底，完整契约校验在 API 边界（TypeBox，Step-2/3）

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE workflow_definitions (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
      name              varchar(160) NOT NULL,
      version           integer NOT NULL,
      status            varchar(32)  NOT NULL DEFAULT 'draft',
      definition_schema jsonb        NOT NULL,
      created_at        timestamptz  NOT NULL DEFAULT now(),
      updated_at        timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT workflow_definitions_status_chk
        CHECK (status IN ('draft','active','deprecated','archived')),
      CONSTRAINT workflow_definitions_version_chk CHECK (version >= 1),
      CONSTRAINT workflow_definitions_pnv_unique UNIQUE (project_id, name, version),
      CONSTRAINT workflow_definitions_defschema_ver_chk
        CHECK ((definition_schema->>'schema_version') IS NOT NULL
               AND jsonb_typeof(definition_schema->'schema_version') = 'number')
    );
    CREATE INDEX idx_workflow_definitions_project_status
      ON workflow_definitions (project_id, status);
    -- §9.1：同一项目同一名称仅一个 active 版本
    CREATE UNIQUE INDEX idx_workflow_definitions_active_unique
      ON workflow_definitions (project_id, name) WHERE status = 'active';

    CREATE TABLE workflow_stages (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions (id) ON DELETE CASCADE,
      key                    varchar(80)  NOT NULL,
      name                   varchar(160) NOT NULL,
      position               integer      NOT NULL,
      executor_type          varchar(32)  NOT NULL,
      input_schema           jsonb        NOT NULL,
      output_schema          jsonb        NOT NULL,
      gate_schema            jsonb        NOT NULL,
      created_at             timestamptz  NOT NULL DEFAULT now(),
      updated_at             timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT workflow_stages_executor_type_chk
        CHECK (executor_type IN ('human','agent','skill','plugin')),
      CONSTRAINT workflow_stages_def_key_unique UNIQUE (workflow_definition_id, key),
      CONSTRAINT workflow_stages_input_ver_chk
        CHECK ((input_schema->>'schema_version') IS NOT NULL
               AND jsonb_typeof(input_schema->'schema_version') = 'number'),
      CONSTRAINT workflow_stages_output_ver_chk
        CHECK ((output_schema->>'schema_version') IS NOT NULL
               AND jsonb_typeof(output_schema->'schema_version') = 'number'),
      CONSTRAINT workflow_stages_gate_ver_chk
        CHECK ((gate_schema->>'schema_version') IS NOT NULL
               AND jsonb_typeof(gate_schema->'schema_version') = 'number')
    );
    -- (wd_id, position) 唯一 + 阶段顺序加载索引（§7.1 idx_workflow_stages_definition_position）
    CREATE UNIQUE INDEX idx_workflow_stages_definition_position
      ON workflow_stages (workflow_definition_id, position);

    CREATE TABLE workflow_stage_dependencies (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions (id) ON DELETE CASCADE,
      stage_id               uuid NOT NULL REFERENCES workflow_stages (id) ON DELETE CASCADE,
      depends_on_stage_id    uuid NOT NULL REFERENCES workflow_stages (id) ON DELETE CASCADE,
      dependency_type        varchar(32) NOT NULL,
      condition_schema       jsonb,
      created_at             timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT workflow_stage_dependencies_type_chk
        CHECK (dependency_type IN ('finish_to_start','join_all','join_any')),
      CONSTRAINT workflow_stage_dependencies_no_self_chk
        CHECK (stage_id <> depends_on_stage_id),
      CONSTRAINT workflow_stage_dependencies_edge_unique UNIQUE (stage_id, depends_on_stage_id),
      CONSTRAINT workflow_stage_dependencies_cond_ver_chk
        CHECK (condition_schema IS NULL
               OR ((condition_schema->>'schema_version') IS NOT NULL
                   AND jsonb_typeof(condition_schema->'schema_version') = 'number'))
    );
    -- DAG 依赖加载与拓扑校验双向索引（§7.2）；无环校验在领域层发布时执行
    CREATE INDEX idx_stage_deps_stage ON workflow_stage_dependencies (stage_id);
    CREATE INDEX idx_stage_deps_upstream ON workflow_stage_dependencies (depends_on_stage_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS workflow_stage_dependencies CASCADE;
    DROP TABLE IF EXISTS workflow_stages CASCADE;
    DROP TABLE IF EXISTS workflow_definitions CASCADE;
  `);
};
