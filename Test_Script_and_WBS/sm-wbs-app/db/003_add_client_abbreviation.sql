-- 003 — add Abbreviation column to Clients.
-- Idempotent: re-running on a DB that already has the column is a no-op.

ALTER TABLE Clients
  ADD COLUMN IF NOT EXISTS Abbreviation TEXT NOT NULL DEFAULT '';
