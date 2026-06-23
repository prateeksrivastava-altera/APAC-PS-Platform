-- 004 — Product / Solution / Module master lists + Project references.
-- Idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS Products (
    ProductId    SERIAL PRIMARY KEY,
    Name         TEXT    NOT NULL,
    DisplayOrder INTEGER NOT NULL DEFAULT 0,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS Solutions (
    SolutionId   SERIAL PRIMARY KEY,
    Name         TEXT    NOT NULL,
    DisplayOrder INTEGER NOT NULL DEFAULT 0,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS Modules (
    ModuleId     SERIAL PRIMARY KEY,
    Name         TEXT    NOT NULL,
    DisplayOrder INTEGER NOT NULL DEFAULT 0,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE
);

-- Project references (nullable — a project may not have all three set).
ALTER TABLE Projects ADD COLUMN IF NOT EXISTS ProductId  INTEGER NULL;
ALTER TABLE Projects ADD COLUMN IF NOT EXISTS SolutionId INTEGER NULL;
ALTER TABLE Projects ADD COLUMN IF NOT EXISTS ModuleId   INTEGER NULL;
