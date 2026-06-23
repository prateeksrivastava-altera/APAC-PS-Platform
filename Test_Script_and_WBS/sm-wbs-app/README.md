# sm-wbs-app

Node port of the .NET Blazor `sm-wbs-builder` app. Authors Work Breakdown Structures for APAC Sunrise EHR deliveries.

**Status:** Phases A–E.3 + C + D.3.5 complete. Settings page (managing clients / resources / costing profiles) and standalone version viewer are deferred.

Implemented:
- DB connection + idempotent migrations (`Schema.sql` / `Seed.sql` ported verbatim)
- Projects list page (`index.html`)
- New Project wizard (`new.html`) — 2 steps, optional template seeding
- Project detail page (`project.html`) with tabbed UI:
  - **WBS** — full editable tree, comments inline, conc. checkbox, rolled-up parent hours, footer with Actuals / Buffer % / Buffered rows
  - **Timeline** — Gantt chart with month / week columns, depth-coloured bars, Level 1 / Level 1+2 filters
  - **Resource Plan** — monthly hours grid + weekly detail expander + cost estimate with costing-profile picker + Apply
  - **History** — version list with revert (handles both Node camelCase and old .NET PascalCase snapshots)
- Per-task: rename / hours / concurrent / notes / dependencies / indent / outdent / duration-override / add-child / delete
- Edit project side-panel (slides in from right) — client / project name / SOW / status / start date / buffer % / costing profile / resource list
- **Excel export** — `/api/projects/:id/export/xlsx` produces a 4-sheet workbook (Project, WBS, Resource Plan, Timeline)
- Save flow writes a snapshot row to `ProjectVersions` per save, mirroring the .NET app's `ProjectSnapshot` shape

## Run

Normally launched on demand by the APAC landing shell — click the WBS card at <http://localhost:4000>.

To run standalone:

```bash
cd sm-wbs-app
npm install
cp .env.example .env
npm start
```

## Migrations

Auto-run on startup. To run manually:

```bash
npm run migrate
```

Tracked in the `AppliedMigrations` table; both SQL files use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`, so re-running on an existing DB is safe.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health` | Readiness probe used by the shell launcher |
| GET  | `/api/me` | Upstream `X-Forwarded-User` |
| GET  | `/api/status` | DB + project count (used by `debug.html`) |
| GET  | `/api/projects` | Project list |
| GET  | `/api/projects/:id` | Full bundle (project + resources + tasks with hours/deps + schedule + per-resource `actuals`) |
| POST | `/api/projects` | Create new project, optionally cloning a template |
| PUT  | `/api/projects/:id` | Update metadata + resources + tasks + actuals (atomic); inserts a `ProjectVersions` row |
| GET  | `/api/projects/:id/versions` | Version metadata (list) |
| GET  | `/api/projects/:id/versions/:n` | Single version with parsed snapshot |
| GET  | `/api/projects/:id/export/xlsx` | Excel export (4 sheets) |
| GET  | `/api/resources` | Active resources |
| GET  | `/api/clients` | Active clients |
| GET  | `/api/templates` | WBS templates for the new-project wizard |
| GET  | `/api/costing-profiles` | Costing profile list |
| GET  | `/api/costing-profiles/:id` | Single profile with per-resource rates |

## Database architecture

> Suite-wide design lives in [`../docs/database-architecture.md`](../docs/database-architecture.md);
> this section is the app-specific summary.

The whole APAC suite runs on **one shared PostgreSQL server**, with **a
separate database per app**. Each app connects as **its own least-privilege
login role** that owns — and can reach — only its own database.

| App | Database | Role |
|---|---|---|
| sm-wbs-app | `apac_wbs` | `apac_wbs_app` |
| _future app_ | `apac_<app>` | `apac_<app>_app` |

Why this layout:
- **Lock isolation.** In PostgreSQL, row/table/advisory locks, long
  transactions and `VACUUM`/DDL waits are all scoped to a single database. A
  lock in `apac_wbs` physically cannot block a query in another app's database.
- **Credential isolation.** Each app's role can connect only to its own
  database, so a leaked credential for one app can't read or write another's
  data.
