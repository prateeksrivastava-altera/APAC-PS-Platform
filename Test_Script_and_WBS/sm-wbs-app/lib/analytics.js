// Portfolio analytics helpers — pure functions, no DB access.

// Is an ISO YYYY-MM-DD date a weekday (Mon-Fri)? UTC-based to avoid TZ drift.
function isWeekdayIso(iso) {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return dow !== 0 && dow !== 6;
}

// ISO date N days after `iso` (N may be negative).
function addDaysIso(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Distribute one project's leaf-task hours into the calendar months they span,
// per resource — the weekday-proportional split mirrors computeResourcePlan()
// in public/project.html, but keyed to real "YYYY-MM" months so projects from
// different start dates line up on a shared portfolio axis.
//
//   tasks       : [{ taskId, resourceHours: { resourceId: hours }, ... }]
//   scheduleMap : { taskId: { startDate, endDate, isLeaf } }  (from schedule())
//
// Returns Map<"YYYY-MM", Map<resourceId(number), hours>>.
export function monthlyDemandForProject(tasks, scheduleMap) {
  const out = new Map();
  const add = (month, resId, hrs) => {
    if (!out.has(month)) out.set(month, new Map());
    const m = out.get(month);
    m.set(resId, (m.get(resId) || 0) + hrs);
  };

  for (const t of tasks) {
    const s = scheduleMap[t.taskId];
    if (!s || !s.isLeaf || !s.startDate || !s.endDate) continue;
    const hours = t.resourceHours || {};
    const resIds = Object.keys(hours).filter((k) => Number(hours[k]) > 0);
    if (resIds.length === 0) continue;

    // Count weekdays per calendar month across [startDate, endDate).
    const monthDays = new Map();
    let totalDays = 0;
    for (let d = s.startDate; d < s.endDate; d = addDaysIso(d, 1)) {
      if (!isWeekdayIso(d)) continue;
      const month = d.slice(0, 7);
      monthDays.set(month, (monthDays.get(month) || 0) + 1);
      totalDays++;
    }
    if (totalDays === 0) continue;

    for (const resId of resIds) {
      const h = Number(hours[resId]);
      for (const [month, cnt] of monthDays.entries()) {
        add(month, Number(resId), (h * cnt) / totalDays);
      }
    }
  }
  return out;
}
