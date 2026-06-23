# Deployment

> End-to-end guide to standing up the APAC Professional Services suite on a
> new server: prerequisites, PostgreSQL provisioning, `.env` management, how
> the shell+children process model works, and the operational runbook.

- **Status:** Current
- **Last updated:** 2026-06-04
- **Applies to:** the whole suite

## Architecture in one paragraph

Everything is fronted by **one process — the shell `sm-apac-landing`** —
which authenticates users (Azure AD in prod / local OS in dev), serves the
landing page, and **reverse-proxies + lazy-spawns the child apps** under
`/apps/<name>/…` on loopback-only ephemeral ports. You **never start the
child apps directly**; the shell forks them on demand. Only `sm-wbs-app`
needs a database — `sm-apac-landing` and `sm-test-script-builder` are
stateless.

```
Internet ──► [reverse proxy + TLS] ──► sm-apac-landing (shell, 127.0.0.1:4000)
                                          ├─ fork on demand: sm-test-script-builder → Matcha API
                                          └─ fork on demand: sm-wbs-app          → PostgreSQL (apac_wbs)
```

## Prerequisites

Install on the host once:

| | Minimum | Why |
|---|---|---|
| **OS** | Linux (systemd) / Windows Server (NSSM or scheduled task) | shell runs as a long-lived process |
| **Node.js** | 20+ | native ESM, global `fetch`, `node --watch` |
| **npm** | latest LTS | package manager |
| **PostgreSQL** | 15+ | per-app DB pattern needs schema-level `GRANT` (see [database-architecture.md](./database-architecture.md)) |
| **Reverse proxy** *(prod)* | nginx / Caddy / IIS | TLS termination, only the proxy is exposed publicly |

## Step 1 — Get the code on the host

```bash
git clone https://github.com/APAC-Touchwork/sm-apac-services-tools.git /opt/apac
cd /opt/apac

# install each app's dependencies
cd sm-apac-landing       && npm install && cd ..
cd sm-test-script-builder && npm install && cd ..
cd sm-wbs-app            && npm install && cd ..
cd design-system         && npm install && cd ..
```

The design-system bundle is **already vendored** into each app's
`public/vendor/`; re-running `npm run build` in `design-system/` is only
needed when the component set or theme tokens change.

## Step 2 — PostgreSQL (server + database + role)

The suite uses **one shared Postgres server with a database per app, owned
by an app-specific least-privilege role** ([full rationale](./database-architecture.md)).
Only `sm-wbs-app` needs storage today; future apps follow the same template.

### 2a. Install PostgreSQL

```bash
# Debian / Ubuntu
sudo apt-get install postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# RHEL / Rocky
sudo dnf install postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
```

If you're using a **managed service** (RDS / Cloud SQL / Azure DB / Heroku),
provision an instance with `max_connections >= 100`, network access from the
app host, and a superuser you can run the provisioning script with.

### 2b. Provision the WBS app's DB + role

From `sm-wbs-app/`, as a Postgres superuser (e.g. `postgres`):

```bash
psql -U postgres -h <db-host> \
  -v app_pw='<a-strong-prod-password>' \
  -f db/provision_apac_wbs.sql
```

The script (`sm-wbs-app/db/provision_apac_wbs.sql`) is idempotent and:

1. creates role `apac_wbs_app LOGIN PASSWORD '<your-value>'`;
2. creates database `apac_wbs OWNER apac_wbs_app`;
3. revokes `PUBLIC` connect from `apac_wbs` and grants it only to the role;
4. owns / grants the `public` schema to the role (mandatory on PG15+).

A copy-me TEMPLATE block at the bottom of the file shows how to stand up the
next app (e.g. `apac_testscript` + `apac_testscript_app`) when one needs storage.

### 2c. (Recommended) Lock down maintenance DBs

```sql
-- one-time hardening so an app role can't even connect to postgres/template1
REVOKE CONNECT ON DATABASE postgres  FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
```

### 2d. Apply schema + seed data

Two options — both idempotent (each migration is `IF NOT EXISTS` / `ON
CONFLICT`):

```bash
cd sm-wbs-app
npm run migrate          # explicit
# OR just start the shell; migrations auto-run on first WBS-app spawn
```

The migrations folder (`sm-wbs-app/db/`) contains numbered SQL files
through `011_add_status_approved.sql` plus `seed.sql` (default resource
roles + 3 WBS templates).

## Step 3 — `.env` files

Each app reads its own `.env` next to its `server.js`. **Treat real `.env`
files as secrets**; the repo committed dev/illustrative copies, but you
should rewrite prod values on the host and never push them.

> ⚠ **The committed dev `.env`s contain a real Matcha API key
> (`227c…295e`) and a dev DB password.** For production, **rotate both**
> before going live and supply the new values via the host's secret store
> (systemd `EnvironmentFile=`, Docker secrets, AWS SSM, etc.).

