-- 011 — widen Projects.status CHECK constraint to allow 'Approved'.
--
-- When a WBS reaches "Approved" the UI locks the WBS read-only (only the
-- status dropdown and the Actuals grid stay editable). The constraint was
-- previously {Draft, Final, Revised}; this migration drops and re-creates
-- it to add Approved.

ALTER TABLE Projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE Projects
  ADD CONSTRAINT projects_status_check
  CHECK (status = ANY (ARRAY['Draft', 'Final', 'Revised', 'Approved']));
