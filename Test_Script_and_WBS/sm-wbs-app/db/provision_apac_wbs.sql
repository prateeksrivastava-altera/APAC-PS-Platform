-- ============================================================================
-- Provision the WBS app's database + least-privilege role on a shared Postgres
-- server. Run ONCE by a superuser (e.g. postgres), via psql (this script uses
-- \gexec and \connect, which are psql meta-commands):
--
--     psql -U postgres -h localhost -f db/provision_apac_wbs.sql
--
-- Supply a real password instead of the placeholder:
--     psql -U postgres -h localhost -v app_pw='a-strong-password' -f db/provision_apac_wbs.sql
--
-- This is the STANDARD PATTERN for every app in the suite: one shared server,
-- one database per app, each owned by its own least-privilege login role that
-- can reach ONLY its own database. Locks in one database can never block
-- another (row/table/advisory locks are database-scoped in PostgreSQL).
--
-- A future app copies this file to db/provision_apac_<app>.sql and replaces
-- apac_wbs -> apac_<app> and apac_wbs_app -> apac_<app>_app (see template at
-- the bottom).
-- ============================================================================

\set app_role 'apac_wbs_app'
\set app_db   'apac_wbs'
-- Default placeholder; override with -v app_pw='...' at run time.
\if :{?app_pw}
\else
\set app_pw 'CHANGE_ME'
\endif

-- 1. Role — least-privilege LOGIN. CREATE ROLE has no IF NOT EXISTS, so guard
--    on pg_roles and build the statement dynamically (\gexec runs the text the
--    preceding query returns).
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_role', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role')
\gexec
-- To (re)set the password later, run manually:
--   ALTER ROLE apac_wbs_app WITH PASSWORD '...';

-- 2. Database, owned by the role. CREATE DATABASE cannot run inside a
--    transaction / DO block, so guard with \gexec against pg_database.
--    (If you are RENAMING an existing database to apac_wbs instead of creating
--    a fresh one, this is correctly skipped because apac_wbs already exists.)
SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db')
\gexec

-- 3. Database-level lockdown: no public access, only the app role connects.
REVOKE ALL ON DATABASE apac_wbs FROM PUBLIC;
GRANT CONNECT, TEMP ON DATABASE apac_wbs TO apac_wbs_app;

-- 4. Schema privileges — connect INTO the database to apply them.
--    On PostgreSQL 15+ the public schema is no longer world-writable, so the
--    owning role needs USAGE+CREATE explicitly or migrations fail with
--    "permission denied for schema public".
\connect apac_wbs
ALTER SCHEMA public OWNER TO apac_wbs_app;
GRANT USAGE, CREATE ON SCHEMA public TO apac_wbs_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- ============================================================================
-- TEMPLATE for a future app — copy this file to db/provision_apac_<app>.sql,
-- then replace the three identifiers below. Run it once as a superuser before
-- that app's first migration.
--
--   \set app_role 'apac_<app>_app'
--   \set app_db   'apac_<app>'
--   \set app_pw   'CHANGE_ME'              -- or pass -v app_pw='...'
--
--   SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_role', :'app_pw')
--   WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role')
--   \gexec
--
--   SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_role')
--   WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db')
--   \gexec
--
--   REVOKE ALL ON DATABASE apac_<app> FROM PUBLIC;
--   GRANT CONNECT, TEMP ON DATABASE apac_<app> TO apac_<app>_app;
--
--   \connect apac_<app>
--   ALTER SCHEMA public OWNER TO apac_<app>_app;
--   GRANT USAGE, CREATE ON SCHEMA public TO apac_<app>_app;
--   REVOKE ALL ON SCHEMA public FROM PUBLIC;
-- ============================================================================
