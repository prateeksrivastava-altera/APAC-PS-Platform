import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import config from "./config.js";
import { query, pingDb, close, getPool } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { schedule } from "./lib/scheduleEngine.js";
import { exportProject } from "./lib/exporter.js";
import { monthlyDemandForProject } from "./lib/analytics.js";
import { validateUpdateProjectBody } from "./lib/validation.js";
import { callMission } from "./lib/matcha/matchaApiService.js";
import { buildContextPayload } from "./lib/ai/contextBuilder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ----- /health: spawn-readiness probe used by the APAC shell launcher -----
app.get("/health", (req, res) => res.json({ ok: true }));

// Resolve the caller's identity + permission flags from the shell's
// X-Forwarded-* headers.
//
//   1. If an Azure object id (oid) is present, look the row up by it.
//   2. Otherwise look up by email — the unifying key for dev (<name>@local)
//      and prod (the AD UPN). A pre-loaded roster row is matched here; the
//      first real login stamps its AzureOid and refreshes the display name.
//   3. An unrecognised user is auto-provisioned read-only.
//
// IMPORTANT: this function never writes the permission flag columns. Flags are
// "sticky" — set only by an admin via /api/permissions — so login / logout /
// inactivity can never reset a user's access level.
async function resolvePermissions(req) {
  const name = (req.headers["x-forwarded-user"] || "Developer").toString().trim() || "Developer";
  const oid = (req.headers["x-forwarded-oid"] || "").toString().trim();
  const email = (req.headers["x-forwarded-email"] || "").toString().trim() || `${name}@local`;

  let row = null;

  // 1. Fast path — an already-linked account, keyed by the stable Azure oid.
  if (oid) {
    const r = await query("SELECT * FROM UserPermissions WHERE AzureOid = $1", [oid]);
    row = r.rows[0] || null;
  }

  // 2. Roster / prior row, keyed by email.
  if (!row) {
    const r = await query(
      "SELECT * FROM UserPermissions WHERE LOWER(Email) = LOWER($1)", [email]);
    row = r.rows[0] || null;
    // First login of a pre-loaded roster user — stamp the oid + display name.
    // Flag columns are deliberately left untouched.
    if (row && oid && !row.azureoid) {
      const upd = await query(
        `UPDATE UserPermissions SET AzureOid = $1, Username = $2
           WHERE UserId = $3 RETURNING *`,
        [oid, name, row.userid]
      );
      row = upd.rows[0] || row;
    }
  }

  // 3. Unknown user — auto-provision a read-only row.
  if (!row) {
    const ins = await query(
      `INSERT INTO UserPermissions (Username, Email, AzureOid)
       VALUES ($1, $2, $3)
       ON CONFLICT (LOWER(Email)) DO NOTHING
       RETURNING *`,
      [name, email, oid || null]
    );
    if (ins.rows[0]) {
      row = ins.rows[0];
    } else {
      // Lost an insert race against a concurrent request — re-read.
      const r = await query(
        "SELECT * FROM UserPermissions WHERE LOWER(Email) = LOWER($1)", [email]);
      row = r.rows[0] || null;
    }
  }

  row = row || {};
  // A deactivated user keeps their row + configured flags, but is treated as
  // read-only with no elevated access until an admin reactivates them.
  const active = row.isactive !== false;
  return {
    userId: row.userid,
    username: row.username || name,
    email: row.email || email,
    azureOid: row.azureoid || null,
    isActive: active,
    isReadOnly: active ? row.isreadonly !== false : true,
    canViewAnalytics: active && row.canviewanalytics === true,
    canViewSettings: active && row.canviewsettings === true,
    canDeleteProjects: active && row.candeleteprojects === true,
    // Migration 012 — required to change a project's status to/from "Approved".
    canApprove: active && row.canapprove === true,
    isAdmin: active && row.isadmin === true,
  };
}

// Middleware: block any mutation for read-only accounts.
async function requireWrite(req, res, next) {
  try {
    const perm = await resolvePermissions(req);
    if (perm.isReadOnly) {
      return res.status(403).json({ error: "Your account is read-only — you cannot make changes." });
    }
    next();
  } catch (err) {
    console.error("[wbs] requireWrite check failed:", err.message);
    res.status(500).json({ error: "Permission check failed" });
  }
}

// Middleware: block project deletion unless explicitly granted.
async function requireDeletePermission(req, res, next) {
  try {
    const perm = await resolvePermissions(req);
    if (!perm.canDeleteProjects) {
      return res.status(403).json({ error: "You do not have permission to delete projects." });
    }
    next();
  } catch (err) {
    console.error("[wbs] requireDeletePermission check failed:", err.message);
    res.status(500).json({ error: "Permission check failed" });
  }
}

// Middleware: gate the user-administration endpoints to admins only.
async function requireAdmin(req, res, next) {
  try {
    const perm = await resolvePermissions(req);
    if (!perm.isAdmin) {
      return res.status(403).json({ error: "Admin access required." });
    }
    next();
  } catch (err) {
    console.error("[wbs] requireAdmin check failed:", err.message);
    res.status(500).json({ error: "Permission check failed" });
  }
}

// Middleware: gate the analytics endpoints to users granted CanViewAnalytics.
async function requireAnalytics(req, res, next) {
  try {
    const perm = await resolvePermissions(req);
    if (!perm.canViewAnalytics) {
      return res.status(403).json({ error: "You do not have access to analytics." });
    }
    next();
  } catch (err) {
    console.error("[wbs] requireAnalytics check failed:", err.message);
    res.status(500).json({ error: "Permission check failed" });
  }
}

// Middleware: gate routes whose only purpose is changing approval status.
// (The PUT /api/projects/:id handler does its own conditional check too,
// so this is here for any future approval-only endpoints.)
async function requireApprover(req, res, next) {
  try {
    const perm = await resolvePermissions(req);
    if (!perm.canApprove) {
      return res.status(403).json({ error: "You do not have permission to approve projects." });
    }
    next();
  } catch (err) {
    console.error("[wbs] requireApprover check failed:", err.message);
    res.status(500).json({ error: "Permission check failed" });
  }
}

// ----- /api/me: current user from the shell's X-Forwarded-* headers -----
// Auto-provisions a UserPermissions row the first time a user is seen.
// New users default to read-only with no elevated permissions.
app.get("/api/me", async (req, res) => {
  const fallbackName = (req.headers["x-forwarded-user"] || "Developer").toString().trim() || "Developer";
  try {
    const perm = await resolvePermissions(req);
    res.json({
      name: perm.username,
      username: perm.username,
      email: perm.email,
      permissions: {
        isReadOnly: perm.isReadOnly,
        canViewAnalytics: perm.canViewAnalytics,
        canViewSettings: perm.canViewSettings,
        canDeleteProjects: perm.canDeleteProjects,
        canApprove: perm.canApprove,
        isAdmin: perm.isAdmin,
      },
    });
  } catch (err) {
    console.error("[wbs] /api/me failed:", err.message);
    // Degrade gracefully — never block the app on the permissions table.
    res.json({
      name: fallbackName,
      username: fallbackName,
      email: `${fallbackName}@local`,
      permissions: {
        isReadOnly: true,
        canViewAnalytics: false,
        canViewSettings: false,
        canDeleteProjects: false,
        canApprove: false,
        isAdmin: false,
      },
    });
  }
});

// Shape a UserPermissions DB row for the admin UI.
function permissionRowToJson(row) {
  return {
    userId: row.userid,
    username: row.username,
    email: row.email,
    azureOid: row.azureoid || null,
    linked: !!row.azureoid, // true once the user has signed in at least once
    isActive: row.isactive !== false,
    isReadOnly: row.isreadonly === true,
    canViewAnalytics: row.canviewanalytics === true,
    canViewSettings: row.canviewsettings === true,
    canDeleteProjects: row.candeleteprojects === true,
    canApprove: row.canapprove === true,
    isAdmin: row.isadmin === true,
    createdAtUtc: row.createdatutc,
  };
}

