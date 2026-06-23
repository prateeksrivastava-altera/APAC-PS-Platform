-- 005 — soft-delete / archive flag for projects.
-- Archived projects are hidden from the default list but fully recoverable.

ALTER TABLE Projects
  ADD COLUMN IF NOT EXISTS IsArchived BOOLEAN NOT NULL DEFAULT FALSE;
