/* eslint-disable */
// 0005 — 默认用户 + 默认项目种子（单项目 MVP，db §4.1）
// 固定 UUID，幂等；API 以此解析 S1 默认 actor/project 上下文（登录属后续 Sprint，roadmap §4.3）

const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000010";

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO users (id, name, email, status)
      VALUES ('${DEFAULT_USER_ID}', 'Default Owner', 'owner@content-factory.local', 'active')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO projects (id, owner_id, name, description, status)
      VALUES ('${DEFAULT_PROJECT_ID}', '${DEFAULT_USER_ID}', 'Default Project', 'Sprint 1 单项目 MVP 默认项目', 'active')
      ON CONFLICT (id) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM projects WHERE id = '${DEFAULT_PROJECT_ID}';
    DELETE FROM users WHERE id = '${DEFAULT_USER_ID}';
  `);
};