// ----- /api/permissions: admin-only roster management -----
app.get("/api/permissions", requireAdmin, async (req, res) => {
  try {
    const r = await query(
      `SELECT UserId, Username, Email, AzureOid, IsActive, IsReadOnly, CanViewAnalytics,
              CanViewSettings, CanDeleteProjects, CanApprove, IsAdmin, CreatedAtUtc
         FROM UserPermissions
        ORDER BY LOWER(Email)`
    );
    res.json(r.rows.map(permissionRowToJson));
  } catch (err) {
    console.error("[wbs] GET /api/permissions failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/permissions — pre-load a roster user. AzureOid stays NULL until
// that person signs in for the first time (resolvePermissions stamps it).
app.post("/api/permissions", requireAdmin, async (req, res) => {
  const b = req.body || {};
  const email = (b.email || "").toString().trim();
  const name = (b.name || "").toString().trim() || email;
  if (!email) return res.status(400).json({ error: "email is required" });
  try {
    const ins = await query(
      `INSERT INTO UserPermissions
         (Username, Email, IsReadOnly, CanViewAnalytics,
          CanViewSettings, CanDeleteProjects, CanApprove, IsAdmin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (LOWER(Email)) DO NOTHING
       RETURNING *`,
      [
        name, email,
        b.isReadOnly !== false,
        b.canViewAnalytics === true,
        b.canViewSettings === true,
        b.canDeleteProjects === true,
        b.canApprove === true,
        b.isAdmin === true,
      ]
    );
    if (!ins.rows[0]) {
      return res.status(409).json({ error: "A user with that email already exists." });
    }
    res.status(201).json(permissionRowToJson(ins.rows[0]));
  } catch (err) {
    console.error("[wbs] POST /api/permissions failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/permissions/:id — edit a user's name / email / permission flags.
app.patch("/api/permissions/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id must be an integer" });
  const b = req.body || {};
  const sets = [];
  const vals = [];
  let i = 1;
  const addStr = (key, col) => {
    if (typeof b[key] === "string" && b[key].trim()) {
      sets.push(`${col} = $${i++}`);
      vals.push(b[key].trim());
    }
  };
  const addBool = (key, col) => {
    if (typeof b[key] === "boolean") {
      sets.push(`${col} = $${i++}`);
      vals.push(b[key]);
    }
  };
  addStr("name", "Username");
  addStr("email", "Email");
  addBool("isReadOnly", "IsReadOnly");
  addBool("canViewAnalytics", "CanViewAnalytics");
  addBool("canViewSettings", "CanViewSettings");
  addBool("canDeleteProjects", "CanDeleteProjects");
  addBool("canApprove", "CanApprove");
  addBool("isAdmin", "IsAdmin");
  addBool("isActive", "IsActive");
  if (sets.length === 0) {
    return res.status(400).json({ error: "no editable fields supplied" });
  }
  vals.push(id);
  try {
    const r = await query(
      `UPDATE UserPermissions SET ${sets.join(", ")} WHERE UserId = $${i} RETURNING *`,
      vals
    );
    if (r.rowCount === 0) return res.status(404).json({ error: `user ${id} not found` });
    res.json(permissionRowToJson(r.rows[0]));
  } catch (err) {
    // 23505 = unique-violation (an email collision with another row).
    if (err.code === "23505") {
      return res.status(409).json({ error: "That email is already used by another user." });
    }
    console.error("[wbs] PATCH /api/permissions failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- /api/analytics/portfolio: effort summaries across active projects -----
// Pure SQL — fast. The frontend computes the by-status / by-product / etc.
// group-bys in memory from the per-project rows.
app.get("/api/analytics/portfolio", requireAnalytics, async (req, res) => {
  try {
    // Per-project hours. TaskResourceHours rows live on leaf tasks, so a plain
    // SUM is the project grand total. Buffered = hours x per-resource buffer.
    const projRes = await query(`
      SELECT
        p.ProjectId      AS "projectId",
        p.ProjectName    AS "projectName",
        p.ClientName     AS "clientName",
        p.Status         AS "status",
        p.CreatedAtUtc   AS "createdAtUtc",
        p.ModifiedAtUtc  AS "modifiedAtUtc",
        p.StartDate      AS "startDate",
        prod.Name        AS "productName",
        sol.Name         AS "solutionName",
        mod.Name         AS "moduleName",
        COALESCE(SUM(trh.Hours), 0) AS "totalHours",
        COALESCE(SUM(trh.Hours * (1 + COALESCE(pr.BufferPercent, 0) / 100.0)), 0) AS "bufferedHours",
        COUNT(DISTINCT wt.TaskId) AS "taskCount"
      FROM Projects p
      LEFT JOIN Products  prod ON prod.ProductId  = p.ProductId
      LEFT JOIN Solutions sol  ON sol.SolutionId  = p.SolutionId
      LEFT JOIN Modules   mod  ON mod.ModuleId    = p.ModuleId
      LEFT JOIN WbsTasks  wt   ON wt.ProjectId    = p.ProjectId
      LEFT JOIN TaskResourceHours trh ON trh.TaskId = wt.TaskId
      LEFT JOIN ProjectResources  pr  ON pr.ProjectId = p.ProjectId AND pr.ResourceId = trh.ResourceId
      WHERE p.IsArchived = FALSE
      GROUP BY p.ProjectId, p.ProjectName, p.ClientName, p.Status, p.CreatedAtUtc,
               p.ModifiedAtUtc, p.StartDate, prod.Name, sol.Name, mod.Name
      ORDER BY p.ModifiedAtUtc DESC
    `);
    const projects = projRes.rows.map((r) => ({
      ...r,
      totalHours: Number(r.totalHours) || 0,
      bufferedHours: Number(r.bufferedHours) || 0,
      taskCount: Number(r.taskCount) || 0,
    }));

    // Total hours per resource role across all active projects.
    const demandRes = await query(`
      SELECT
        r.ResourceId AS "resourceId",
        r.RoleName   AS "roleName",
        r.ShortCode  AS "shortCode",
        COALESCE(SUM(trh.Hours), 0) AS "hours",
        COALESCE(SUM(trh.Hours * (1 + COALESCE(pr.BufferPercent, 0) / 100.0)), 0) AS "bufferedHours"
      FROM Resources r
      JOIN TaskResourceHours trh ON trh.ResourceId = r.ResourceId
      JOIN WbsTasks wt ON wt.TaskId = trh.TaskId
      JOIN Projects p  ON p.ProjectId = wt.ProjectId AND p.IsArchived = FALSE
      LEFT JOIN ProjectResources pr ON pr.ProjectId = p.ProjectId AND pr.ResourceId = r.ResourceId
      GROUP BY r.ResourceId, r.RoleName, r.ShortCode
      ORDER BY SUM(trh.Hours) DESC
    `);
    const resourceDemand = demandRes.rows.map((r) => ({
      ...r,
      hours: Number(r.hours) || 0,
      bufferedHours: Number(r.bufferedHours) || 0,
    }));

    res.json({ projects, resourceDemand, generatedAtUtc: new Date().toISOString() });
  } catch (err) {
    console.error("[wbs] /api/analytics/portfolio error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- /api/analytics/resource-demand-monthly: month-by-month demand -----
// Heavier — runs the schedule engine per project. Fetched lazily by the UI
// only when the user opens the "Monthly resource demand" section.
app.get("/api/analytics/resource-demand-monthly", requireAnalytics, async (req, res) => {
  try {
    const projRes = await query(
      `SELECT ProjectId AS "projectId", StartDate AS "startDate"
         FROM Projects WHERE IsArchived = FALSE`
    );

    let skippedNoStartDate = 0;
    const demand = new Map();   // resourceId -> Map<"YYYY-MM", hours>
    const monthsSet = new Set();

    for (const p of projRes.rows) {
      if (!p.startDate) { skippedNoStartDate++; continue; }

      const taskRes = await query(
        `SELECT TaskId AS "taskId", ParentTaskId AS "parentTaskId",
                RowNumber AS "rowNumber", SortOrder AS "sortOrder", Depth AS "depth",
                TaskName AS "taskName", IsConcurrent AS "isConcurrent",
                DurationDays AS "durationDays"
           FROM WbsTasks WHERE ProjectId = $1 ORDER BY Depth, SortOrder`,
        [p.projectId]
      );
      if (taskRes.rows.length === 0) continue;

      const tasks = taskRes.rows.map((t) => ({ ...t, resourceHours: {}, dependsOnTaskIds: [] }));
      const byId = new Map(tasks.map((t) => [t.taskId, t]));

      const hoursRes = await query(
        `SELECT h.TaskId, h.ResourceId, h.Hours FROM TaskResourceHours h
         JOIN WbsTasks t ON t.TaskId = h.TaskId WHERE t.ProjectId = $1`,
        [p.projectId]
      );
      for (const h of hoursRes.rows) {
        const t = byId.get(h.taskid);
        if (t) t.resourceHours[h.resourceid] = Number(h.hours);
      }
      const depRes = await query(
        `SELECT d.TaskId, d.DependsOnTaskId FROM TaskDependencies d
         JOIN WbsTasks t ON t.TaskId = d.TaskId WHERE t.ProjectId = $1`,
        [p.projectId]
      );
      for (const d of depRes.rows) {
        const t = byId.get(d.taskid);
        if (t) t.dependsOnTaskIds.push(d.dependsontaskid);
      }

      const sched = schedule(tasks, p.startDate.slice(0, 10));
      const scheduleMap = {};
      for (const [id, row] of sched.entries()) {
        scheduleMap[id] = { startDate: row.startDate, endDate: row.endDate, isLeaf: row.isLeaf };
      }

      for (const [month, resMap] of monthlyDemandForProject(tasks, scheduleMap).entries()) {
        monthsSet.add(month);
        for (const [resId, hrs] of resMap.entries()) {
          if (!demand.has(resId)) demand.set(resId, new Map());
          const dm = demand.get(resId);
          dm.set(month, (dm.get(month) || 0) + hrs);
        }
      }
    }

    const months = [...monthsSet].sort();
    const resRes = await query(
      `SELECT ResourceId AS "resourceId", RoleName AS "roleName",
              ShortCode AS "shortCode", DisplayOrder AS "displayOrder"
         FROM Resources ORDER BY DisplayOrder, RoleName`
    );
    const rows = resRes.rows
      .filter((r) => demand.has(r.resourceId))
      .map((r) => {
        const dm = demand.get(r.resourceId);
        return {
          resourceId: r.resourceId,
          roleName: r.roleName,
          shortCode: r.shortCode,
          monthly: months.map((m) => Math.round((dm.get(m) || 0) * 10) / 10),
        };
      });

    res.json({ months, rows, skippedNoStartDate, generatedAtUtc: new Date().toISOString() });
  } catch (err) {
    console.error("[wbs] /api/analytics/resource-demand-monthly error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- /api/status: DB liveness + project count (used by debug page). -----
app.get("/api/status", async (req, res) => {
  try {
    await pingDb();
    const r = await query("SELECT COUNT(*)::int AS count FROM Projects");
    res.json({
      ok: true,
      mode: config.mode,
      db: {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
      },
      projects: r.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ----- /api/projects: list, ordered by most recently modified. Mirrors -----
// ProjectRepo.GetAllAsync() in the .NET app. Status normalised to lowercase
// so the chip CSS classes are predictable.
app.get("/api/projects", async (req, res) => {
  // Archived projects are excluded unless ?includeArchived=1.
  const includeArchived = /^(1|true)$/i.test(req.query.includeArchived || "");
  try {
    const r = await query(`
      SELECT
        p.ProjectId       AS "projectId",
        p.ClientName      AS "clientName",
        p.ProjectName     AS "projectName",
        p.SowOrTaskId     AS "sowOrTaskId",
        p.Status          AS "status",
        p.CreatedAtUtc    AS "createdAtUtc",
        p.CreatedBy       AS "createdBy",
        p.ModifiedAtUtc   AS "modifiedAtUtc",
        p.ModifiedBy      AS "modifiedBy",
        p.IsArchived      AS "isArchived",
        prod.Name         AS "productName",
        sol.Name          AS "solutionName",
        mod.Name          AS "moduleName"
      FROM Projects p
      LEFT JOIN Products  prod ON prod.ProductId  = p.ProductId
      LEFT JOIN Solutions sol  ON sol.SolutionId  = p.SolutionId
      LEFT JOIN Modules   mod  ON mod.ModuleId    = p.ModuleId
      ${includeArchived ? "" : "WHERE p.IsArchived = FALSE"}
      ORDER BY p.ModifiedAtUtc DESC
    `);
    res.json(r.rows);
  } catch (err) {
    console.error("[wbs] /api/projects error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/projects/:id/archived — soft-delete toggle. Body: { archived: bool }.
// Reversible — does not touch any child rows.
app.patch("/api/projects/:id/archived", requireWrite, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id must be an integer" });
  const archived = !!req.body?.archived;
  try {
    const r = await query(
      "UPDATE Projects SET IsArchived = $1 WHERE ProjectId = $2", [archived, id]);
    if (r.rowCount === 0) return res.status(404).json({ error: `project ${id} not found` });
    res.json({ ok: true, archived });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----- DELETE /api/projects/:id: permanently delete a project ----------
// FK cascades (WbsTasks, TaskResourceHours, TaskDependencies, ProjectResources,
// ProjectVersions all ON DELETE CASCADE) clear every child row automatically.
// This is irreversible — the UI gates it behind an explicit confirmation.
app.delete("/api/projects/:id", requireDeletePermission, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id must be an integer" });
  try {
    const r = await query("DELETE FROM Projects WHERE ProjectId = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: `project ${id} not found` });
    res.json({ ok: true });
  } catch (err) {
    console.error(`[wbs] DELETE /api/projects/${id} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----- /api/projects/:id: full read-only project bundle for Phase D.1 -----
// Returns project metadata + assigned resources + flat task tree (with hours
// and dependencies inlined) + per-task schedule dates computed server-side
// via the ScheduleEngine port. Mirrors the data ProjectPageVm loads in the
// .NET app.
app.get("/api/projects/:id", async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: "id must be an integer" });
  }
  try {
    // Project row
    const projRes = await query(
      `SELECT ProjectId AS "projectId", ClientName AS "clientName",
              ProjectName AS "projectName", SowOrTaskId AS "sowOrTaskId",
              Status AS "status", CreatedAtUtc AS "createdAtUtc",
              CreatedBy AS "createdBy", ModifiedAtUtc AS "modifiedAtUtc",
              ModifiedBy AS "modifiedBy", BufferPercent AS "bufferPercent",
              StartDate AS "startDate", CostingProfileId AS "costingProfileId",
              ProductId AS "productId", SolutionId AS "solutionId", ModuleId AS "moduleId"
       FROM Projects WHERE ProjectId = $1`,
      [projectId]
    );
    if (projRes.rowCount === 0) {
      return res.status(404).json({ error: `project ${projectId} not found` });
    }
    const project = projRes.rows[0];

    // Resources assigned to this project (with per-project buffer %)
    const projResRes = await query(
      `SELECT r.ResourceId AS "resourceId", r.RoleName AS "roleName",
              r.ShortCode AS "shortCode", r.DisplayOrder AS "displayOrder",
              r.IsActive AS "isActive", pr.BufferPercent AS "bufferPercent"
       FROM ProjectResources pr
       JOIN Resources r ON r.ResourceId = pr.ResourceId
       WHERE pr.ProjectId = $1
       ORDER BY r.DisplayOrder`,
      [projectId]
    );

    // Tasks
    const taskRes = await query(
      `SELECT TaskId AS "taskId", ProjectId AS "projectId",
              ParentTaskId AS "parentTaskId", RowNumber AS "rowNumber",
              SortOrder AS "sortOrder", Depth AS "depth",
              TaskName AS "taskName", IsConcurrent AS "isConcurrent",
              Notes AS "notes", DurationDays AS "durationDays"
       FROM WbsTasks WHERE ProjectId = $1
       ORDER BY Depth, SortOrder`,
      [projectId]
    );
    const tasks = taskRes.rows.map((t) => ({
      ...t,
      resourceHours: {},
      dependsOnTaskIds: [],
    }));
    const byId = new Map(tasks.map((t) => [t.taskId, t]));

    if (tasks.length > 0) {
      // Hours
      const hoursRes = await query(
        `SELECT h.TaskId, h.ResourceId, h.Hours
         FROM TaskResourceHours h
         JOIN WbsTasks t ON t.TaskId = h.TaskId
         WHERE t.ProjectId = $1`,
        [projectId]
      );
      for (const h of hoursRes.rows) {
        const t = byId.get(h.taskid);
        if (t) t.resourceHours[h.resourceid] = Number(h.hours);
      }

      // Dependencies
      const depRes = await query(
        `SELECT d.TaskId, d.DependsOnTaskId
         FROM TaskDependencies d
         JOIN WbsTasks t ON t.TaskId = d.TaskId
         WHERE t.ProjectId = $1`,
        [projectId]
      );
      for (const d of depRes.rows) {
        const t = byId.get(d.taskid);
        if (t) t.dependsOnTaskIds.push(d.dependsontaskid);
      }
    }

    // Compute schedule. Use the project's StartDate, falling back to today.
    const start = (project.startDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const sched = schedule(tasks, start);
    const scheduleMap = {};
    for (const [id, row] of sched.entries()) {
      scheduleMap[id] = {
        startDate: row.startDate,
        endDate: row.endDate,
        totalHours: row.totalHours,
        isLeaf: row.isLeaf,
      };
    }

    // Actual hours per resource (migration 010). Decoupled from
    // ProjectResources so the Actuals grid can include resources not in
    // the WBS plan; see /sm-wbs-app/db/010_add_actuals.sql.
    const actualsRes = await query(
      `SELECT ResourceId AS "resourceId", ActualHours AS "actualHours"
         FROM ProjectResourceActuals WHERE ProjectId = $1`,
      [projectId]
    );

    res.json({
      project,
      resources: projResRes.rows,
      tasks,
      schedule: scheduleMap,
      actuals: actualsRes.rows.map((r) => ({
        resourceId: r.resourceId,
        actualHours: Number(r.actualHours) || 0,
      })),
    });
  } catch (err) {
    console.error(`[wbs] /api/projects/${projectId} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Excel export — streams an .xlsx for the project (4 sheets).
app.get("/api/projects/:id/export/xlsx", async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: "id must be an integer" });
  try {
    // Pull the same bundle the GET endpoint returns
    const projRes = await query(
      `SELECT ProjectId AS "projectId", ClientName AS "clientName",
              ProjectName AS "projectName", SowOrTaskId AS "sowOrTaskId",
              Status AS "status", CreatedAtUtc AS "createdAtUtc",
              CreatedBy AS "createdBy", ModifiedAtUtc AS "modifiedAtUtc",
              ModifiedBy AS "modifiedBy", BufferPercent AS "bufferPercent",
              StartDate AS "startDate", CostingProfileId AS "costingProfileId"
       FROM Projects WHERE ProjectId = $1`, [projectId]);
    if (projRes.rowCount === 0) return res.status(404).send("project not found");
    const project = projRes.rows[0];

    const projResRes = await query(
      `SELECT r.ResourceId AS "resourceId", r.RoleName AS "roleName",
              r.ShortCode AS "shortCode", r.DisplayOrder AS "displayOrder",
              r.CostingDescription AS "costingDescription",
              r.CostingCode AS "costingCode",
              pr.BufferPercent AS "bufferPercent"
       FROM ProjectResources pr JOIN Resources r ON r.ResourceId = pr.ResourceId
       WHERE pr.ProjectId = $1 ORDER BY r.DisplayOrder`, [projectId]);

    const taskRes = await query(
      `SELECT TaskId AS "taskId", ParentTaskId AS "parentTaskId",
              RowNumber AS "rowNumber", SortOrder AS "sortOrder", Depth AS "depth",
              TaskName AS "taskName", IsConcurrent AS "isConcurrent",
              Notes AS "notes", DurationDays AS "durationDays"
       FROM WbsTasks WHERE ProjectId = $1 ORDER BY Depth, SortOrder`, [projectId]);
    const tasks = taskRes.rows.map((t) => ({ ...t, resourceHours: {}, dependsOnTaskIds: [] }));
    const byId = new Map(tasks.map((t) => [t.taskId, t]));
    if (tasks.length > 0) {
      const h = await query(
        `SELECT h.TaskId, h.ResourceId, h.Hours FROM TaskResourceHours h
         JOIN WbsTasks t ON t.TaskId = h.TaskId WHERE t.ProjectId = $1`, [projectId]);
      for (const row of h.rows) {
        const t = byId.get(row.taskid);
        if (t) t.resourceHours[row.resourceid] = Number(row.hours);
      }
      const d = await query(
        `SELECT d.TaskId, d.DependsOnTaskId FROM TaskDependencies d
         JOIN WbsTasks t ON t.TaskId = d.TaskId WHERE t.ProjectId = $1`, [projectId]);
      for (const row of d.rows) {
        const t = byId.get(row.taskid);
        if (t) t.dependsOnTaskIds.push(row.dependsontaskid);
      }
    }
    const start = (project.startDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const sched = schedule(tasks, start);
    const scheduleMap = {};
    for (const [id, row] of sched.entries()) {
      scheduleMap[id] = {
        startDate: row.startDate, endDate: row.endDate,
        totalHours: row.totalHours, isLeaf: row.isLeaf,
      };
    }

    // Optional costing: ?costingProfileId=N (falls back to the project's CostingProfileId).
    let costing = null;
    const wantedProfile =
      req.query.costingProfileId ? parseInt(req.query.costingProfileId, 10)
                                 : project.costingProfileId;
    if (Number.isFinite(wantedProfile)) {
      const pRes = await query(
        `SELECT ProfileId AS "profileId", ProfileName AS "profileName"
         FROM CostingProfiles WHERE ProfileId = $1`, [wantedProfile]);
      if (pRes.rowCount > 0) {
        const rRes = await query(
          `SELECT ResourceId AS "resourceId", RatePerHour AS "ratePerHour"
           FROM CostingProfileRates WHERE ProfileId = $1`, [wantedProfile]);
        const rates = {};
        for (const r of rRes.rows) rates[r.resourceId] = Number(r.ratePerHour);
        costing = { profileName: pRes.rows[0].profileName, rates };
      }
    }

    const wb = await exportProject({
      project, resources: projResRes.rows, tasks, schedule: scheduleMap, costing,
    });
    const safe = (project.projectName || "project").replace(/[^a-z0-9_-]+/gi, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(`[wbs] export ${projectId} error:`, err.message);
    res.status(500).type("text/plain").send(err.message);
  }
});

// POST /api/projects — create new project, optionally cloning from a template.
// Body: { clientName, projectName, sowOrTaskId, startDate, bufferPercent,
//         resourceIds: number[], templateId?: number }
app.post("/api/projects", requireWrite, async (req, res) => {
  const b = req.body || {};
  if (!b.clientName || !b.projectName || !b.sowOrTaskId) {
    return res.status(400).json({ error: "clientName, projectName, sowOrTaskId are required" });
  }
  const createdBy = (req.headers["x-forwarded-user"] || "Developer").toString().trim();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO Projects (ClientName, ProjectName, SowOrTaskId, Status,
                              CreatedBy, ModifiedBy, BufferPercent, StartDate,
                              ProductId, SolutionId, ModuleId)
       VALUES ($1, $2, $3, 'Draft', $4, $4, $5, $6, $7, $8, $9)
       RETURNING ProjectId`,
      [b.clientName, b.projectName, b.sowOrTaskId, createdBy,
       Number.isFinite(b.bufferPercent) ? b.bufferPercent : 20,
       b.startDate || null,
       Number.isFinite(b.productId) ? b.productId : null,
       Number.isFinite(b.solutionId) ? b.solutionId : null,
       Number.isFinite(b.moduleId) ? b.moduleId : null]
    );
    const projectId = ins.rows[0].projectid;

    // Assign resources
    const resourceIds = Array.isArray(b.resourceIds) ? b.resourceIds.filter(Number.isFinite) : [];
    for (let i = 0; i < resourceIds.length; i++) {
      await client.query(
        `INSERT INTO ProjectResources (ProjectId, ResourceId, SortOrder, BufferPercent)
         VALUES ($1, $2, $3, 0)`,
        [projectId, resourceIds[i], i]
      );
    }

    // Clone template tasks if templateId provided
    if (Number.isFinite(b.templateId)) {
      // Build shortCode -> resourceId map so we can resolve DefaultHoursJson
      // keys (which use "PM", "IC", etc. in the seed data).
      const allRes = await client.query(
        `SELECT ResourceId AS "resourceId", ShortCode AS "shortCode" FROM Resources`);
      const shortToId = new Map(allRes.rows.map((r) => [r.shortCode, r.resourceId]));
      const tt = await client.query(
        `SELECT TemplateTaskId AS "templateTaskId", ParentTemplateTaskId AS "parentId",
                Depth AS "depth", SortOrder AS "sortOrder", TaskName AS "taskName",
                IsConcurrent AS "isConcurrent", DefaultHoursJson AS "hoursJson"
         FROM WbsTemplateTasks WHERE TemplateId = $1 ORDER BY Depth, SortOrder`,
        [b.templateId]
      );
      const oldToNew = new Map();
      // Compute row numbers DFS-wise
      const byParent = new Map();
      for (const row of tt.rows) {
        const pid = row.parentId ?? 0;
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(row);
      }
      for (const arr of byParent.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
      const rowNumOf = new Map();
      function assignRowNums(parentId, prefix) {
        const kids = byParent.get(parentId) || [];
        kids.forEach((k, i) => {
          const num = prefix ? `${prefix}.${i + 1}` : String(i + 1);
          rowNumOf.set(k.templateTaskId, num);
          assignRowNums(k.templateTaskId, num);
        });
      }
      assignRowNums(0, "");

      // Insert level-by-level so parent IDs are remapped first
      const ordered = [...tt.rows].sort((a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder);
      for (const t of ordered) {
        const parent = t.parentId ? oldToNew.get(t.parentId) : null;
        const r = await client.query(
          `INSERT INTO WbsTasks (ProjectId, ParentTaskId, RowNumber, SortOrder, Depth,
                                  TaskName, IsConcurrent, Notes, DurationDays)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL)
           RETURNING TaskId`,
          [projectId, parent, rowNumOf.get(t.templateTaskId), t.sortOrder, t.depth,
           t.taskName, !!t.isConcurrent]
        );
        const newId = r.rows[0].taskid;
        oldToNew.set(t.templateTaskId, newId);

        // DefaultHoursJson uses resource short codes as keys, e.g. {"PM":8,"IC":24}.
        if (t.hoursJson) {
          try {
            const obj = typeof t.hoursJson === "string" ? JSON.parse(t.hoursJson) : t.hoursJson;
            for (const [key, hrs] of Object.entries(obj)) {
              const hNum = Number(hrs);
              if (!Number.isFinite(hNum) || hNum <= 0) continue;
              // Accept either a shortCode ("PM") or a numeric resourceId (back-compat).
              let rid;
              if (typeof key === "string" && shortToId.has(key)) rid = shortToId.get(key);
              else {
                const n = Number(key);
                rid = Number.isFinite(n) ? n : null;
              }
              if (rid == null) continue;
              if (!resourceIds.includes(rid)) continue;
              await client.query(
                `INSERT INTO TaskResourceHours (TaskId, ResourceId, Hours)
                 VALUES ($1, $2, $3)`,
                [newId, rid, hNum]
              );
            }
          } catch (e) {
            console.warn(`[wbs] template ${b.templateId} task ${t.templateTaskId} hours parse failed:`, e.message);
          }
        }
      }
    }

    // Initial version snapshot
    const projRes = await client.query(
      `SELECT ProjectId AS "projectId", ClientName AS "clientName",
              ProjectName AS "projectName", SowOrTaskId AS "sowOrTaskId",
              Status AS "status", BufferPercent AS "bufferPercent",
              StartDate AS "startDate"
       FROM Projects WHERE ProjectId = $1`, [projectId]);
    await client.query(
      `INSERT INTO ProjectVersions (ProjectId, VersionNumber, StatusAtSave,
                                    CreatedBy, ChangeSummary, SnapshotJson)
       VALUES ($1, 1, 'Draft', $2, 'Initial version', $3)`,
      [projectId, createdBy, JSON.stringify({ project: projRes.rows[0], tasks: [], resources: [] })]
    );

    await client.query("COMMIT");
    res.json({ ok: true, projectId });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[wbs] POST /api/projects error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/templates — list templates for the New Project wizard.
app.get("/api/templates", async (req, res) => {
  try {
    const r = await query(
      `SELECT TemplateId AS "templateId", TemplateName AS "templateName",
              Description AS "description"
       FROM WbsTemplates ORDER BY TemplateName`);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All active resources — used by the resource picker and as a reference list.
app.get("/api/resources", async (req, res) => {
  try {
    const r = await query(
      `SELECT ResourceId AS "resourceId", RoleName AS "roleName",
              ShortCode AS "shortCode", DisplayOrder AS "displayOrder",
              IsActive AS "isActive"
       FROM Resources WHERE IsActive = TRUE
       ORDER BY DisplayOrder`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Active clients (for the client name dropdown on the edit form).
app.get("/api/clients", async (req, res) => {
  try {
    const r = await query(
      `SELECT ClientId AS "clientId", Name AS "name",
              Abbreviation AS "abbreviation",
              DisplayOrder AS "displayOrder", IsActive AS "isActive"
       FROM Clients WHERE IsActive = TRUE
       ORDER BY DisplayOrder, Name`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Version history — metadata only (snapshot omitted for payload size).
// Mirrors ProjectVersionRepo.GetByProjectAsync.
app.get("/api/projects/:id/versions", async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: "id must be an integer" });
  }
  try {
    const r = await query(
      `SELECT VersionId AS "versionId", ProjectId AS "projectId",
              VersionNumber AS "versionNumber", StatusAtSave AS "statusAtSave",
              CreatedAtUtc AS "createdAtUtc", CreatedBy AS "createdBy",
              ChangeSummary AS "changeSummary"
       FROM ProjectVersions
       WHERE ProjectId = $1
       ORDER BY VersionNumber DESC`,
      [projectId]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single version — includes the parsed snapshot. Used for Revert.
app.get("/api/projects/:id/versions/:n", async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const versionNumber = parseInt(req.params.n, 10);
  if (!Number.isFinite(projectId) || !Number.isFinite(versionNumber)) {
    return res.status(400).json({ error: "id and version must be integers" });
  }
  try {
    const r = await query(
      `SELECT VersionId AS "versionId", VersionNumber AS "versionNumber",
              StatusAtSave AS "statusAtSave", CreatedAtUtc AS "createdAtUtc",
              CreatedBy AS "createdBy", ChangeSummary AS "changeSummary",
              SnapshotJson AS "snapshotJson"
       FROM ProjectVersions
       WHERE ProjectId = $1 AND VersionNumber = $2`,
      [projectId, versionNumber]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "version not found" });
    }
    const row = r.rows[0];
    let snapshot = null;
    try {
      snapshot = row.snapshotJson ? JSON.parse(row.snapshotJson) : null;
    } catch (e) {
      console.warn(`[wbs] failed to parse snapshot for project ${projectId} v${versionNumber}:`, e.message);
    }
    res.json({
      versionId: row.versionId,
      versionNumber: row.versionNumber,
      statusAtSave: row.statusAtSave,
      createdAtUtc: row.createdAtUtc,
      createdBy: row.createdBy,
      changeSummary: row.changeSummary,
      snapshot,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Costing profiles (for the costing dropdown).
app.get("/api/costing-profiles", async (req, res) => {
  try {
    const r = await query(
      `SELECT ProfileId AS "profileId", ProfileName AS "profileName",
              Description AS "description"
       FROM CostingProfiles ORDER BY ProfileName`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Costing profile with per-resource rates.
app.get("/api/costing-profiles/:id", async (req, res) => {
  const profileId = parseInt(req.params.id, 10);
  if (!Number.isFinite(profileId)) {
    return res.status(400).json({ error: "id must be an integer" });
  }
  try {
    const p = await query(
      `SELECT ProfileId AS "profileId", ProfileName AS "profileName",
              Description AS "description"
       FROM CostingProfiles WHERE ProfileId = $1`,
      [profileId]
    );
    if (p.rowCount === 0) return res.status(404).json({ error: "profile not found" });
    const r = await query(
      `SELECT ResourceId AS "resourceId", RatePerHour AS "ratePerHour"
       FROM CostingProfileRates WHERE ProfileId = $1`,
      [profileId]
    );
    res.json({ ...p.rows[0], rates: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----- PUT /api/projects/:id: update metadata + resource assignments, then -----
// snapshot the full state to ProjectVersions. Mirrors the .NET save flow.
//
// Body shape — REQUIRED fields:
//   {
//     project: { clientName, projectName, sowOrTaskId, status, bufferPercent,
//                startDate?, costingProfileId?, productId?, solutionId?, moduleId? },
//     resources: [ { resourceId, bufferPercent } ],   // [] to clear; must be present
//     // ----- optional updates: omitting these LEAVES the existing rows alone -----
//     actuals?: [ { resourceId, actualHours } ],      // see step 2a
//     tasks?:   [ ... full WBS replace ... ],         // see step 2b
//     changeSummary?: string
//   }
//
// This is a FULL-REPLACE save, not a PATCH. project + resources are required
// because the handler rewrites both unconditionally — a partial body without
// them would silently destroy saved data (we hit this in prod and had to
// restore from version snapshots). tasks and actuals are optional updates:
// missing means "leave the existing rows alone", which is the safe default
// because each is guarded by an explicit Array.isArray() check before its
// delete-and-replace runs.
//
// Atomic — entire change is rolled back on any failure.
app.put("/api/projects/:id", requireWrite, async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: "id must be an integer" });
  }
  const body = req.body || {};
  const v = validateUpdateProjectBody(body);
  if (!v.ok) {
    return res.status(400).json({ error: v.message, field: v.field });
  }
  const modifiedBy = (req.headers["x-forwarded-user"] || "Developer").toString().trim();

  const allowed = ["Draft", "Final", "Revised", "Approved"];
  const status = allowed.includes(body.project.status) ? body.project.status : "Draft";

  // Approver gate (migration 012). Only users with CanApprove can move the
  // status INTO or OUT OF "Approved". The comparison is against the saved
  // status — not whatever the body says was "previous" — so a forged PUT
  // can't sneak past by pretending the prior status was already Approved.
  try {
    const priorRes = await query(
      `SELECT Status AS "status" FROM Projects WHERE ProjectId = $1`,
      [projectId]
    );
    if (priorRes.rowCount === 0) {
      return res.status(404).json({ error: `project ${projectId} not found` });
    }
    const wasApproved = priorRes.rows[0].status === "Approved";
    const willBeApproved = status === "Approved";
    if (wasApproved !== willBeApproved) {
      const perm = await resolvePermissions(req);
      if (!perm.canApprove) {
        return res.status(403).json({
          error: "You do not have permission to change the project's approval status.",
        });
      }
    }
  } catch (err) {
    console.error(`[wbs] PUT /api/projects/${projectId} approver check failed:`, err.message);
    return res.status(500).json({ error: "Permission check failed" });
  }

  const intOrNull = (v) => (Number.isFinite(v) ? v : null);
  const incoming = {
    clientName: body.project.clientName ?? "",
    projectName: body.project.projectName ?? "",
    sowOrTaskId: body.project.sowOrTaskId ?? "",
    status,
    bufferPercent: Number.isFinite(body.project.bufferPercent)
      ? Math.max(0, Math.min(200, Math.round(body.project.bufferPercent)))
      : 20,
    startDate: body.project.startDate || null,
    costingProfileId: body.project.costingProfileId ?? null,
    productId: intOrNull(body.project.productId),
    solutionId: intOrNull(body.project.solutionId),
    moduleId: intOrNull(body.project.moduleId),
  };
  // Guaranteed an array by validateUpdateProjectBody above.
  const incomingResources = body.resources;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Update Projects
    const updRes = await client.query(
      `UPDATE Projects
       SET ClientName = $1, ProjectName = $2, SowOrTaskId = $3, Status = $4,
           BufferPercent = $5, StartDate = $6, CostingProfileId = $7,
           ProductId = $8, SolutionId = $9, ModuleId = $10,
           ModifiedBy = $11,
           ModifiedAtUtc = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       WHERE ProjectId = $12
       RETURNING ProjectId AS "projectId", ClientName AS "clientName",
                 ProjectName AS "projectName", SowOrTaskId AS "sowOrTaskId",
                 Status AS "status", CreatedAtUtc AS "createdAtUtc",
                 CreatedBy AS "createdBy", ModifiedAtUtc AS "modifiedAtUtc",
                 ModifiedBy AS "modifiedBy", BufferPercent AS "bufferPercent",
                 StartDate AS "startDate", CostingProfileId AS "costingProfileId",
                 ProductId AS "productId", SolutionId AS "solutionId", ModuleId AS "moduleId"`,
      [
        incoming.clientName, incoming.projectName, incoming.sowOrTaskId,
        incoming.status, incoming.bufferPercent, incoming.startDate,
        incoming.costingProfileId, incoming.productId, incoming.solutionId,
        incoming.moduleId, modifiedBy, projectId,
      ]
    );
    if (updRes.rowCount === 0) {
      throw new Error(`project ${projectId} not found`);
    }
    const updatedProject = updRes.rows[0];

    // 2. Reconcile ProjectResources (delete-and-replace inside the txn).
    await client.query(
      "DELETE FROM ProjectResources WHERE ProjectId = $1",
      [projectId]
    );
    let sortOrder = 0;
    for (const r of incomingResources) {
      if (!Number.isFinite(r.resourceId)) continue;
      const buf = Number.isFinite(r.bufferPercent)
        ? Math.max(0, Math.min(200, Math.round(r.bufferPercent)))
        : 0;
      await client.query(
        `INSERT INTO ProjectResources (ProjectId, ResourceId, SortOrder, BufferPercent)
         VALUES ($1, $2, $3, $4)`,
        [projectId, r.resourceId, sortOrder++, buf]
      );
    }

    // 2a. Reconcile ProjectResourceActuals (migration 010) — independent
    // from ProjectResources by design: the Actuals grid can include
    // resources that are NOT in the WBS plan. Same delete-and-replace
    // pattern inside the same transaction.
    //
    // The Array.isArray guard is load-bearing: actuals is an OPTIONAL field
    // on this endpoint, so a body that omits it must leave the existing
    // ProjectResourceActuals rows untouched. Do NOT collapse this into a
    // "default to []" pattern (that's how the resources bug from prod
    // happened — silent wipe on partial body). If you need to clear
    // actuals, send `"actuals": []` explicitly.
    if (Array.isArray(body.actuals)) {
      await client.query(
        "DELETE FROM ProjectResourceActuals WHERE ProjectId = $1",
        [projectId]
      );
      for (const a of body.actuals) {
        const rid = Number(a && a.resourceId);
        if (!Number.isFinite(rid)) continue;
        const hours = Number(a.actualHours) || 0;
        if (hours < 0) continue;
        await client.query(
          `INSERT INTO ProjectResourceActuals (ProjectId, ResourceId, ActualHours)
           VALUES ($1, $2, $3)
           ON CONFLICT (ProjectId, ResourceId) DO UPDATE SET ActualHours = EXCLUDED.ActualHours`,
          [projectId, rid, hours]
        );
      }
    }

    // 2b. Optional: full WBS replace. Mirrors WbsTaskRepo.ReplaceProjectWbsAsync —
    // delete all existing tasks for the project (FK cascade clears hours +
    // dependencies), then re-insert level-by-level so each row's ParentTaskId
    // can reference the just-assigned new ID of its parent. Negative incoming
    // taskIds are treated as client-generated temporary IDs.
    //
    // Same "missing = leave alone" rule as actuals above (and same reason
    // — see step 2a comment). Send `"tasks": []` to explicitly wipe.
    const incomingTasks = Array.isArray(body.tasks) ? body.tasks : null;
    if (incomingTasks) {
      await client.query("DELETE FROM WbsTasks WHERE ProjectId = $1", [projectId]);

      // Sort by depth ascending so parents land before children, then by sortOrder.
      const ordered = [...incomingTasks].sort(
        (a, b) =>
          (a.depth ?? 0) - (b.depth ?? 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      );
      const oldToNew = new Map();

      for (const t of ordered) {
        const mappedParent =
          t.parentTaskId == null
            ? null
            : oldToNew.has(t.parentTaskId)
            ? oldToNew.get(t.parentTaskId)
            : null;

        const ins = await client.query(
          `INSERT INTO WbsTasks (ProjectId, ParentTaskId, RowNumber, SortOrder,
                                  Depth, TaskName, IsConcurrent, Notes, DurationDays)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING TaskId`,
          [
            projectId,
            mappedParent,
            (t.rowNumber || "").toString().slice(0, 32),
            Number(t.sortOrder) || 0,
            Math.max(1, Math.min(4, Number(t.depth) || 1)),
            (t.taskName || "").toString(),
            !!t.isConcurrent,
            t.notes ? t.notes.toString() : null,
            Number.isFinite(t.durationDays) ? t.durationDays : null,
          ]
        );
        const newId = ins.rows[0].taskid;
        oldToNew.set(t.taskId, newId);

        // Hours
        const hours = t.resourceHours || {};
        for (const [resourceId, hrs] of Object.entries(hours)) {
          const rid = Number(resourceId);
          const h = Number(hrs);
          if (!Number.isFinite(rid) || !Number.isFinite(h) || h <= 0) continue;
          await client.query(
            `INSERT INTO TaskResourceHours (TaskId, ResourceId, Hours)
             VALUES ($1, $2, $3)`,
            [newId, rid, h]
          );
        }
      }

      // Dependencies — re-mapped via oldToNew.
      for (const t of ordered) {
        const deps = t.dependsOnTaskIds || [];
        if (deps.length === 0) continue;
        const newTaskId = oldToNew.get(t.taskId);
        if (!newTaskId) continue;
        for (const depOldId of deps) {
          const depNewId = oldToNew.get(depOldId);
          if (!depNewId) continue;
          await client.query(
            `INSERT INTO TaskDependencies (TaskId, DependsOnTaskId)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [newTaskId, depNewId]
          );
        }
      }
    }

    // 3. Build snapshot (matches .NET ProjectSnapshot shape).
    const snapshotProject = {
      clientName: updatedProject.clientName,
      projectName: updatedProject.projectName,
      sowOrTaskId: updatedProject.sowOrTaskId,
      status: updatedProject.status,
      bufferPercent: updatedProject.bufferPercent,
      startDate: updatedProject.startDate,
    };

    // Load tasks + hours + deps for the snapshot.
    const taskRows = await client.query(
      `SELECT TaskId AS "taskId", ParentTaskId AS "parentTaskId",
              Depth AS "depth", SortOrder AS "sortOrder",
              RowNumber AS "rowNumber", TaskName AS "taskName",
              IsConcurrent AS "isConcurrent", Notes AS "notes",
              DurationDays AS "durationDays"
       FROM WbsTasks WHERE ProjectId = $1 ORDER BY Depth, SortOrder`,
      [projectId]
    );
    const taskById = new Map();
    const snapshotTasks = [];
    for (const t of taskRows.rows) {
      const node = { ...t, resourceHours: {}, dependsOnTaskIds: [] };
      taskById.set(t.taskId, node);
      snapshotTasks.push(node);
    }
    if (snapshotTasks.length > 0) {
      const hRes = await client.query(
        `SELECT h.TaskId, h.ResourceId, h.Hours
         FROM TaskResourceHours h
         JOIN WbsTasks t ON t.TaskId = h.TaskId
         WHERE t.ProjectId = $1`,
        [projectId]
      );
      for (const h of hRes.rows) {
        const node = taskById.get(h.taskid);
        if (node) node.resourceHours[h.resourceid] = Number(h.hours);
      }
      const dRes = await client.query(
        `SELECT d.TaskId, d.DependsOnTaskId
         FROM TaskDependencies d
         JOIN WbsTasks t ON t.TaskId = d.TaskId
         WHERE t.ProjectId = $1`,
        [projectId]
      );
      for (const d of dRes.rows) {
        const node = taskById.get(d.taskid);
        if (node) node.dependsOnTaskIds.push(d.dependsontaskid);
      }
    }

    // Resource summary (short code + role name) per snapshot model.
    const snapshotResources = [];
    if (incomingResources.length > 0) {
      const ids = incomingResources.map((r) => r.resourceId).filter(Number.isFinite);
      if (ids.length > 0) {
        const r2 = await client.query(
          `SELECT ResourceId AS "resourceId", ShortCode AS "shortCode",
                  RoleName AS "roleName"
           FROM Resources WHERE ResourceId = ANY($1::int[])`,
          [ids]
        );
        // preserve incoming order
        const map = new Map(r2.rows.map((row) => [row.resourceId, row]));
        for (const r of incomingResources) {
          const meta = map.get(r.resourceId);
          if (meta) snapshotResources.push(meta);
        }
      }
    }

    const snapshot = {
      project: snapshotProject,
      tasks: snapshotTasks,
      resources: snapshotResources,
    };

    // 4. Insert ProjectVersions row.
    const nextRes = await client.query(
      "SELECT COALESCE(MAX(VersionNumber), 0) + 1 AS n FROM ProjectVersions WHERE ProjectId = $1",
      [projectId]
    );
    const versionNumber = nextRes.rows[0].n;
    await client.query(
      `INSERT INTO ProjectVersions (ProjectId, VersionNumber, StatusAtSave,
                                    CreatedBy, ChangeSummary, SnapshotJson)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        projectId,
        versionNumber,
        incoming.status,
        modifiedBy,
        (body.changeSummary || "").toString().slice(0, 500),
        JSON.stringify(snapshot),
      ]
    );

    await client.query("COMMIT");
    res.json({ ok: true, versionNumber, project: updatedProject });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[wbs] PUT /api/projects/${projectId} error:`, err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ════════════════════════════════════════════════════════════════════════
// Settings CRUD — ported from sm-wbs-builder/Pages/Settings.razor.cs
// ════════════════════════════════════════════════════════════════════════

// ── Clients ────────────────────────────────────────────────────────────
// Full list including inactive clients (used by the Clients settings tab).
app.get("/api/clients/all", async (req, res) => {
  try {
    const r = await query(
      `SELECT ClientId AS "clientId", Name AS "name",
              Abbreviation AS "abbreviation",
              DisplayOrder AS "displayOrder", IsActive AS "isActive"
       FROM Clients ORDER BY DisplayOrder, Name`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/clients", async (req, res) => {
  const b = req.body || {};
  const name = (b.name || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const r = await query(
      `INSERT INTO Clients (Name, Abbreviation, DisplayOrder, IsActive)
       VALUES ($1, $2, $3, TRUE) RETURNING ClientId AS "clientId"`,
      [name,
       (b.abbreviation || "").toString().trim().slice(0, 32),
       Math.max(0, Math.min(999, Number(b.displayOrder) || 0))]
    );
    res.json({ ok: true, clientId: r.rows[0].clientId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/api/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  const b = req.body || {};
  const fields = [], vals = [];
  if (typeof b.name === "string")              { fields.push(`Name = $${fields.length + 1}`);          vals.push(b.name.trim()); }
  if (typeof b.abbreviation === "string")      { fields.push(`Abbreviation = $${fields.length + 1}`);  vals.push(b.abbreviation.trim().slice(0, 32)); }
  if (Number.isFinite(b.displayOrder))         { fields.push(`DisplayOrder = $${fields.length + 1}`);  vals.push(Math.max(0, Math.min(999, b.displayOrder))); }
  if (typeof b.isActive === "boolean")          { fields.push(`IsActive = $${fields.length + 1}`);      vals.push(b.isActive); }
  if (fields.length === 0) return res.json({ ok: true });
  vals.push(id);
  try {
    await query(`UPDATE Clients SET ${fields.join(", ")} WHERE ClientId = $${vals.length}`, vals);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Resources ──────────────────────────────────────────────────────────
app.get("/api/resources/all", async (req, res) => {
  try {
    const r = await query(
      `SELECT ResourceId AS "resourceId", RoleName AS "roleName",
              ShortCode AS "shortCode", DisplayOrder AS "displayOrder",
              IsActive AS "isActive",
              CostingDescription AS "costingDescription",
              CostingCode AS "costingCode"
       FROM Resources ORDER BY DisplayOrder, RoleName`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/resources", async (req, res) => {
  const b = req.body || {};
  const roleName = (b.roleName || "").trim();
  const shortCode = (b.shortCode || "").trim();
  if (!roleName || !shortCode) return res.status(400).json({ error: "roleName + shortCode required" });
  try {
    const r = await query(
      `INSERT INTO Resources (RoleName, ShortCode, DisplayOrder, IsActive,
                              CostingDescription, CostingCode)
       VALUES ($1, $2, $3, TRUE, $4, $5) RETURNING ResourceId AS "resourceId"`,
      [roleName, shortCode,
       Math.max(0, Math.min(999, Number(b.displayOrder) || 0)),
       (b.costingDescription || "").toString(),
       (b.costingCode || "").toString()]
    );
    res.json({ ok: true, resourceId: r.rows[0].resourceId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/api/resources/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  const b = req.body || {};
  const fields = [], vals = [];
  if (typeof b.roleName === "string")           { fields.push(`RoleName = $${fields.length + 1}`);          vals.push(b.roleName.trim()); }
  if (typeof b.shortCode === "string")          { fields.push(`ShortCode = $${fields.length + 1}`);         vals.push(b.shortCode.trim()); }
  if (Number.isFinite(b.displayOrder))          { fields.push(`DisplayOrder = $${fields.length + 1}`);      vals.push(Math.max(0, Math.min(999, b.displayOrder))); }
  if (typeof b.isActive === "boolean")          { fields.push(`IsActive = $${fields.length + 1}`);          vals.push(b.isActive); }
  if (typeof b.costingDescription === "string") { fields.push(`CostingDescription = $${fields.length + 1}`); vals.push(b.costingDescription); }
  if (typeof b.costingCode === "string")        { fields.push(`CostingCode = $${fields.length + 1}`);       vals.push(b.costingCode); }
  if (fields.length === 0) return res.json({ ok: true });
  vals.push(id);
  try {
    await query(`UPDATE Resources SET ${fields.join(", ")} WHERE ResourceId = $${vals.length}`, vals);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NOTE: no DELETE /api/resources/:id — a resource role can be referenced by
// existing WBS task hours, project resources, templates and costing profiles.
// Roles are retired by deactivating them (PATCH isActive=false), never hard-deleted.

// ── Templates ──────────────────────────────────────────────────────────
app.post("/api/templates", async (req, res) => {
  const b = req.body || {};
  const name = (b.templateName || "").trim();
  if (!name) return res.status(400).json({ error: "templateName required" });
  try {
    const r = await query(
      `INSERT INTO WbsTemplates (TemplateName, Description)
       VALUES ($1, $2) RETURNING TemplateId AS "templateId"`,
      [name, (b.description || "").toString()]
    );
    res.json({ ok: true, templateId: r.rows[0].templateId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/api/templates/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  const b = req.body || {};
  const fields = [], vals = [];
  if (typeof b.templateName === "string") { fields.push(`TemplateName = $${fields.length + 1}`); vals.push(b.templateName.trim()); }
  if (typeof b.description === "string")  { fields.push(`Description = $${fields.length + 1}`);  vals.push(b.description); }
  if (fields.length === 0) return res.json({ ok: true });
  vals.push(id);
  try {
    await query(`UPDATE WbsTemplates SET ${fields.join(", ")} WHERE TemplateId = $${vals.length}`, vals);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/templates/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  try {
    // FK cascades clear WbsTemplateTasks and TemplateResources.
    await query("DELETE FROM WbsTemplates WHERE TemplateId = $1", [id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/templates/:id — full template: meta + associated resources + task tree.
// DefaultHoursJson is parsed and normalised to { resourceId: hours } using the
// shortCode → resourceId map (seed data keys hours by short code, e.g. "PM").
app.get("/api/templates/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  try {
    const tRes = await query(
      `SELECT TemplateId AS "templateId", TemplateName AS "templateName",
              Description AS "description"
       FROM WbsTemplates WHERE TemplateId = $1`, [id]);
    if (tRes.rowCount === 0) return res.status(404).json({ error: "template not found" });

    // Associated resources (TemplateResources join)
    const rRes = await query(
      `SELECT r.ResourceId AS "resourceId", r.RoleName AS "roleName",
              r.ShortCode AS "shortCode", r.DisplayOrder AS "displayOrder"
       FROM TemplateResources tr
       JOIN Resources r ON r.ResourceId = tr.ResourceId
       WHERE tr.TemplateId = $1
       ORDER BY r.DisplayOrder, r.RoleName`, [id]);

    // shortCode -> resourceId for parsing DefaultHoursJson seed values
    const allRes = await query(`SELECT ResourceId AS "resourceId", ShortCode AS "shortCode" FROM Resources`);
    const shortToId = new Map(allRes.rows.map((x) => [x.shortCode, x.resourceId]));

    const taskRes = await query(
      `SELECT TemplateTaskId AS "templateTaskId", ParentTemplateTaskId AS "parentTemplateTaskId",
              Depth AS "depth", SortOrder AS "sortOrder", TaskName AS "taskName",
              IsConcurrent AS "isConcurrent", DefaultHoursJson AS "defaultHoursJson"
       FROM WbsTemplateTasks WHERE TemplateId = $1 ORDER BY Depth, SortOrder`, [id]);

    const tasks = taskRes.rows.map((t) => {
      const defaultHours = {};
      if (t.defaultHoursJson) {
        try {
          const obj = typeof t.defaultHoursJson === "string"
            ? JSON.parse(t.defaultHoursJson) : t.defaultHoursJson;
          for (const [key, hrs] of Object.entries(obj)) {
            const h = Number(hrs);
            if (!Number.isFinite(h) || h <= 0) continue;
            let rid;
            if (shortToId.has(key)) rid = shortToId.get(key);
            else { const n = Number(key); rid = Number.isFinite(n) ? n : null; }
            if (rid != null) defaultHours[rid] = h;
          }
        } catch { /* leave defaultHours empty on parse failure */ }
      }
      return {
        templateTaskId: t.templateTaskId,
        parentTemplateTaskId: t.parentTemplateTaskId,
        depth: t.depth,
        sortOrder: t.sortOrder,
        taskName: t.taskName,
        isConcurrent: t.isConcurrent,
        defaultHours,
      };
    });

    res.json({ template: tRes.rows[0], resources: rRes.rows, tasks });
  } catch (err) {
    console.error(`[wbs] GET /api/templates/${id} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/templates/:id/content — atomic replace of template meta + tasks +
// associated resources. Body:
//   { templateName, description, resourceIds: number[],
//     tasks: [{ templateTaskId, parentTemplateTaskId|null, depth, sortOrder,
//               taskName, isConcurrent, defaultHours: { resourceId: hours } }] }
// Negative templateTaskIds are treated as client-side temp IDs.
app.put("/api/templates/:id/content", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  const b = req.body || {};
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Meta
    const upd = await client.query(
      `UPDATE WbsTemplates SET TemplateName = $1, Description = $2
       WHERE TemplateId = $3 RETURNING TemplateId`,
      [(b.templateName || "").toString().trim() || "Untitled template",
       (b.description || "").toString(), id]
    );
    if (upd.rowCount === 0) throw new Error(`template ${id} not found`);

    // 2. Associated resources (delete + reinsert)
    await client.query("DELETE FROM TemplateResources WHERE TemplateId = $1", [id]);
    const resourceIds = Array.isArray(b.resourceIds) ? b.resourceIds.filter(Number.isFinite) : [];
    for (const rid of resourceIds) {
      await client.query(
        `INSERT INTO TemplateResources (TemplateId, ResourceId) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`, [id, rid]);
    }

    // 3. Tasks — delete all, reinsert level-by-level remapping parent IDs.
    await client.query("DELETE FROM WbsTemplateTasks WHERE TemplateId = $1", [id]);
    const incoming = Array.isArray(b.tasks) ? b.tasks : [];
    const ordered = [...incoming].sort(
      (a, c) => (a.depth ?? 0) - (c.depth ?? 0) || (a.sortOrder ?? 0) - (c.sortOrder ?? 0));
    const oldToNew = new Map();
    for (const t of ordered) {
      const mappedParent =
        t.parentTemplateTaskId == null ? null
        : oldToNew.has(t.parentTemplateTaskId) ? oldToNew.get(t.parentTemplateTaskId)
        : null;
      // DefaultHoursJson keyed by resourceId (numbers as strings)
      const hours = {};
      for (const [rid, hrs] of Object.entries(t.defaultHours || {})) {
        const h = Number(hrs);
        if (Number.isFinite(h) && h > 0) hours[rid] = h;
      }
      const ins = await client.query(
        `INSERT INTO WbsTemplateTasks (TemplateId, ParentTemplateTaskId, Depth,
                                        SortOrder, TaskName, IsConcurrent, DefaultHoursJson)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING TemplateTaskId`,
        [id, mappedParent,
         Math.max(1, Math.min(4, Number(t.depth) || 1)),
         Number(t.sortOrder) || 0,
         (t.taskName || "").toString(),
         !!t.isConcurrent,
         Object.keys(hours).length > 0 ? JSON.stringify(hours) : null]
      );
      oldToNew.set(t.templateTaskId, ins.rows[0].templatetaskid);
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[wbs] PUT /api/templates/${id}/content error:`, err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Costing Profiles + rates ───────────────────────────────────────────
app.post("/api/costing-profiles", async (req, res) => {
  const b = req.body || {};
  const name = (b.profileName || "").trim();
  if (!name) return res.status(400).json({ error: "profileName required" });
  try {
    const r = await query(
      `INSERT INTO CostingProfiles (ProfileName, Description)
       VALUES ($1, $2) RETURNING ProfileId AS "profileId"`,
      [name, (b.description || "").toString()]
    );
    res.json({ ok: true, profileId: r.rows[0].profileId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/api/costing-profiles/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  const b = req.body || {};
  const fields = [], vals = [];
  if (typeof b.profileName === "string") { fields.push(`ProfileName = $${fields.length + 1}`); vals.push(b.profileName.trim()); }
  if (typeof b.description === "string") { fields.push(`Description = $${fields.length + 1}`); vals.push(b.description); }
  if (fields.length === 0) return res.json({ ok: true });
  vals.push(id);
  try {
    await query(`UPDATE CostingProfiles SET ${fields.join(", ")} WHERE ProfileId = $${vals.length}`, vals);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/costing-profiles/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  try {
    // FK cascade clears CostingProfileRates; null out any Projects referencing this.
    await query("UPDATE Projects SET CostingProfileId = NULL WHERE CostingProfileId = $1", [id]);
    await query("DELETE FROM CostingProfiles WHERE ProfileId = $1", [id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk replace rates for a profile. Body: { rates: [{resourceId, ratePerHour}, ...] }
app.put("/api/costing-profiles/:id/rates", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  const rates = Array.isArray(req.body?.rates) ? req.body.rates : [];
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM CostingProfileRates WHERE ProfileId = $1", [id]);
    for (const r of rates) {
      const rid = Number(r.resourceId), rate = Number(r.ratePerHour);
      if (!Number.isFinite(rid) || !Number.isFinite(rate) || rate < 0) continue;
      await client.query(
        `INSERT INTO CostingProfileRates (ProfileId, ResourceId, RatePerHour)
         VALUES ($1, $2, $3)`,
        [id, rid, rate]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ============================================================
// AI PROJECT ANALYST — chat + one-shot analysis per project
// ============================================================
// Persists conversations to AIConversations / AIMessages (migration 009).
// Calls Matcha mission MISSION_ID_WBS, which is configured on the Matcha
// platform with the PMP/PRINCE2 persona + scope guardrails. Endpoints are
// gated to non-read-only users (and require Matcha to be configured).

// Middleware: block AI access unless the user can write AND Matcha is wired.
//  - !isReadOnly is the access policy (reuses the existing flag, no new perm).
//  - apiKey + missionId must be configured, otherwise we return 503 so the
//    UI can surface a helpful message instead of a generic 500.
async function requireAI(req, res, next) {
  try {
    const perm = await resolvePermissions(req);
    if (perm.isReadOnly) {
      return res.status(403).json({ error: "Your account is read-only — the AI Assistant is disabled." });
    }
    if (!config.matcha.apiKey || !config.matcha.missions.wbs) {
      return res.status(503).json({
        error: "AI Assistant is not configured on this server (set MATCHA_API_KEY + MISSION_ID_WBS).",
      });
    }
    req.aiCaller = { email: perm.email, username: perm.username };
    next();
  } catch (err) {
    console.error("[wbs] requireAI check failed:", err.message);
    res.status(500).json({ error: "Permission check failed" });
  }
}

// Helper — verify the project exists, return its id or send 404.
async function assertProject(req, res) {
  const projectId = parseInt(req.params.id, 10);
  if (!Number.isFinite(projectId)) {
    res.status(400).json({ error: "id must be an integer" });
    return null;
  }
  const r = await query("SELECT ProjectId FROM Projects WHERE ProjectId = $1", [projectId]);
  if (r.rowCount === 0) {
    res.status(404).json({ error: `project ${projectId} not found` });
    return null;
  }
  return projectId;
}

// GET /api/projects/:id/ai/conversations — list this user's conversations
// for this project, newest-first, with first-message preview.
app.get("/api/projects/:id/ai/conversations", requireAI, async (req, res) => {
  const projectId = await assertProject(req, res);
  if (projectId === null) return;
  try {
    const r = await query(
      `SELECT c.ConversationId AS "conversationId",
              c.Title          AS "title",
              c.CreatedAtUtc   AS "createdAtUtc",
              c.UpdatedAtUtc   AS "updatedAtUtc",
              (SELECT Content FROM AIMessages
                  WHERE ConversationId = c.ConversationId AND Role = 'user'
                  ORDER BY MessageId ASC LIMIT 1)  AS "firstUserMessage",
              (SELECT COUNT(*) FROM AIMessages
                  WHERE ConversationId = c.ConversationId)::int AS "messageCount"
         FROM AIConversations c
        WHERE c.ProjectId = $1 AND LOWER(c.UserEmail) = LOWER($2)
        ORDER BY c.UpdatedAtUtc DESC
        LIMIT 50`,
      [projectId, req.aiCaller.email]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(`[wbs] AI conversations list error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/ai/conversations — create empty conversation.
app.post("/api/projects/:id/ai/conversations", requireAI, async (req, res) => {
  const projectId = await assertProject(req, res);
  if (projectId === null) return;
  try {
    const r = await query(
      `INSERT INTO AIConversations (ProjectId, UserEmail)
         VALUES ($1, $2)
       RETURNING ConversationId AS "conversationId",
                 Title          AS "title",
                 CreatedAtUtc   AS "createdAtUtc",
                 UpdatedAtUtc   AS "updatedAtUtc"`,
      [projectId, req.aiCaller.email]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(`[wbs] AI conversation create error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/ai/conversations/:cid — full thread (chronological).
app.get("/api/projects/:id/ai/conversations/:cid", requireAI, async (req, res) => {
  const projectId = await assertProject(req, res);
  if (projectId === null) return;
  const cid = parseInt(req.params.cid, 10);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "bad conversation id" });
  try {
    const c = await query(
      `SELECT ConversationId AS "conversationId", ProjectId AS "projectId",
              UserEmail AS "userEmail", Title AS "title",
              CreatedAtUtc AS "createdAtUtc", UpdatedAtUtc AS "updatedAtUtc"
         FROM AIConversations
        WHERE ConversationId = $1 AND ProjectId = $2`,
      [cid, projectId]
    );
    if (c.rowCount === 0) return res.status(404).json({ error: "conversation not found" });
    const conv = c.rows[0];
    if (conv.userEmail.toLowerCase() !== req.aiCaller.email.toLowerCase()) {
      // Conversations are private to the user that created them.
      return res.status(403).json({ error: "not your conversation" });
    }
    const m = await query(
      `SELECT MessageId AS "messageId", Role AS "role", Content AS "content",
              Mode AS "mode", Feedback AS "feedback", FeedbackNote AS "feedbackNote",
              CreatedAtUtc AS "createdAtUtc"
         FROM AIMessages WHERE ConversationId = $1 ORDER BY MessageId ASC`,
      [cid]
    );
    res.json({ ...conv, messages: m.rows });
  } catch (err) {
    console.error(`[wbs] AI conversation read error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/ai/conversations/:cid — owner only.
app.delete("/api/projects/:id/ai/conversations/:cid", requireAI, async (req, res) => {
  const projectId = await assertProject(req, res);
  if (projectId === null) return;
  const cid = parseInt(req.params.cid, 10);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "bad conversation id" });
  try {
    const r = await query(
      `DELETE FROM AIConversations
        WHERE ConversationId = $1 AND ProjectId = $2 AND LOWER(UserEmail) = LOWER($3)`,
      [cid, projectId, req.aiCaller.email]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "conversation not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(`[wbs] AI conversation delete error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/ai/conversations/:cid/messages — send a new message.
// Body: { content, mode: 'chat' | 'analysis' }. Server appends the user message,
// builds the context payload, calls Matcha, persists the assistant reply,
// and returns the assistant message row.
app.post("/api/projects/:id/ai/conversations/:cid/messages", requireAI, async (req, res) => {
  const projectId = await assertProject(req, res);
  if (projectId === null) return;
  const cid = parseInt(req.params.cid, 10);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "bad conversation id" });

  const content = (req.body?.content || "").toString().trim();
  const mode = req.body?.mode === "analysis" ? "analysis" : "chat";
  if (mode === "chat" && !content) {
    return res.status(400).json({ error: "content is required for chat mode" });
  }

  try {
    // Confirm conversation ownership.
    const c = await query(
      "SELECT UserEmail, Title FROM AIConversations WHERE ConversationId = $1 AND ProjectId = $2",
      [cid, projectId]
    );
    if (c.rowCount === 0) return res.status(404).json({ error: "conversation not found" });
    if (c.rows[0].useremail.toLowerCase() !== req.aiCaller.email.toLowerCase()) {
      return res.status(403).json({ error: "not your conversation" });
    }

    // 1. Persist the user message FIRST so it survives a Matcha failure
    //    (the user can see what they asked + try again).
    const effectiveContent = mode === "analysis"
      ? "Please provide a structured analysis of this project."
      : content;
    const userInsert = await query(
      `INSERT INTO AIMessages (ConversationId, Role, Content, Mode)
         VALUES ($1, 'user', $2, $3)
       RETURNING MessageId AS "messageId", Role AS "role", Content AS "content",
                 Mode AS "mode", CreatedAtUtc AS "createdAtUtc"`,
      [cid, effectiveContent, mode]
    );
    const userMessage = userInsert.rows[0];

    // 2. Assemble the context payload from the DB.
    const payload = await buildContextPayload({
      projectId,
      instruction: mode === "analysis" ? "analyse" : "chat",
      userMessage: effectiveContent,
      conversationId: cid,
    });

    // 3. Wrap with a defensive prompt envelope (defence-in-depth — the Matcha
    //    mission has the primary system prompt baked in).
    const envelope = [
      "You will receive a JSON payload describing a WBS project plus supporting",
      "context. Answer the user's question using ONLY this payload and",
      "PMP/PRINCE2 methodology. If asked about anything outside this scope,",
      "reply that you can only help with project analysis.",
      "",
      JSON.stringify(payload),
    ].join("\n");

    // 4. Call Matcha.
    let assistantText;
    try {
      assistantText = await callMission(config.matcha.missions.wbs, envelope);
    } catch (err) {
      // Record the failure as a system message so the thread is honest about it.
      await query(
        `INSERT INTO AIMessages (ConversationId, Role, Content, Mode)
           VALUES ($1, 'system', $2, $3)`,
        [cid, `(LLM call failed: ${err.message})`, mode]
      );
      console.error(`[wbs] AI Matcha call failed:`, err.message);
      return res.status(502).json({ error: `AI service error: ${err.message}` });
    }

    // 5. Persist the assistant reply.
    const asstInsert = await query(
      `INSERT INTO AIMessages (ConversationId, Role, Content, Mode)
         VALUES ($1, 'assistant', $2, $3)
       RETURNING MessageId AS "messageId", Role AS "role", Content AS "content",
                 Mode AS "mode", Feedback AS "feedback", CreatedAtUtc AS "createdAtUtc"`,
      [cid, assistantText, mode]
    );
    const assistantMessage = asstInsert.rows[0];

    // 6. Touch the conversation's UpdatedAtUtc + set its title from the first
    //    user message if not already set.
    const titleSeed = (c.rows[0].title || "").trim()
      ? null
      : (effectiveContent.length > 80 ? effectiveContent.slice(0, 77) + "…" : effectiveContent);
    await query(
      `UPDATE AIConversations
          SET UpdatedAtUtc = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              Title = COALESCE(NULLIF(Title, ''), $2)
        WHERE ConversationId = $1`,
      [cid, titleSeed]
    );

    res.json({ userMessage, assistantMessage });
  } catch (err) {
    console.error(`[wbs] AI message POST error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/projects/:id/ai/messages/:mid/feedback — thumbs up/down.
app.patch("/api/projects/:id/ai/messages/:mid/feedback", requireAI, async (req, res) => {
  const projectId = await assertProject(req, res);
  if (projectId === null) return;
  const mid = parseInt(req.params.mid, 10);
  if (!Number.isFinite(mid)) return res.status(400).json({ error: "bad message id" });
  const raw = req.body?.feedback;
  let feedback = null;
  if (raw === 1 || raw === -1) feedback = raw;
  else if (raw === 0 || raw === null || raw === undefined) feedback = null;
  else return res.status(400).json({ error: "feedback must be -1, 0, or 1" });
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 1000) : null;
  try {
    // Verify the message belongs to a conversation this user owns + this project.
    const r = await query(
      `UPDATE AIMessages m
          SET Feedback = $1, FeedbackNote = $2
         FROM AIConversations c
        WHERE m.MessageId = $3
          AND m.ConversationId = c.ConversationId
          AND c.ProjectId = $4
          AND LOWER(c.UserEmail) = LOWER($5)
       RETURNING m.MessageId AS "messageId", m.Feedback AS "feedback", m.FeedbackNote AS "feedbackNote"`,
      [feedback, note, mid, projectId, req.aiCaller.email]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "message not found" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(`[wbs] AI feedback error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Generic master lists: Products / Solutions / Modules ──────────────
// All three share the same shape (Id, Name, DisplayOrder, IsActive), so one
// helper registers their GET/GET-all/POST/PATCH routes.
function registerMasterList({ routeBase, table, idCol }) {
  // Active only — for project dropdowns
  app.get(`/api/${routeBase}`, async (req, res) => {
    try {
      const r = await query(
        `SELECT ${idCol} AS "id", Name AS "name",
                DisplayOrder AS "displayOrder", IsActive AS "isActive"
         FROM ${table} WHERE IsActive = TRUE ORDER BY DisplayOrder, Name`);
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  // Full list incl. inactive — for the settings tab
  app.get(`/api/${routeBase}/all`, async (req, res) => {
    try {
      const r = await query(
        `SELECT ${idCol} AS "id", Name AS "name",
                DisplayOrder AS "displayOrder", IsActive AS "isActive"
         FROM ${table} ORDER BY DisplayOrder, Name`);
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.post(`/api/${routeBase}`, async (req, res) => {
    const name = (req.body?.name || "").toString().trim();
    if (!name) return res.status(400).json({ error: "name required" });
    try {
      const r = await query(
        `INSERT INTO ${table} (Name, DisplayOrder, IsActive)
         VALUES ($1, $2, TRUE) RETURNING ${idCol} AS "id"`,
        [name, Math.max(0, Math.min(999, Number(req.body?.displayOrder) || 0))]);
      res.json({ ok: true, id: r.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.patch(`/api/${routeBase}/:id`, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
    const b = req.body || {};
    const fields = [], vals = [];
    if (typeof b.name === "string")       { fields.push(`Name = $${fields.length + 1}`);         vals.push(b.name.trim()); }
    if (Number.isFinite(b.displayOrder))  { fields.push(`DisplayOrder = $${fields.length + 1}`); vals.push(Math.max(0, Math.min(999, b.displayOrder))); }
    if (typeof b.isActive === "boolean")  { fields.push(`IsActive = $${fields.length + 1}`);     vals.push(b.isActive); }
    if (fields.length === 0) return res.json({ ok: true });
    vals.push(id);
    try {
      await query(`UPDATE ${table} SET ${fields.join(", ")} WHERE ${idCol} = $${vals.length}`, vals);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
registerMasterList({ routeBase: "products",  table: "Products",  idCol: "ProductId" });
registerMasterList({ routeBase: "solutions", table: "Solutions", idCol: "SolutionId" });
registerMasterList({ routeBase: "modules",   table: "Modules",   idCol: "ModuleId" });

// Promote the configured bootstrap admin(s). Idempotent — runs every startup.
// On an existing row only IsAdmin + CanViewSettings are forced (the minimum to
// reach the admin page); the user's other flags are left untouched.
async function bootstrapAdmin() {
  for (const email of config.bootstrapAdmins) {
    const name = email.split("@")[0];
    try {
      await query(
        `INSERT INTO UserPermissions
           (Username, Email, IsReadOnly, CanViewAnalytics,
            CanViewSettings, CanDeleteProjects, CanApprove, IsAdmin, IsActive)
         VALUES ($1, $2, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
         ON CONFLICT (LOWER(Email))
         DO UPDATE SET IsAdmin = TRUE, CanViewSettings = TRUE, CanApprove = TRUE, IsActive = TRUE`,
        [name, email]
      );
      console.log(`[wbs] bootstrap admin ensured: ${email}`);
    } catch (err) {
      console.error(`[wbs] bootstrap admin failed for ${email}:`, err.message);
    }
  }
}

// ----- Startup: run migrations, then listen on 127.0.0.1 only. -----
async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error("[wbs] migration failed, aborting startup:", err.message);
    process.exit(1);
  }

  await bootstrapAdmin();

  const server = app.listen(config.port, "127.0.0.1", () => {
    console.log(
      `WBS app running at http://127.0.0.1:${config.port} (mode=${config.mode}, db=${config.db.database}@${config.db.host}:${config.db.port})`
    );
  });

  const shutdown = async (sig) => {
    console.log(`[wbs] ${sig}, closing...`);
    server.close(() => close().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
