/* eslint-disable */
// 0037 — 修正资产版本内容字段语义
//
// 设计要点：
//   - storage_uri 本意存储外部资源 URI，但当前被用于存储 Markdown 原文
//   - 新增 content_text 字段用于存储纯文本内容
//   - 迁移现有数据：将 storage_uri 中非 URI 内容迁移到 content_text
//   - 保留 storage_uri 用于存储外部资源引用

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. 新增 content_text 字段
    ALTER TABLE asset_versions
      ADD COLUMN content_text TEXT;

    -- 2. 迁移现有数据：将非 URI 内容迁移到 content_text
    -- 判断标准：不以 http:// 或 https:// 开头的内容视为纯文本
    UPDATE asset_versions
    SET content_text = storage_uri
    WHERE storage_uri NOT LIKE 'http://%'
      AND storage_uri NOT LIKE 'https://%';

    -- 3. 添加注释说明字段用途
    COMMENT ON COLUMN asset_versions.content_text IS '纯文本内容（Markdown 等），与 storage_uri 互补';
    COMMENT ON COLUMN asset_versions.storage_uri IS '外部资源 URI（URL、文件路径等），纯文本内容应使用 content_text';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- 回滚：删除 content_text 字段
    ALTER TABLE asset_versions
      DROP COLUMN IF EXISTS content_text;
  `);
};
