-- 012 — CanApprove flag on UserPermissions.
--
-- Gates the right to change a project's status TO "Approved" or AWAY from
-- "Approved" (the WBS-locking status added in migration 011). Treated as
-- one of the "elevated" permissions in the admin Users tab — a read-only
-- user can never hold it, an admin auto-receives it.
--
-- All existing users default to FALSE; admins must promote approvers
-- explicitly from the Users tab. `bootstrapAdmin()` ensures the env-driven
-- bootstrap admins always have this flag set, same as IsAdmin + CanViewSettings.

ALTER TABLE UserPermissions
  ADD COLUMN IF NOT EXISTS CanApprove BOOLEAN NOT NULL DEFAULT FALSE;
