// Assembles the JSON payload sent to the Matcha "WBS Project Analyst" mission.
//
// Shape (kept compact to stay inside the model's context budget):
//   {
//     instruction:      "chat" | "analyse",
//     currentProject:   { name, client, status, ..., tasks: [...] },
//     comparablePeers:  [ { projectName, totalHours, taskCount, status, topRoles } ],
//     portfolioSummary: { totalProjects, byStatus, demandByRole },
//     history:          [ { role, content } ],
//     userMessage:      "<the new question>"  (chat mode only)
//   }
//
// The peer / portfolio queries deliberately mirror the SQL already used by
// the /api/projects/:id and /api/analytics/portfolio endpoints, but pared
// down to summary-only fields so we don't bloat the prompt.

import { query } from "../../db/index.js";
import { schedule } from "../scheduleEngine.js";

const MAX_TASKS = 200;          // hard cap to keep token usage bounded
const MAX_PEERS = 5;
const MAX_HISTORY_MESSAGES = 8;

// Public entry point — called by the /messages endpoint.
//
//   opts.projectId       — number, required
//   opts.instruction     — "chat" | "analyse"
//   opts.userMessage     — string, chat mode only
//   opts.conversationId  — number, used to pull recent history
export async function buildContextPayload(opts) {
  const {
    projectId,
    instruction,
    userMessage = "",
    conversationId = null,
  } = opts;

  const currentProject = await loadCurrentProject(projectId);
  const peers = currentProject
    ? await loadComparablePeers(projectId, currentProject)
    : [];
  const portfolio = await loadPortfolioSummary();
  const history = conversationId
    ? await loadRecentHistory(conversationId, MAX_HISTORY_MESSAGES)
    : [];

  const payload = {
    instruction,
    currentProject,
    comparablePeers: peers,
    portfolioSummary: portfolio,
    history,
  };
  if (instruction === "chat") {
    payload.userMessage = userMessage;
  }
  return payload;
}

