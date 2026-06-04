/* eslint-disable */
// 0001 — users + projects（db §5.1 / §5.2 + 索引 §7.1）
// 以 sgy（库属主）执行；UUID 用内置 gen_random_uuid()（PG13+，无需 pgcrypto）

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name       varchar(120) NOT NULL,
      email      varchar(255) NOT NULL,
      status     varchar(32)  NOT NULL DEFAULT 'active',
      created_at timestamptz  NOT NULL DEFAULT now(),
      updated_at timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT users_status_chk CHECK (status IN ('active','disabled'))
    );
    CREATE UNIQUE INDEX idx_users_email_unique ON users (email);

    CREATE TABLE projects (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id    uuid NOT NULL REFERENCES users (id),
      name        varchar(160) NOT NULL,
      description text,
      status      varchar(32)  NOT NULL DEFAULT 'active',
      created_at  timestamptz  NOT NULL DEFAULT now(),
      updated_at  timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT projects_status_chk CHECK (status IN ('active','archived'))
    );
    CREATE INDEX idx_projects_owner_status ON projects (owner_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS projects; DROP TABLE IF EXISTS users;`);
};
