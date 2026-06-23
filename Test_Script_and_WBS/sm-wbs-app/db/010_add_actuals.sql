-- 010 — actuals tracking on the Resource Plan tab.
--
-- Captures actual hours consumed per resource per project. Decoupled from
-- ProjectResources on purpose: resources can be added to the actuals grid
-- WITHOUT also showing up as WBS columns (the WBS / Cost Estimate grids
-- read from ProjectResources).
--
-- - Resources currently in the project's WBS plan render in the actuals grid
--   automatically (their phase/total/buffered figures come from the plan).
-- - The "Rows" button on the Resource Plan tab adds rows here ONLY — the
--   added resource does not appear in the WBS grid.

CREATE TABLE IF NOT EXISTS ProjectResourceActuals (
    ProjectId    INTEGER NOT NULL REFERENCES Projects(ProjectId)  ON DELETE CASCADE,
    ResourceId   INTEGER NOT NULL REFERENCES Resources(ResourceId) ON DELETE RESTRICT,
    ActualHours  REAL    NOT NULL DEFAULT 0,
    PRIMARY KEY (ProjectId, ResourceId)
);

CREATE INDEX IF NOT EXISTS ix_actuals_project
    ON ProjectResourceActuals (ProjectId);
