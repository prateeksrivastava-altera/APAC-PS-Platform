# APAC Professional Services Tooling Suite

Internal web tools for the APAC Professional Services team, fronted by a single
sign-in shell. One process to start — the shell — manages everything else.

## Architecture

The **shell** (`sm-apac-landing`) is the entry point and the only app you start
directly. It:

- authenticates the user — Azure AD (MSAL) in production, the local OS account
  in dev mode;
- presents a landing page with a launcher card per tool;
- **reverse-proxies** to the child apps under `/apps/<name>/…`, spawning each
  child process on demand on a loopback-only ephemeral port (so a child is never
  reachable directly from the network);
- injects the validated identity into every proxied request via
  `X-Forwarded-User` / `-Email` / `-Oid` headers, which the child apps trust.

```
Browser ──► http://localhost:4000  (shell: sign-in + landing)
                 └── /apps/test-script/*  ──► sm-test-script-builder  (spawned child)
                 └── /apps/wbs/*          ──► sm-wbs-app              (spawned child)
```

## Apps

| Folder | Description |
|---|---|
| `sm-apac-landing` | The shell — Azure AD sign-in, landing page, reverse-proxy + lazy-spawn of the child apps, identity-header injection. Runs on port **4000**. |
| `sm-test-script-builder` | Generates QA test scripts from product documentation via the Matcha AI pipeline. Spawned by the shell. |
| `sm-wbs-app` | **WBS Builder** — authors Work Breakdown Structures: projects, task grid, timeline/Gantt, resource plan, analytics, settings and user permissions. PostgreSQL-backed. Spawned by the shell. |
| `sm-wbs-builder` | Legacy .NET Blazor WBS app — superseded by `sm-wbs-app`, kept for reference. |
| `design-system` | Build tooling for the shared Material Design 3 component bundle (Google Material Web Components), vendored into each app's `public/vendor/`. |

## Documentation

Suite-wide design and architecture docs live in [`docs/`](./docs/) (see
[`docs/README.md`](./docs/README.md) for the index). App-specific setup/run
details stay in each app's own `README.md`. Highlights:

- [Deployment](./docs/deployment.md) — end-to-end deployment runbook
  (prerequisites, Postgres provisioning, `.env` management, systemd / nginx,
  backups, upgrades).
- [Database architecture](./docs/database-architecture.md) — one shared Postgres
  server, a database per app, per-app least-privilege roles.
- [AI Project Analyst](./docs/ai-project-analyst.md) — the WBS app's in-app AI
  assistant.
- [World Clocks widget](./docs/world-clocks-widget.md) — the timezone row on
  the landing page; lives in the standalone `world-clocks/` folder.

## Prerequisites

- **Node.js 20+** (the apps use native ESM, global `fetch`, and `node --watch`).
- **PostgreSQL** — required by `sm-wbs-app` (database `apac_wbs`). The suite uses
  **one shared Postgres server with a separate database per app**, each owned by
  its own least-privilege role — see *Database architecture* in
  `sm-wbs-app/README.md`.
- **npm**.

## Setup

1. **Install dependencies** in each app:
   ```
   cd sm-apac-landing       && npm install
   cd ../sm-test-script-builder && npm install
   cd ../sm-wbs-app         && npm install
   cd ../design-system      && npm install
   ```
2. **Create `.env` files** — copy each app's `.env.example` to `.env` and fill in
   the values (see *Environment* below). `.env` files are git-ignored.
3. **Database** (`sm-wbs-app`) — on a running Postgres server, provision the
   app's database + role once as a superuser:
   `psql -U postgres -v app_pw='...' -f sm-wbs-app/db/provision_apac_wbs.sql`,
   then either run `npm run migrate` or just start the app (migrations run
   automatically on startup). Each app owns its own database on the shared
   server — see *Database architecture* in `sm-wbs-app/README.md`.
4. **Design system** — run `npm run build` in `design-system/` to (re)generate
   `vendor/material-web.js` + `vendor/theme.css` for each app. Only needed after
   changing the component set or theme; the generated files are committed.

## Running

Start **only the shell** — it spawns the child apps on first use:

```
cd sm-apac-landing
node server.js          # or: npm run dev
```

Open <http://localhost:4000>. In dev mode you are signed in as your local OS
account; clicking a launcher card spawns and proxies to that child app.

## Environment

Each app reads a local `.env` (git-ignored — it holds secrets). `*.env.example`
templates list the required keys. Highlights:

- `sm-apac-landing` — `MODE` (`dev`/`prod`), `AZURE_CLIENT_ID` / `AZURE_TENANT_ID`
  (leave blank for dev mode).
- `sm-test-script-builder` — `MATCHA_API_KEY` and the Matcha endpoint config.
- `sm-wbs-app` — PostgreSQL connection (`WBS_DB_*`), and `WBS_BOOTSTRAP_ADMIN`
  (comma-separated emails promoted to admin on startup).



## Design system (Material Design 3)

`design-system/` bundles Google's **Material Web Components** plus the MD3 theme
tokens into a single `material-web.js` + `theme.css`, copied into each app's
`public/vendor/`. The apps stay build-free at runtime — they just serve the
committed vendored files. Re-run `npm run build` in `design-system/` whenever the
component set (`mwc-entry.js`) or theme (`theme.css`) changes.
