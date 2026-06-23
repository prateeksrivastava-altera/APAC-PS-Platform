# APAC Services — Documentation

Central home for design, architecture, and feature documentation across the
APAC Professional Services tooling suite. App-specific operational details
(setup, env keys, endpoints) stay in each app's own `README.md`; **suite-wide
designs and cross-cutting concerns live here** so they have a stable home as the
suite grows.

## Index

| Document | What it covers |
|---|---|
| [deployment.md](./deployment.md) | End-to-end deployment runbook: prerequisites, PostgreSQL provisioning, `.env` management per app, systemd / nginx / TLS, backups, upgrades, and verification. |
| [database-architecture.md](./database-architecture.md) | One shared PostgreSQL server, a database per app, per-app least-privilege roles, lock isolation, provisioning, and scaling. |
| [ai-project-analyst.md](./ai-project-analyst.md) | The in-app AI Project Analyst in the WBS app — data scope, Matcha mission, API, conversation storage, and UI (tab, drawer, quick prompts, feedback). |
| [world-clocks-widget.md](./world-clocks-widget.md) | The world-clocks row on the APAC landing page — interaction model, time conversion, city list, animation, and the self-contained `world-clocks/` folder it lives in. |

## Adding a new document

1. Copy [TEMPLATE.md](./TEMPLATE.md) to `docs/<kebab-case-title>.md`.
2. Fill in the sections; keep it concise and scannable.
3. Add a row to the **Index** table above.
4. If the doc supersedes or expands a section in an app `README.md`, leave a
   one-line pointer in that README linking here (single source of truth).

## Conventions

- **Audience:** engineers maintaining or extending the suite.
- **Scope:** put cross-app/architecture material here; keep app-only "how to run
  it" material in the app's README.
- **Keep it current:** when a design changes, update the doc in the same change
  set as the code. A stale doc is worse than none.
- **No secrets.** Reference env var *names*, never real credential values.
