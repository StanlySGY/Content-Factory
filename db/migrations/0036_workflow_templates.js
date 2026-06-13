/* eslint-disable */
// 0036 — 预置写作模板（P0.3）
//
// 设计要点：
//   - 为公众号作者预置 3 个常用写作工作流模板
//   - 科技评论：研究背景 → 观点提炼 → 案例支撑 → 总结升华
//   - 生活故事：场景描述 → 冲突展开 → 情感共鸣 → 启发收尾
//   - 干货教程：问题定义 → 解决方案 → 步骤拆解 → 效果验证
//   - 所有模板设置为 active 状态，可直接使用

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000010";

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. 科技评论模板
    INSERT INTO workflow_definitions (id, project_id, name, version, status, definition_schema)
    VALUES (
      '00000000-0000-0000-0001-000000000001',
      '${DEFAULT_PROJECT_ID}',
      '科技评论',
      1,
      'active',
      '{
        "schema_version": 1,
        "description": "适合科技产品评测、行业观点、技术趋势分析",
        "tags": ["科技", "评论", "观点"],
        "estimatedTime": "15-20分钟",
        "targetLength": "1500-2000字"
      }'::jsonb
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO workflow_stages (id, workflow_definition_id, key, name, position, executor_type, input_schema, output_schema, gate_schema)
    VALUES
      (
        '00000000-0000-0000-0001-000000000011',
        '00000000-0000-0000-0001-000000000001',
        'research_background',
        '研究背景',
        1,
        'agent',
        '{"schema_version": 1, "fields": {"topic": "string", "keywords": "array"}}'::jsonb,
        '{"schema_version": 1, "fields": {"background": "string", "sources": "array"}}'::jsonb,
        '{"schema_version": 1, "autoPass": true}'::jsonb
      ),
      (
        '00000000-0000-0000-0001-000000000012',
        '00000000-0000-0000-0001-000000000001',
        'extract_viewpoint',
        '观点提炼',
        2,
        'agent',
        '{"schema_version": 1, "fields": {"background": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"mainPoint": "string", "subPoints": "array"}}'::jsonb,
        '{"schema_version": 1, "autoPass": true}'::jsonb
      ),
      (
        '00000000-0000-0000-0001-000000000013',
        '00000000-0000-0000-0001-000000000001',
        'case_support',
        '案例支撑',
        3,
        'agent',
        '{"schema_version": 1, "fields": {"viewpoint": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"cases": "array", "analysis": "string"}}'::jsonb,
        '{"schema_version": 1, "autoPass": true}'::jsonb
      ),
      (
        '00000000-0000-0000-0001-000000000014',
        '00000000-0000-0000-0001-000000000001',
        'conclusion',
        '总结升华',
        4,
        'agent',
        '{"schema_version": 1, "fields": {"content": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"article": "string", "title": "string"}}'::jsonb,
        '{"schema_version": 1, "requireHumanReview": true}'::jsonb
      )
    ON CONFLICT (id) DO NOTHING;

    -- 2. 生活故事模板
    INSERT INTO workflow_definitions (id, project_id, name, version, status, definition_schema)
    VALUES (
      '00000000-0000-0000-0002-000000000001',
      '${DEFAULT_PROJECT_ID}',
      '生活故事',
      1,
      'active',
      '{
        "schema_version": 1,
        "description": "适合个人经历分享、情感共鸣、生活感悟",
        "tags": ["故事", "情感", "生活"],
        "estimatedTime": "10-15分钟",
        "targetLength": "1000-1500字"
      }'::jsonb
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO workflow_stages (id, workflow_definition_id, key, name, position, executor_type, input_schema, output_schema, gate_schema)
    VALUES
      (
        '00000000-0000-0000-0002-000000000011',
        '00000000-0000-0000-0002-000000000001',
        'scene_description',
        '场景描述',
        1,
        'agent',
        '{"schema_version": 1, "fields": {"theme": "string", "setting": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"scene": "string", "atmosphere": "string"}}'::jsonb,
        '{"schema_version": 1, "autoPass": true}'::jsonb
      ),
      (
        '00000000-0000-0000-0002-000000000012',
        '00000000-0000-0000-0002-000000000001',
        'conflict_development',
        '冲突展开',
        2,
        'agent',
        '{"schema_version": 1, "fields": {"scene": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"conflict": "string", "development": "string"}}'::jsonb,
        '{"schema_version": 1, "autoPass": true}'::jsonb
      ),
      (
        '00000000-0000-0000-0002-000000000013',
        '00000000-0000-0000-0002-000000000001',
        'emotional_resonance',
        '情感共鸣',
        3,
        'agent',
        '{"schema_version": 1, "fields": {"story": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"emotion": "string", "reflection": "string"}}'::jsonb,
        '{"schema_version": 1, "autoPass": true}'::jsonb
      ),
      (
        '00000000-0000-0000-0002-000000000014',
        '00000000-0000-0000-0002-000000000001',
        'inspiring_ending',
        '启发收尾',
        4,
        'agent',
        '{"schema_version": 1, "fields": {"content": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"article": "string", "title": "string"}}'::jsonb,
        '{"schema_version": 1, "requireHumanReview": true}'::jsonb
      )
    ON CONFLICT (id) DO NOTHING;

    -- 3. 干货教程模板
    INSERT INTO workflow_definitions (id, project_id, name, version, status, definition_schema)
    VALUES (
      '00000000-0000-0000-0003-000000000001',
      '${DEFAULT_PROJECT_ID}',
      '干货教程',
      1,
      'active',
      '{
        "schema_version": 1,
        "description": "适合技能教学、工具使用、方法论分享",
        "tags": ["教程", "干货", "实用"],
        "estimatedTime": "20-25分钟",
        "targetLength": "2000-3000字"
      }'::jsonb
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO workflow_stages (id, workflow_definition_id, key, name, position, executor_type, input_schema, output_schema, gate_schema)
    VALUES
      (
        '00000000-0000-0000-0003-000000000011',
        '00000000-0000-0000-0003-000000000001',
        'problem_definition',
        '问题定义',
        1,
        'agent',
        '{"schema_version": 1, "fields": {"topic": "string", "audience": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"problem": "string", "pain_points": "array"}}'::jsonb,
        '{"schema_version": 1, "autoPass": true}'::jsonb
      ),
      (
        '00000000-0000-0000-0003-000000000012',
        '00000000-0000-0000-0003-000000000001',
        'solution_design',
        '解决方案',
        2,
        'agent',
        '{"schema_version": 1, "fields": {"problem": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"solution": "string", "approach": "string"}}'::jsonb,
        '{"schema_version": 1, "autoPass": true}'::jsonb
      ),
      (
        '00000000-0000-0000-0003-000000000013',
        '00000000-0000-0000-0003-000000000001',
        'step_breakdown',
        '步骤拆解',
        3,
        'agent',
        '{"schema_version": 1, "fields": {"solution": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"steps": "array", "tips": "array"}}'::jsonb,
        '{"schema_version": 1, "autoPass": true}'::jsonb
      ),
      (
        '00000000-0000-0000-0003-000000000014',
        '00000000-0000-0000-0003-000000000001',
        'effect_validation',
        '效果验证',
        4,
        'agent',
        '{"schema_version": 1, "fields": {"content": "string"}}'::jsonb,
        '{"schema_version": 1, "fields": {"article": "string", "title": "string"}}'::jsonb,
        '{"schema_version": 1, "requireHumanReview": true}'::jsonb
      )
    ON CONFLICT (id) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM workflow_stages WHERE workflow_definition_id IN (
      '00000000-0000-0000-0001-000000000001',
      '00000000-0000-0000-0002-000000000001',
      '00000000-0000-0000-0003-000000000001'
    );
    DELETE FROM workflow_definitions WHERE id IN (
      '00000000-0000-0000-0001-000000000001',
      '00000000-0000-0000-0002-000000000001',
      '00000000-0000-0000-0003-000000000001'
    );
  `);
};
