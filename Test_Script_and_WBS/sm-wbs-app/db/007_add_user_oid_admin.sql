-- 007 — Azure AD identity + admin role for UserPermissions.
--
-- Email becomes the unifying lookup key (dev mode: <name>@local; prod: the AD
-- UPN). AzureOid is stamped onto the row the first time a user signs in with a
-- real Azure token. UserId stays the surrogate primary key — neither Email nor
-- AzureOid is ever the PK.

ALTER TABLE UserPermissions
  ADD COLUMN IF NOT EXISTS AzureOid TEXT;

ALTER TABLE UserPermissions
  ADD COLUMN IF NOT EXISTS IsAdmin BOOLEAN NOT NULL DEFAULT FALSE;

-- Username is now a display field only — drop its blanket UNIQUE constraint so
-- duplicate AD display names can coexist.
ALTER TABLE UserPermissions
  DROP CONSTRAINT IF EXISTS userpermissions_username_key;

-- Email is the roster / login lookup key: case-insensitive, unique.
CREATE UNIQUE INDEX IF NOT EXISTS ux_userpermissions_email
  ON UserPermissions (LOWER(Email));

-- Fast lookup by Azure object id; unique only among rows already linked to an
-- AD account (rows pre-loaded by an admin have AzureOid NULL until first login).
CREATE UNIQUE INDEX IF NOT EXISTS ux_userpermissions_oid
  ON UserPermissions (AzureOid)
  WHERE AzureOid IS NOT NULL;
