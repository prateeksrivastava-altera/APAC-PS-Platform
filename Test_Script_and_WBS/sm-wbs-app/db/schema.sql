-- ApacWbsApp: PostgreSQL schema
-- Executed once by DatabaseInitializer on fresh database installation.

CREATE TABLE IF NOT EXISTS Projects (
    ProjectId        SERIAL PRIMARY KEY,
    ClientName       TEXT    NOT NULL,
    ProjectName      TEXT    NOT NULL,
    SowOrTaskId      TEXT    NOT NULL,
    Status           TEXT    NOT NULL DEFAULT 'Draft'
                     CHECK (Status IN ('Draft','Final','Revised')),
    CreatedAtUtc     TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    CreatedBy        TEXT    NOT NULL,
    ModifiedAtUtc    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    ModifiedBy       TEXT    NOT NULL,
    BufferPercent    INTEGER NOT NULL DEFAULT 20,
    StartDate        TEXT    NULL,
    CostingProfileId INTEGER NULL
);

CREATE INDEX IF NOT EXISTS IX_Projects_Modified ON Projects (ModifiedAtUtc DESC);

CREATE TABLE IF NOT EXISTS Clients (
    ClientId     SERIAL PRIMARY KEY,
    Name         TEXT    NOT NULL UNIQUE,
    DisplayOrder INTEGER NOT NULL DEFAULT 0,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS Resources (
    ResourceId          SERIAL PRIMARY KEY,
    RoleName            TEXT NOT NULL,
    ShortCode           TEXT NOT NULL UNIQUE,
    DisplayOrder        INTEGER NOT NULL DEFAULT 0,
    IsActive            BOOLEAN NOT NULL DEFAULT TRUE,
    CostingDescription  TEXT NOT NULL DEFAULT '',
    CostingCode         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS WbsTasks (
    TaskId       SERIAL PRIMARY KEY,
    ProjectId    INTEGER NOT NULL REFERENCES Projects(ProjectId) ON DELETE CASCADE,
    ParentTaskId INTEGER NULL REFERENCES WbsTasks(TaskId) ON DELETE CASCADE,
    Depth        INTEGER NOT NULL CHECK (Depth BETWEEN 1 AND 4),
    SortOrder    INTEGER NOT NULL,
    RowNumber    TEXT NOT NULL,
    TaskName     TEXT NOT NULL,
    IsConcurrent BOOLEAN NOT NULL DEFAULT FALSE,
    Notes        TEXT NULL,
    DurationDays INTEGER NULL
);

CREATE INDEX IF NOT EXISTS IX_WbsTasks_Project ON WbsTasks (ProjectId);
CREATE INDEX IF NOT EXISTS IX_WbsTasks_Parent  ON WbsTasks (ParentTaskId);

CREATE TABLE IF NOT EXISTS TaskResourceHours (
    TaskId     INTEGER NOT NULL REFERENCES WbsTasks(TaskId) ON DELETE CASCADE,
    ResourceId INTEGER NOT NULL REFERENCES Resources(ResourceId),
    Hours      REAL NOT NULL,
    PRIMARY KEY (TaskId, ResourceId)
);

CREATE TABLE IF NOT EXISTS TaskDependencies (
    TaskId          INTEGER NOT NULL REFERENCES WbsTasks(TaskId) ON DELETE CASCADE,
    DependsOnTaskId INTEGER NOT NULL REFERENCES WbsTasks(TaskId) ON DELETE CASCADE,
    PRIMARY KEY (TaskId, DependsOnTaskId)
);

CREATE INDEX IF NOT EXISTS IX_TaskDependencies_Task      ON TaskDependencies (TaskId);
CREATE INDEX IF NOT EXISTS IX_TaskDependencies_DependsOn ON TaskDependencies (DependsOnTaskId);

CREATE TABLE IF NOT EXISTS WbsTemplates (
    TemplateId   SERIAL PRIMARY KEY,
    TemplateName TEXT NOT NULL,
    Description  TEXT NULL
);

CREATE TABLE IF NOT EXISTS WbsTemplateTasks (
    TemplateTaskId       SERIAL PRIMARY KEY,
    TemplateId           INTEGER NOT NULL REFERENCES WbsTemplates(TemplateId) ON DELETE CASCADE,
    ParentTemplateTaskId INTEGER NULL REFERENCES WbsTemplateTasks(TemplateTaskId) ON DELETE CASCADE,
    SortOrder            INTEGER NOT NULL,
    Depth                INTEGER NOT NULL,
    TaskName             TEXT NOT NULL,
    IsConcurrent         BOOLEAN NOT NULL DEFAULT FALSE,
    DefaultHoursJson     TEXT NULL
);

CREATE INDEX IF NOT EXISTS IX_WbsTemplateTasks_Template ON WbsTemplateTasks (TemplateId);

CREATE TABLE IF NOT EXISTS ProjectResources (
    ProjectId     INTEGER NOT NULL REFERENCES Projects(ProjectId)   ON DELETE CASCADE,
    ResourceId    INTEGER NOT NULL REFERENCES Resources(ResourceId)  ON DELETE CASCADE,
    SortOrder     INTEGER NOT NULL DEFAULT 0,
    BufferPercent INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ProjectId, ResourceId)
);

CREATE INDEX IF NOT EXISTS IX_ProjectResources_Project ON ProjectResources (ProjectId);

CREATE TABLE IF NOT EXISTS TemplateResources (
    TemplateId INTEGER NOT NULL REFERENCES WbsTemplates(TemplateId) ON DELETE CASCADE,
    ResourceId INTEGER NOT NULL REFERENCES Resources(ResourceId)    ON DELETE CASCADE,
    PRIMARY KEY (TemplateId, ResourceId)
);

CREATE INDEX IF NOT EXISTS IX_TemplateResources_Template ON TemplateResources (TemplateId);

CREATE TABLE IF NOT EXISTS ProjectVersions (
    VersionId      SERIAL PRIMARY KEY,
    ProjectId      INTEGER NOT NULL REFERENCES Projects(ProjectId) ON DELETE CASCADE,
    VersionNumber  INTEGER NOT NULL,
    StatusAtSave   TEXT    NOT NULL,
    CreatedAtUtc   TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    CreatedBy      TEXT    NOT NULL,
    ChangeSummary  TEXT    NOT NULL DEFAULT '',
    SnapshotJson   TEXT    NOT NULL,
    UNIQUE (ProjectId, VersionNumber)
);

CREATE INDEX IF NOT EXISTS IX_ProjectVersions_Project ON ProjectVersions (ProjectId, VersionNumber DESC);

CREATE TABLE IF NOT EXISTS CostingProfiles (
    ProfileId   SERIAL PRIMARY KEY,
    ProfileName TEXT    NOT NULL,
    Description TEXT    NULL
);

CREATE TABLE IF NOT EXISTS CostingProfileRates (
    ProfileId   INTEGER NOT NULL REFERENCES CostingProfiles(ProfileId) ON DELETE CASCADE,
    ResourceId  INTEGER NOT NULL REFERENCES Resources(ResourceId)      ON DELETE CASCADE,
    RatePerHour REAL    NOT NULL DEFAULT 0,
    PRIMARY KEY (ProfileId, ResourceId)
);

CREATE TABLE IF NOT EXISTS AppliedMigrations (
    MigrationId TEXT PRIMARY KEY,
    AppliedAt   TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
