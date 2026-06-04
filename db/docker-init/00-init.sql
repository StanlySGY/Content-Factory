-- 开发容器初始化（首次启动、数据目录为空时以 superuser 执行一次）
-- 职责：集群级角色供给 + 测试库创建（角色为集群全局，对 content_factory 与 _test 均生效）
-- dev-only 密码：本地容器内无防护价值；生产环境由运维按 setup.md §5.1 另建等价最小权限账号

-- 写入身份（应用运行时，最小权限；RLS 对其生效）
CREATE ROLE cf_app LOGIN PASSWORD 'cf_app_dev_pw';
-- 审计读取身份（与写入身份分离，ADR-008）
CREATE ROLE cf_audit_reader LOGIN PASSWORD 'cf_audit_dev_pw';

GRANT CONNECT ON DATABASE content_factory TO cf_app, cf_audit_reader;

-- 测试库
CREATE DATABASE content_factory_test OWNER postgres;
GRANT CONNECT ON DATABASE content_factory_test TO cf_app, cf_audit_reader;
