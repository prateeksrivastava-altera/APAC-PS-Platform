-- 008 — active / inactive flag for UserPermissions.
--
-- A deactivated user keeps their row and configured flags, but is treated as
-- read-only with no elevated access until reactivated (see resolvePermissions).
-- Inactive users are hidden from the admin roster unless "Show inactive" is on.

ALTER TABLE UserPermissions
  ADD COLUMN IF NOT EXISTS IsActive BOOLEAN NOT NULL DEFAULT TRUE;
