#!/bin/sh
# Content Factory 生产容器 PostgreSQL 初始化（首次启动、数据目录为空时以 superuser 执行一次）
# 职责：仅供给应用运行时所需的最小权限登录角色；表/RLS/触发器由迁移完成。
# 与开发 init 区别：不创建测试库；角色密码经容器环境注入（CF_APP_PASSWORD / CF_AUDIT_PASSWORD），
# 与 compose 注入给 api 的连接串保持一致，避免写死占位导致认证失败。
set -e

: "${CF_APP_PASSWORD:=cf_app_dev_pw}"
: "${CF_AUDIT_PASSWORD:=cf_audit_dev_pw}"

# 用 \gexec 模式：psql 不在 DO $$...$$ 美元引用块内做变量替换，故在块外用 :'var' 生成语句再执行。
# %L 对密码做 SQL 字面量转义，避免拼接注入。
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$CF_APP_PASSWORD" -v audit_pw="$CF_AUDIT_PASSWORD" <<'EOSQL'
SELECT format('CREATE ROLE cf_app LOGIN PASSWORD %L', :'app_pw')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_app')\gexec
SELECT format('CREATE ROLE cf_audit_reader LOGIN PASSWORD %L', :'audit_pw')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cf_audit_reader')\gexec

-- content_factory 库由 POSTGRES_DB 创建（owner = postgres）；迁移以 postgres 经 TCP 执行。
GRANT CONNECT ON DATABASE content_factory TO cf_app, cf_audit_reader;
EOSQL