- Apps still share *server-level* resources (CPU, I/O, WAL, and the global
  `max_connections`), which we keep in check with bounded connection pools —
  each app's pool defaults to `WBS_DB_POOL_MAX=10`. Budget roughly that many
  connections per app under the server's `max_connections` (default 100); as
  the suite grows, lower per-app pool sizes, raise `max_connections`, or put
  PgBouncer in front.

### Provisioning (run once, as a superuser)

Before an app's first migration, create its database + role:

```bash
# from sm-wbs-app/
psql -U postgres -h localhost -v app_pw='a-strong-password' -f db/provision_apac_wbs.sql
```

`db/provision_apac_wbs.sql` is idempotent (safe to re-run) and ends with a
**copy-me template** for standing up the next app's `apac_<app>` database the
same way.

## Dev / prod database

`MODE=dev` in `.env` uses `WBS_DB_*_DEV` keys; `MODE=prod` uses `WBS_DB_*_PROD`.

```
MODE=dev                          # or prod

# dev
WBS_DB_HOST_DEV=localhost
WBS_DB_PORT_DEV=5432
WBS_DB_NAME_DEV=apac_wbs
WBS_DB_USER_DEV=apac_wbs_app
WBS_DB_PASSWORD_DEV=...

# prod (filled in at hosting time)
WBS_DB_HOST_PROD=<hostname>
WBS_DB_PORT_PROD=5432
WBS_DB_NAME_PROD=apac_wbs
WBS_DB_USER_PROD=apac_wbs_app
WBS_DB_PASSWORD_PROD=<password>
WBS_DB_SSL=require                # set when prod uses managed Postgres with TLS

WBS_DB_POOL_MAX=10                # per-app connection pool size
```

### Production hosting checklist

1. **Provision Postgres** — managed instance (RDS / Cloud SQL / Heroku / etc) or self-hosted.
   - **Step 0:** run `db/provision_apac_wbs.sql` as a superuser once to create
     the `apac_wbs` database + `apac_wbs_app` role.
   - Then let the app's migrations runner auto-apply on first start (or run
     `npm run migrate`). `db/seed.sql` (applied by the runner) ships 7 default
     resource roles + 3 WBS templates.
2. **Set env vars** on the host — at minimum `MODE=prod` and the `WBS_DB_*_PROD` keys; `WBS_DB_SSL=require` for managed instances.
3. **Run behind the APAC shell** — the shell spawns this app on `127.0.0.1:<ephemeral>` and proxies `/apps/wbs/*`. Inject `X-Forwarded-User` from the upstream MSAL session. No standalone port should be exposed.
4. **Verify migrations applied** — `npm run migrate` logs `apply` for fresh installs, `skip` if `AppliedMigrations` already records them.
5. **Run a smoke test** — fetch `/api/projects` and `/api/projects/:id/export/xlsx`; both should respond 200.

## Files

```
sm-wbs-app/
├── server.js               Express, all API endpoints
├── config.js               .env loader (dev/prod switch)
├── lib/
│   ├── scheduleEngine.js   Schedule engine port (used server-side)
│   └── exporter.js         exceljs 4-sheet Excel export
├── db/
│   ├── schema.sql          ported from .NET, idempotent
│   ├── seed.sql            7 resources + 3 templates
│   ├── index.js            pg pool helper
│   └── migrate.js          tracked migration runner
├── public/
│   ├── index.html          Projects list
│   ├── new.html            New Project wizard (2 steps)
│   ├── project.html        Tabbed project detail (WBS/Timeline/Plan/History)
│   ├── debug.html          DB-status page (Phase A leftover)
│   ├── scheduleEngine.js   Same engine as lib/, ES module loaded by project.html
│   ├── styles.css
│   └── images/
└── README.md               this file
```

## Deferred

- **Settings page** — managing clients / resources / costing profiles. Workaround for now: edit data directly in Postgres or extend the Edit Project panel for per-project tweaks.
- **Standalone Project Version View** — revert satisfies the use case; viewing past snapshots without committing isn't supported yet.
- **Help page** — minor, future polish.
- **Cycle detection** for cross-task dependencies. The schedule engine's 100-iteration safeguard prevents infinite loops but a UI warning would be nice.