### 3a. `sm-apac-landing/.env` — the shell

| Key | Dev | Prod |
|---|---|---|
| `MODE` | `dev` | `prod` |
| `AZURE_CLIENT_ID` | blank | the SPA's MSAL client ID |
| `AZURE_TENANT_ID` | blank | tenant GUID (or `common` for multi-tenant) |
| `PORT` | unset (defaults to 4000) | unset (the launcher / proxy listens here) |

In **dev mode** the signed-in user is your local OS account. In **prod
mode** the shell expects an MSAL ID-token on the browser side; see the
Azure-AD setup in `sm-apac-landing/docs/Azure-AD-Setup.md`.

### 3b. `sm-test-script-builder/.env` — Matcha pipeline

| Key | Required? | Notes |
|---|---|---|
| `MATCHA_API_KEY` | yes | header `MATCHA-API-KEY` |
| `WORKSPACE_ID` | yes | `11797` for the APAC workspace |
| `BASE_URL` | yes | `https://matcha.harriscomputer.com/rest/api/v1` |
| `MISSION_ID_DECOMPOSER` | yes | `16131` (mission 1) |
| `MISSION_ID_NORMALISER` | yes | `16132` (mission 2) |
| `MISSION_ID_SCENARIO_BUILDER` | yes | `16130` (mission 3) |
| `MISSION_ID_MATERIALISER` | yes | `16129` (mission 4) |
| `MATCHA_TIMEOUT_SECONDS` | no (default 300) | per-mission HTTP timeout |
| `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` | blank if running behind the shell — auth comes from the shell |

### 3c. `sm-wbs-app/.env` — Postgres + Matcha + bootstrap

```
MODE=prod                                # or dev

# PostgreSQL (dev or prod block used based on MODE)
WBS_DB_HOST_PROD=<db-host>
WBS_DB_PORT_PROD=5432
WBS_DB_NAME_PROD=apac_wbs
WBS_DB_USER_PROD=apac_wbs_app
WBS_DB_PASSWORD_PROD=<the role password from step 2b>
WBS_DB_SSL=require                       # managed Postgres with TLS

WBS_DB_POOL_MAX=10                       # per-app pg.Pool size

# Comma-separated emails force-promoted to admin on every startup
WBS_BOOTSTRAP_ADMIN=lead@altera.com,ops@altera.com

# Matcha (AI Project Analyst — see docs/ai-project-analyst.md)
MATCHA_API_KEY=<rotated prod key>
WORKSPACE_ID=11797
BASE_URL=https://matcha.harriscomputer.com/rest/api/v1
MISSION_ID_WBS=40847
MATCHA_TIMEOUT_SECONDS=120
```

Leave `MATCHA_API_KEY` blank if you want the AI Assistant tab disabled —
the endpoints respond `503` and the UI hides the feature gracefully.

### 3d. `.env.example` templates

Every app ships a committed `.env.example` listing the required keys with
empty values. On a fresh host: `cp .env.example .env`, then fill in
production values.

## Step 4 — Run the shell

You **only** start `sm-apac-landing`. It spawns the children on first use.

### Systemd (Linux)

`/etc/systemd/system/apac-shell.service`:

```ini
[Unit]
Description=APAC Professional Services shell (sm-apac-landing)
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/apac/sm-apac-landing
EnvironmentFile=/etc/apac/landing.env       # rendered from .env at deploy time
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
User=apac
Group=apac
# child apps inherit env from the shell, BUT each reads its own .env via
# dotenv on spawn — so the child app's .env file must still exist on disk.

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now apac-shell
sudo journalctl -u apac-shell -f
```

### Windows

Use **NSSM** to wrap `node server.js` in `sm-apac-landing/` as a Windows
service, or a Task Scheduler job set to "At system startup".

### Quick test

```bash
curl -i http://127.0.0.1:4000/health           # 200 OK
curl -i http://127.0.0.1:4000/                 # landing HTML (after sign-in in prod)
```

## Step 5 — Reverse proxy + TLS (prod)

The shell binds `127.0.0.1:4000` and **expects to sit behind a reverse
proxy**. The child apps' ports are loopback-only — they **must not** be
exposed publicly. Sample nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name apac-services.example.com;

  ssl_certificate     /etc/letsencrypt/live/apac-services.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/apac-services.example.com/privkey.pem;

  client_max_body_size 50m;          # WBS Excel imports / exports

  location / {
    proxy_pass         http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto https;
    proxy_read_timeout 300;           # Matcha pipeline can stream long
  }
}

