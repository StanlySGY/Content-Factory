-- Content Factory — 系统 PostgreSQL 供给脚本（需 superuser 执行一次，幂等）
--
-- 运行：  sudo -u postgres psql -f /home/sgy/github/Content-Factory/db/provision.sql
--
-- 作用：
--   1) 建开发库 content_factory 与测试库 content_factory_test，OWNER = sgy
--      → 迁移以 sgy 经 Unix socket peer 认证执行，无需 superuser / 密码
--   2) 建最小权限登录角色（TCP scram；dev-only 密码，仅本机）：
--      - cf_app          应用运行时（非属主，RLS 对其生效）
--      - cf_audit_reader 审计只读（写入身份与读取身份分离，ADR-008）
--   3) 表级 / RLS / 触发器 / REVOKE 等由迁移（node-pg-migrate，以 sgy）完成，本脚本不涉及
--
-- 真实凭证不入仓（setup.md §4.2）：dev 密码仅本地容器/主机使用。

-- 1) 登录角色（幂等）
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app') THEN
    CREATE ROLE cf_app LOGIN PASSWORD 'cf_app_dev_pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader') THEN
    CREATE ROLE cf_audit_reader LOGIN PASSWORD 'cf_audit_dev_pw';
  END IF;
END $$;

-- 2) 数据库（owner = sgy；幂等，利用 psql \gexec）
SELECT 'CREATE DATABASE content_factory OWNER sgy'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'content_factory')\gexec
SELECT 'CREATE DATABASE content_factory_test OWNER sgy'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'content_factory_test')\gexec

-- 3) 连接权限
GRANT CONNECT ON DATABASE content_factory, content_factory_test TO cf_app, cf_audit_reader;
