-- 006 — per-user permission flags.
-- A row is auto-provisioned the first time a user is seen (see /api/me).
-- New users default to read-only with no elevated permissions.

CREATE TABLE IF NOT EXISTS UserPermissions (
    UserId            SERIAL  PRIMARY KEY,
    Username          TEXT    NOT NULL UNIQUE,
    Email             TEXT    NOT NULL DEFAULT '',
    IsReadOnly        BOOLEAN NOT NULL DEFAULT TRUE,
    CanViewAnalytics  BOOLEAN NOT NULL DEFAULT FALSE,
    CanViewSettings   BOOLEAN NOT NULL DEFAULT FALSE,
    CanDeleteProjects BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedAtUtc      TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
