-- 容器首次创建数据卷时，由 postgres 镜像自动执行（docker-entrypoint-initdb.d），执行身份为 POSTGRES_USER。
-- 修改本文件后要重建数据卷才会生效：pnpm db:reset

-- 两个 schema：shop 放样例业务数据（Agent 只读），app 放应用自己的数据（Drizzle 管理）
CREATE SCHEMA IF NOT EXISTS shop;
CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  -- 统一按北京时间切日，否则"昨天""上周"会按 UTC 计算
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Shanghai');
  -- 默认所有角色都能建临时表，这里收回，只读角色也就无法借临时表写数据
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END $$;

-- Agent 专用的只读角色。真正的保障是权限（只授予 SELECT）；
-- 只读事务和超时是额外兜底，会话里可以被 SET 覆盖，所以 AST 校验还要禁止 SET。
-- 密码仅用于本地开发，需与 .env 中的 DATABASE_URL_READONLY 一致；部署时用 ALTER ROLE 修改。
CREATE ROLE analyst_ro LOGIN PASSWORD 'analyst_ro_dev';
ALTER ROLE analyst_ro SET default_transaction_read_only = on;
ALTER ROLE analyst_ro SET statement_timeout = '5s';
ALTER ROLE analyst_ro SET search_path = shop;

GRANT USAGE ON SCHEMA shop TO analyst_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA shop TO analyst_ro;
-- 之后由当前用户（造数脚本）在 shop 中建的表，自动对 analyst_ro 授予 SELECT
ALTER DEFAULT PRIVILEGES IN SCHEMA shop GRANT SELECT ON TABLES TO analyst_ro;

-- app schema 不授予任何权限：analyst_ro 看不到会话、日志等应用数据
