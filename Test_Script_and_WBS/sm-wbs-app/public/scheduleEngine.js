// Pure port of sm-wbs-builder/ApacWbsApp.Core/Scheduling/ScheduleEngine.cs
//
// Computes per-task StartDate/EndDate from a flat list of WBS tasks plus a
// project start date, honouring:
//   * parent → child containment (a parent spans the union of its children)
//   * sibling sequencing (children run back-to-back unless flagged Concurrent)
//   * cross-task dependencies (TaskDependencies edges)
//   * 5-day work weeks (Mon-Fri); 8h working day (configurable)
//   * leaf duration = ceil(totalHours / hoursPerDay) unless durationDays is set
//
// Dates use plain ISO-8601 strings (`YYYY-MM-DD`) — no Date timezone trickery.

// ----- date helpers (string-based, no Date object timezone surprises) -----

function parseDate(iso) {
  // "YYYY-MM-DD" → [y, m-1, d] tuple
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`bad date: ${iso}`);
  return [parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)];
}

function toIso(y, m, d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function addDays(iso, n) {
  const [y, m, d] = parseDate(iso);
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

function dayOfWeek(iso) {
  const [y, m, d] = parseDate(iso);
  return new Date(Date.UTC(y, m, d)).getUTCDay(); // 0=Sun, 6=Sat
}

function nextWorkingDay(iso) {
  let d = iso;
  let dow = dayOfWeek(d);
  while (dow === 0 || dow === 6) {
    d = addDays(d, 1);
    dow = dayOfWeek(d);
  }
  return d;
}

function addBusinessDays(start, days) {
  let d = start;
  let added = 0;
  while (added < days) {
    d = addDays(d, 1);
    const dow = dayOfWeek(d);
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function businessDayCount(from, to) {
  if (to <= from) return 0;
  let count = 0;
  let d = from;
  while (d < to) {
    const dow = dayOfWeek(d);
    if (dow !== 0 && dow !== 6) count++;
    d = addDays(d, 1);
  }
  return count;
}

function cmpDate(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ----- engine -----

const NO_PARENT_KEY = 0;

/**
 * Compute the schedule. Pure function.
 *
 * @param {Array} tasks  Each task: { taskId, parentTaskId|null, sortOrder, depth,
 *                                    rowNumber, taskName, isConcurrent,
 *                                    resourceHours: {resourceId: hours},
 *                                    dependsOnTaskIds: number[],
 *                                    durationDays|null }
 * @param {string} projectStart `YYYY-MM-DD`
 * @param {number} [hoursPerDay=8]
 * @returns {Map<number, {taskId, rowNumber, taskName, depth, isLeaf,
 *                       isConcurrent, totalHours, startDate, endDate}>}
 */
export function schedule(tasks, projectStart, hoursPerDay = 8) {
  // tasks grouped by parent (0 = roots), sorted by SortOrder
  const byParent = new Map();
  for (const t of tasks) {
    const key = t.parentTaskId ?? NO_PARENT_KEY;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(t);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Initialise output rows
  const output = new Map();
  for (const t of tasks) {
    const hasChildren = byParent.has(t.taskId);
    const totalHours = Object.values(t.resourceHours || {}).reduce(
      (s, v) => s + (Number(v) || 0),
      0
    );
    output.set(t.taskId, {
      taskId: t.taskId,
      rowNumber: t.rowNumber || "",
      taskName: t.taskName,
      depth: t.depth,
      isLeaf: !hasChildren,
      isConcurrent: t.isConcurrent,
      totalHours,
      startDate: null,
      endDate: null,
    });
  }

  // Recursive scheduler — sequences siblings unless IsConcurrent.
  function scheduleNode(node, start) {
    const children = byParent.get(node.taskId);
    if (!children || children.length === 0) {
      // Leaf: pick durationDays override or derive from total hours.
      const totalHours = output.get(node.taskId).totalHours;
      const derived = Math.ceil(totalHours / hoursPerDay);
      const durationDays =
        node.durationDays && node.durationDays > 0
          ? node.durationDays
          : derived;
      const end = addBusinessDays(start, Math.max(0, durationDays));
      const row = output.get(node.taskId);
      row.startDate = start;
      row.endDate = end;
      return end;
    }

    let cursor = start;
    let prev = null;
    for (const child of children) {
      const childStart =
        prev === null || !child.isConcurrent
          ? cursor
          : output.get(prev.taskId).startDate;
      const childEnd = scheduleNode(child, childStart);
      const row = output.get(child.taskId);
      row.startDate = childStart;
      row.endDate = childEnd;
      if (childEnd > cursor) cursor = childEnd;
      prev = child;
    }

    const row = output.get(node.taskId);
    row.startDate = start;
    row.endDate = cursor;
    return cursor;
  }

  // Walk the roots
  let cursor = nextWorkingDay(projectStart);
  const roots = byParent.get(NO_PARENT_KEY) || [];
  let prev = null;
  for (const root of roots) {
    const rootStart =
      prev === null || !root.isConcurrent
        ? cursor
        : output.get(prev.taskId).startDate;
    const rootEnd = scheduleNode(root, rootStart);
    const row = output.get(root.taskId);
    row.startDate = rootStart;
    row.endDate = rootEnd;
    if (rootEnd > cursor) cursor = rootEnd;
    prev = root;
  }

  // Cross-task dependency post-pass.
  if (tasks.some((t) => (t.dependsOnTaskIds || []).length > 0)) {
    applyDependencies(tasks, output, byParent);
  }

  return output;
}

function applyDependencies(tasks, output, byParent) {
  const parentOf = new Map(tasks.map((t) => [t.taskId, t.parentTaskId ?? null]));
  const childrenOf = new Map();
  for (const [pid, kids] of byParent.entries()) {
    if (pid === NO_PARENT_KEY) continue;
    childrenOf.set(pid, kids.map((k) => k.taskId));
  }

  const MAX_ITER = 100;
  let iteration = 0;
  let anyMoved;

  do {
    anyMoved = false;
    iteration++;

    for (const task of tasks) {
      const deps = task.dependsOnTaskIds || [];
      if (deps.length === 0) continue;

      let latestDepEnd = null;
      for (const depId of deps) {
        const dep = output.get(depId);
        if (!dep) continue;
        if (latestDepEnd === null || cmpDate(dep.endDate, latestDepEnd) > 0) {
          latestDepEnd = dep.endDate;
        }
      }
      if (latestDepEnd === null) continue;

      const scheduled = output.get(task.taskId);
      if (cmpDate(latestDepEnd, scheduled.startDate) <= 0) continue;

      const newStart = nextWorkingDay(latestDepEnd);
      const shift = businessDayCount(scheduled.startDate, newStart);
      if (shift <= 0) continue;

      shiftSubtree(task.taskId, shift, output, childrenOf);
      expandAncestors(task.taskId, parentOf, output);
      anyMoved = true;
    }
  } while (anyMoved && iteration < MAX_ITER);
}

function shiftSubtree(rootId, businessDays, output, childrenOf) {
  const row = output.get(rootId);
  row.startDate = addBusinessDays(row.startDate, businessDays);
  row.endDate = addBusinessDays(row.endDate, businessDays);
  const kids = childrenOf.get(rootId);
  if (!kids) return;
  for (const kid of kids) shiftSubtree(kid, businessDays, output, childrenOf);
}

function expandAncestors(taskId, parentOf, output) {
  const parent = parentOf.get(taskId);
  if (!parent) return;
  const parentRow = output.get(parent);
  if (!parentRow) return;
  const child = output.get(taskId);
  if (cmpDate(child.endDate, parentRow.endDate) > 0) {
    parentRow.endDate = child.endDate;
  }
  expandAncestors(parent, parentOf, output);
}

// Exposed for tests / debugging
export const _internal = {
  parseDate,
  addDays,
  dayOfWeek,
  nextWorkingDay,
  addBusinessDays,
  businessDayCount,
};