server { listen 80; server_name apac-services.example.com; return 301 https://$host$request_uri; }
```

## Step 6 — Verification checklist

1. **Health** — `curl https://<host>/health` → `{"ok":true}`.
2. **Migrations applied** — shell log shows `[wbs:migrate] apply 0XX…` for
   each unrun file the first time the WBS card is clicked. Or run
   `cd sm-wbs-app && npm run migrate` and observe `apply` / `skip` lines.
3. **DB role isolated** —
   `psql "host=… dbname=postgres user=apac_wbs_app password=…" -c "SELECT 1"`
   → `permission denied for database "postgres"` (only its own DB is
   reachable).
4. **Sign-in** — open `https://<host>/` in a browser, complete Azure AD,
   land on the launcher.
5. **Spawn-on-demand** — click the Test Script Builder card; landing
   server's log shows `[launcher] spawned test-script on 127.0.0.1:NNNN`.
6. **DB read** — click the WBS card; `/apps/wbs/api/projects` returns the
   project list.
7. **`/debug/children`** — confirms each spawned child + its ephemeral port.

## Operations

### Upgrading

```bash
sudo systemctl stop apac-shell
cd /opt/apac && git pull
cd sm-apac-landing && npm install
cd ../sm-test-script-builder && npm install
cd ../sm-wbs-app && npm install
cd ..
sudo systemctl start apac-shell      # WBS app re-spawns on first request,
                                     # auto-runs any new migrations
```

Migrations are idempotent and tracked in `AppliedMigrations`; re-running on
a populated DB is safe.

### Backups

```bash
# nightly via cron, with rotation
pg_dump -Fc -U postgres -h <db-host> -d apac_wbs -f /var/backups/apac_wbs-$(date +%Y%m%d).dump
find /var/backups -name 'apac_wbs-*.dump' -mtime +14 -delete
```

Restore:
```bash
sudo systemctl stop apac-shell
psql -U postgres -c "DROP DATABASE apac_wbs;"
psql -U postgres -f /opt/apac/sm-wbs-app/db/provision_apac_wbs.sql -v app_pw='<pw>'
pg_restore -U postgres -d apac_wbs --no-owner --role=apac_wbs_app /var/backups/apac_wbs-YYYYMMDD.dump
sudo systemctl start apac-shell
```

### Logs

All children's stdout/stderr are prefixed with `[wbs] …` /
`[test-script] …` in the **shell's** log. With systemd:

```bash
sudo journalctl -u apac-shell -f                  # tail
sudo journalctl -u apac-shell --since "1h ago"    # last hour
```

### Rotating the Matcha API key

1. Generate a new key on the Matcha workspace.
2. Update `MATCHA_API_KEY` in `sm-test-script-builder/.env` and
   `sm-wbs-app/.env`.
3. `sudo systemctl restart apac-shell` → child apps re-spawn on next request
   with the new key.
4. Revoke the old key on the Matcha workspace.

### Promoting the first admin

`WBS_BOOTSTRAP_ADMIN` in `sm-wbs-app/.env` is a comma-separated email list;
on every WBS-app startup, each address is force-promoted to admin. This is
how the very first admin user is seeded — after that, admins manage other
users from **Settings → Users**.

## Scaling / future considerations

- **Pool budget.** Each app process has its own `pg.Pool` (`max:
  WBS_DB_POOL_MAX`, default `10`). Postgres default `max_connections=100`
  fits ~9 apps at 10 each. As the suite grows, lower per-app `max`, raise
  `max_connections`, or front Postgres with **PgBouncer**.
- **Adding a future app.** Copy `provision_apac_wbs.sql` →
  `provision_apac_<app>.sql`, swap the DB + role names, run it, then point
  that app's config at `apac_<app>` (same per-app least-privilege model).
- **Horizontal scale of the shell.** The shell holds an in-memory map of
  spawned children, so a single-host model is simplest. Cluster only when
  load demands it; until then, vertically scale the host.

## Risks / call-outs

- The committed `.env` files (`sm-test-script-builder/.env`,
  `sm-wbs-app/.env`, `sm-apac-landing/.env`) contain real dev credentials
  — **rotate the Matcha key and DB password before production cutover**
  and replace those files on the host with values from your secret store.
- The shell's child-process map is in-memory — if the shell crashes,
  children are killed and re-spawned on next use; transient request
  failures are expected during a restart.
- Idle children stay alive until the shell exits. Memory grows with the
  number of distinct child apps; today (2 children) this is trivial.

## Related

- [database-architecture.md](./database-architecture.md) — per-app DB +
  least-privilege role pattern; the provisioning script reference.
- [ai-project-analyst.md](./ai-project-analyst.md) — Matcha mission config
  needed for the AI Assistant in the WBS app.
- [world-clocks-widget.md](./world-clocks-widget.md) — landing-page widget
  (no env / no DB; deploys with the shell).
- `sm-apac-landing/README.md` — endpoint table, child-spawn race notes.
- `sm-wbs-app/README.md` — env keys, hosting checklist, migrations runner.