// ----- Current project ------------------------------------------------------
// A compressed shape of the GET /api/projects/:id bundle: just what the AI
// needs to reason about scope, schedule, resource balance.
async function loadCurrentProject(projectId) {
  const projRes = await query(
    `SELECT p.ProjectId        AS "projectId",
            p.ProjectName      AS "projectName",
            p.ClientName       AS "clientName",
            p.SowOrTaskId      AS "sowOrTaskId",
            p.Status           AS "status",
            p.StartDate        AS "startDate",
            p.BufferPercent    AS "bufferPercent",
            prod.Name          AS "productName",
            sol.Name           AS "solutionName",
            mod.Name           AS "moduleName"
       FROM Projects p
       LEFT JOIN Products  prod ON prod.ProductId  = p.ProductId
       LEFT JOIN Solutions sol  ON sol.SolutionId  = p.SolutionId
       LEFT JOIN Modules   mod  ON mod.ModuleId    = p.ModuleId
      WHERE p.ProjectId = $1`,
    [projectId]
  );
  if (projRes.rowCount === 0) return null;
  const p = projRes.rows[0];

  const taskRes = await query(
    `SELECT TaskId AS "taskId", ParentTaskId AS "parentTaskId",
            RowNumber AS "rowNumber", SortOrder AS "sortOrder",
            Depth AS "depth", TaskName AS "taskName",
            IsConcurrent AS "isConcurrent", Notes AS "notes",
            DurationDays AS "durationDays"
       FROM WbsTasks WHERE ProjectId = $1
       ORDER BY Depth, SortOrder`,
    [projectId]
  );

  const tasks = taskRes.rows.map((t) => ({
    ...t,
    resourceHours: {},
    dependsOn: [],          // row numbers, for AI legibility in the payload
    dependsOnTaskIds: [],   // real task ids, consumed by the schedule engine
  }));
  const byId = new Map(tasks.map((t) => [t.taskId, t]));

  if (tasks.length > 0) {
    // Per-resource hours, keyed by ShortCode for legibility in the prompt.
    const hoursRes = await query(
      `SELECT h.TaskId, r.ShortCode, h.Hours
         FROM TaskResourceHours h
         JOIN WbsTasks t ON t.TaskId = h.TaskId
         JOIN Resources r ON r.ResourceId = h.ResourceId
        WHERE t.ProjectId = $1`,
      [projectId]
    );
    for (const h of hoursRes.rows) {
      const t = byId.get(h.taskid);
      if (t) t.resourceHours[h.shortcode] = Number(h.hours);
    }

    // Dependencies. We capture BOTH the human-readable row number (for the
    // AI payload) AND the real DependsOnTaskId (so the schedule engine's
    // cross-task dependency post-pass actually fires — it keys off
    // `dependsOnTaskIds`). Without the task ids the engine would ignore
    // dependencies and compute a schedule that diverges from the UI.
    const depRes = await query(
      `SELECT d.TaskId, d.DependsOnTaskId AS "dependsOnTaskId",
              dep.RowNumber AS "dependsOnRow"
         FROM TaskDependencies d
         JOIN WbsTasks t   ON t.TaskId   = d.TaskId
         JOIN WbsTasks dep ON dep.TaskId = d.DependsOnTaskId
        WHERE t.ProjectId = $1`,
      [projectId]
    );
    for (const d of depRes.rows) {
      const t = byId.get(d.taskid);
      if (!t) continue;
      t.dependsOn.push(d.dependsOnRow);
      t.dependsOnTaskIds.push(d.dependsOnTaskId);
    }
  }

  // Compute schedule for total / buffered hours; reused from the existing engine.
  const start = (p.startDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const sched = schedule(tasks, start);
  let totalHours = 0;
  for (const row of sched.values()) {
    if (row.isLeaf) totalHours += Number(row.totalHours) || 0;
  }
  const bufferedHours = totalHours * (1 + (Number(p.bufferPercent) || 0) / 100);

  // Most tasks store NULL in WbsTasks.DurationDays — only manual leaf
  // overrides are explicit. The UI computes the displayed "DAYS" column
  // from the schedule engine's start/end dates via a client-side
  // workingDays() helper (project.html line ~402). The AI needs the same
  // computed value, otherwise it sees `durationDays: null` for parent
  // rollups and reports it as missing data. Fill from the schedule here,
  // preserving any positive DB override (matches the UI's precedence).
  for (const [taskId, row] of sched.entries()) {
    const t = byId.get(taskId);
    if (!t) continue;
    if (!(Number(t.durationDays) > 0)) {
      t.durationDays = workingDays(row.startDate, row.endDate) || null;
    }
  }

  // Strip internal IDs the AI doesn't need, cap task count.
  const compactTasks = tasks.slice(0, MAX_TASKS).map((t) => ({
    rowNumber: t.rowNumber,
    depth: t.depth,
    taskName: t.taskName,
    durationDays: Number(t.durationDays) || null,
    isConcurrent: !!t.isConcurrent,
    notes: t.notes || null,
    resourceHours: t.resourceHours,
    dependsOn: t.dependsOn,
  }));

  return {
    name: p.projectName,
    client: p.clientName,
    sowOrTaskId: p.sowOrTaskId,
    status: p.status,
    startDate: p.startDate,
    bufferPercent: Number(p.bufferPercent) || 0,
    product: p.productName,
    solution: p.solutionName,
    module: p.moduleName,
    totalHours: Math.round(totalHours * 10) / 10,
    bufferedHours: Math.round(bufferedHours * 10) / 10,
    taskCount: tasks.length,
    tasksTruncated: tasks.length > MAX_TASKS,
    tasks: compactTasks,
  };
}

// ----- Comparable peers -----------------------------------------------------
// Same product OR solution OR module as the current project, excluding self
// and archived projects. Returns aggregated summary only — no task detail,
// no client identifying info beyond the project name (peer projects belong to
// the same internal portfolio so the user is allowed to see them).
async function loadComparablePeers(projectId, currentProject) {
  const r = await query(
    `SELECT
        p.ProjectId      AS "projectId",
        p.ProjectName    AS "projectName",
        p.Status         AS "status",
        COALESCE(SUM(trh.Hours), 0) AS "totalHours",
        COUNT(DISTINCT wt.TaskId)   AS "taskCount"
       FROM Projects p
       LEFT JOIN WbsTasks wt          ON wt.ProjectId = p.ProjectId
       LEFT JOIN TaskResourceHours trh ON trh.TaskId  = wt.TaskId
      WHERE p.IsArchived = FALSE
        AND p.ProjectId <> $1
        AND (
              p.ProductId  = (SELECT ProductId  FROM Projects WHERE ProjectId = $1)
           OR p.SolutionId = (SELECT SolutionId FROM Projects WHERE ProjectId = $1)
           OR p.ModuleId   = (SELECT ModuleId   FROM Projects WHERE ProjectId = $1)
        )
      GROUP BY p.ProjectId, p.ProjectName, p.Status, p.ModifiedAtUtc
      ORDER BY p.ModifiedAtUtc DESC
      LIMIT $2`,
    [projectId, MAX_PEERS]
  );

  if (r.rowCount === 0) return [];

  // Decorate each peer with the top 3 roles by hours.
  const peerIds = r.rows.map((row) => row.projectId);
  const rolesRes = await query(
    `SELECT wt.ProjectId AS "projectId", res.ShortCode AS "shortCode",
            SUM(trh.Hours) AS "hours"
       FROM TaskResourceHours trh
       JOIN WbsTasks  wt  ON wt.TaskId      = trh.TaskId
       JOIN Resources res ON res.ResourceId = trh.ResourceId
      WHERE wt.ProjectId = ANY($1::int[])
      GROUP BY wt.ProjectId, res.ShortCode`,
    [peerIds]
  );
  const rolesByProject = new Map();
  for (const row of rolesRes.rows) {
    const arr = rolesByProject.get(row.projectId) || [];
    arr.push({ shortCode: row.shortCode, hours: Number(row.hours) });
    rolesByProject.set(row.projectId, arr);
  }
  for (const arr of rolesByProject.values()) {
    arr.sort((a, b) => b.hours - a.hours);
  }

  return r.rows.map((row) => ({
    projectName: row.projectName,
    status: row.status,
    totalHours: Math.round(Number(row.totalHours) * 10) / 10,
    taskCount: Number(row.taskCount) || 0,
    topRoles: (rolesByProject.get(row.projectId) || []).slice(0, 3).map((x) => x.shortCode),
  }));
}

// ----- Portfolio summary ----------------------------------------------------
// One row per status + the top 8 roles by global demand. Cheap query.
async function loadPortfolioSummary() {
  const totRes = await query(
    `SELECT Status AS "status", COUNT(*)::int AS "count"
       FROM Projects WHERE IsArchived = FALSE GROUP BY Status`
  );
  const byStatus = {};
  let totalProjects = 0;
  for (const r of totRes.rows) {
    byStatus[r.status || "(none)"] = r.count;
    totalProjects += r.count;
  }

  const demandRes = await query(
    `SELECT r.ShortCode AS "shortCode",
            COALESCE(SUM(trh.Hours), 0) AS "hours"
       FROM Resources r
       JOIN TaskResourceHours trh ON trh.ResourceId = r.ResourceId
       JOIN WbsTasks wt           ON wt.TaskId      = trh.TaskId
       JOIN Projects p            ON p.ProjectId    = wt.ProjectId AND p.IsArchived = FALSE
      GROUP BY r.ShortCode
      ORDER BY SUM(trh.Hours) DESC
      LIMIT 8`
  );
  const demandByRole = demandRes.rows.map((r) => ({
    shortCode: r.shortCode,
    hours: Math.round(Number(r.hours) * 10) / 10,
  }));

  return { totalProjects, byStatus, demandByRole };
}

// Count Mon–Fri days inclusive between two ISO date strings (yyyy-mm-dd).
// Returns 0 when either side is missing, malformed, or the range is inverted.
// Mirrors the client-side helper in public/project.html (~line 402) so the
// AI sees the exact same numbers the user sees in the "DAYS" column.
function workingDays(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso + "T00:00:00Z");
  const end   = new Date(endIso   + "T00:00:00Z");
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  let count = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();           // 0=Sun … 6=Sat
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// ----- Recent conversation history ------------------------------------------
async function loadRecentHistory(conversationId, limit) {
  // Pull the last N messages then reverse so the prompt has chronological order.
  const r = await query(
    `SELECT Role AS "role", Content AS "content"
       FROM AIMessages
      WHERE ConversationId = $1
   ORDER BY MessageId DESC
      LIMIT $2`,
    [conversationId, limit]
  );
  return r.rows.reverse();
}
