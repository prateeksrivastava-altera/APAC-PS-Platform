# Database architecture

> How the APAC suite uses PostgreSQL: one shared server, a separate database per
> app, each owned by its own least-privilege role.

- **Status:** Current
- **Last updated:** 2026-05-29
- **Applies to:** the whole suite (only `sm-wbs-app` uses Postgres today)

## Context

The suite is several apps behind one sign-in shell. We want a backend that is
cheap to run (one Postgres server) but keeps each app's data **isolated** — so
that locks or load in one app can never block another, and a leaked credential
for one app can't read or write another app's data.

PostgreSQL gives us this cleanly: **databases within one server cluster are
fully isolated for locking.** Row/table/advisory locks, long transactions, and
`VACUUM`/DDL waits are all scoped to a single database. A lock in one app's
database physically cannot block a query in another's. Apps share only
*server-level* resources (CPU, I/O, WAL, and the global `max_connections`),
which we manage with bounded connection pools.

## Design

One server → one database per app → one least-privilege login role per app that
**owns and can reach only its own database**.

| App | Database | Role | Uses Postgres? |
|---|---|---|---|
| `sm-wbs-app` | `apac_wbs` | `apac_wbs_app` | Yes |
| `sm-apac-landing` (shell) | — | — | No (stateless: cookie/JWT auth, reverse proxy) |
| `sm-test-script-builder` | — | — | No (stateless: calls the Matcha API) |
| _future app_ | `apac_<app>` | `apac_<app>_app` | when it needs storage |

**Naming convention:** database `apac_<app>`, owning role `apac_<app>_app`.

**Isolation guarantees:**
- *Lock isolation* — separate databases, so no cross-app lock contention.
- *Credential isolation* — each role can connect only to its own database.
  Each app database `REVOKE`s `CONNECT` from `PUBLIC` and grants it only to that
  app's role. The maintenance databases (`postgres`, `template1`) also have
  `CONNECT` revoked from `PUBLIC`, so an app role is denied everywhere except its
  own database.

## Configuration

`sm-wbs-app` reads its connection from env (dev/prod switch on `MODE`); see
`sm-wbs-app/config.js` and `.env.example`:

```
WBS_DB_HOST_DEV / _PROD
WBS_DB_PORT_DEV / _PROD
WBS_DB_NAME_DEV / _PROD     # apac_wbs
WBS_DB_USER_DEV / _PROD     # apac_wbs_app
WBS_DB_PASSWORD_DEV / _PROD
WBS_DB_SSL                  # require, for managed Postgres with TLS
WBS_DB_POOL_MAX             # per-app pool size (default 10)
```

The single shared `pg.Pool` lives in `sm-wbs-app/db/index.js`; migrations run
from `sm-wbs-app/db/migrate.js` against the configured database as the owning
role.

## Operations / Runbook

### Provision a new app's database (run once, as a superuser)

```bash
# from the app's folder, e.g. sm-wbs-app/
psql -U postgres -h localhost -v app_pw='a-strong-password' -f db/provision_apac_wbs.sql
```

`db/provision_apac_wbs.sql` is idempotent and:
1. creates role `apac_wbs_app` (LOGIN), guarded against `pg_roles`;
2. creates database `apac_wbs OWNER apac_wbs_app` (guarded via `\gexec` against
   `pg_database` — `CREATE DATABASE` can't run inside a transaction);
3. revokes `PUBLIC` access and grants `CONNECT`/schema rights to the role
   (the explicit `public` schema grant is **mandatory on PG15+**).

It ends with a copy-me **template** for the next app — copy the file to
`provision_apac_<app>.sql`, swap `apac_wbs` → `apac_<app>` and `apac_wbs_app`
→ `apac_<app>_app`.

### Stand up a brand-new app on the shared server

1. Copy + edit the provision script; run it as a superuser.
2. Add a `db/` layer mirroring `sm-wbs-app` (`index.js` pool + `migrate.js`).
3. Point the app's config/env at `apac_<app>` + `apac_<app>_app`.
4. Run migrations; smoke-test.

### How the WBS database was created

The existing `apacwbsapp` database was renamed in place to `apac_wbs`
(preserving all data), its ownership transferred to `apac_wbs_app`, and
`PUBLIC` access locked down. A `pg_dump` safety backup was taken first.

## Scaling / Future considerations

- **Connection budget.** Each app process owns its own pool
  (`WBS_DB_POOL_MAX`, default 10). The server's `max_connections` defaults to
  100, so ~9 apps fit at 10 each (minus reserved superuser slots). As the suite
  grows: lower per-app pool size, raise `max_connections`, or add **PgBouncer**
  in front for connection pooling.
- **Managed Postgres.** In prod, point each app's `*_PROD` env at the managed
  instance and set `WBS_DB_SSL=require`. The same one-server/per-database/
  per-role model applies (roles + databases provisioned by the same scripts).
- **Per-app backups.** Because each app is its own database, `pg_dump` per
  database gives independent, app-scoped backup/restore.

## Verification

```bash
# role can reach only its own DB
psql "host=localhost dbname=apac_wbs user=apac_wbs_app" -tAc "SELECT current_user, current_database();"
# -> apac_wbs_app | apac_wbs
psql "host=localhost dbname=postgres user=apac_wbs_app" -tAc "SELECT 1;"
# -> FATAL: permission denied for database "postgres"
# owner can create (migrations work)
psql -U apac_wbs_app -d apac_wbs -c "CREATE TABLE _t(x int); DROP TABLE _t;"
```

## Related

- `sm-wbs-app/README.md` — app-specific DB env keys + production hosting checklist.
- `sm-wbs-app/db/provision_apac_wbs.sql` — the provisioning script + future-app template.
- Root `README.md` — suite overview.
