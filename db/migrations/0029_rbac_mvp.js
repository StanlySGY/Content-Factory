/* eslint-disable */
// 0029 — Product Gap 3：Multi-tenant RBAC Backend MVP。
//
// 设计要点：
//   - organizations / organization_members / project_memberships 为后续多租户权限提供控制面。
//   - 不替换当前默认 actor/project 上下文，不重写既有业务 API 权限模型。
//   - 状态变化为 UPDATE；审计集成留给后续 RBAC audit hardening。

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE organizations (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name        varchar(160) NOT NULL,
      status      varchar(32) NOT NULL DEFAULT 'active',
      created_by  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT organizations_status_chk CHECK (status IN ('active','archived')),
      CONSTRAINT organizations_name_chk CHECK (length(trim(name)) > 0)
    );
    CREATE INDEX idx_organizations_status ON organizations(status);

    CREATE TABLE organization_members (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      user_id         uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      role            varchar(32) NOT NULL,
      status          varchar(32) NOT NULL DEFAULT 'active',
      invited_by      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT organization_members_role_chk CHECK (role IN ('owner','admin','member','viewer')),
      CONSTRAINT organization_members_status_chk CHECK (status IN ('active','inactive')),
      CONSTRAINT organization_members_org_user_unique UNIQUE (organization_id, user_id)
    );
    CREATE INDEX idx_organization_members_org_status ON organization_members(organization_id, status);
    CREATE INDEX idx_organization_members_user ON organization_members(user_id);

    CREATE TABLE project_memberships (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id             uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      organization_member_id uuid NOT NULL REFERENCES organization_members(id) ON DELETE RESTRICT,
      role                   varchar(32) NOT NULL,
      status                 varchar(32) NOT NULL DEFAULT 'active',
      granted_by             uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at             timestamptz NOT NULL DEFAULT now(),
      updated_at             timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT project_memberships_role_chk CHECK (role IN ('owner','editor','viewer')),
      CONSTRAINT project_memberships_status_chk CHECK (status IN ('active','revoked')),
      CONSTRAINT project_memberships_project_member_unique UNIQUE (project_id, organization_member_id)
    );
    CREATE INDEX idx_project_memberships_project_status ON project_memberships(project_id, status);
    CREATE INDEX idx_project_memberships_member ON project_memberships(organization_member_id);

    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
        GRANT SELECT, INSERT, UPDATE ON organizations, organization_members, project_memberships TO cf_app;
        REVOKE DELETE ON organizations, organization_members, project_memberships FROM cf_app;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
        GRANT SELECT ON organizations, organization_members, project_memberships TO cf_audit_reader;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS project_memberships CASCADE;
    DROP TABLE IF EXISTS organization_members CASCADE;
    DROP TABLE IF EXISTS organizations CASCADE;
  `);
};
