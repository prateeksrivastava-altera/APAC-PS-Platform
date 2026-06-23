// Excel export — port of sm-wbs-builder/ApacWbsApp.Web/Services/Export/ProjectExporter.cs
//
// Four sheets:
//   1. Project       — Client / Project / SOW / Status only (bold left col)
//   2. WBS           — WBS ID | Task | Concurrent | Dependency | Duration | [resources…] | Total hrs
//                      + Actuals / Buffer % / Buffered footer rows
//   3. Resource Plan — Path A (no costing): Resource × Months + Total + Buffer % + Buffered Total
//                      Path B (costing applied): two stacked grids — Hours, then Cost — each with
//                      Role Description / Costing Description / Costing Code / Rate / Total /
//                      Buffer % / Buffered Total / [L1 phases…] / [Months…]
//   4. Timeline      — Two-row month/week header, WBS ID | Task | Duration | [Wk N…] with depth-coloured bars

import ExcelJS from "exceljs";

// ── Colours (mirrors the .NET CHeader / CParentL1 / CParentDeep etc.) ────────
const C_HEADER       = "FFECEFF1";
const C_PARENT_L1    = "FFE4ECF8";
const C_PARENT_DEEP  = "FFEEF3FB";
const C_TOTAL_BG     = "FFE8EAF6";
const C_RP_MONTH_HDR = "FFE3F2FD";
const C_RP_GRAND_HDR = "FFBBDEFB";
const C_BUF_PCT_BG   = "FFF5F5F5";
const C_BUFFERED_BG  = "FFE3F2FD";
const C_BUFFERED_ALT = "FFE8F0FB"; // non-zero-buffer rows in resource-plan
const C_BLUE         = "FF1565C0";
const C_GRAY         = "FF808080";
const C_BAR_L1       = "FF1565C0";
const C_BAR_L2       = "FF26A69A";
const C_BAR_L3PLUS   = "FF90A4AE";

// Number format strings
const FMT_CURRENCY_DEC = '$#,##0.00';
const FMT_CURRENCY     = '_($* #,##0_);_($* (#,##0)';
const FMT_PCT          = '0"%"';
const FMT_HOURS_1      = '0.0';

function fill(argb)   { return { type: "pattern", pattern: "solid", fgColor: { argb } }; }
function bold()       { return { bold: true }; }
function center()     { return { horizontal: "center" }; }
function rightAlign() { return { horizontal: "right" }; }
function roundHalf(v) { return Math.round(v * 2) / 2; }
function round1(v)    { return Math.round(v * 10) / 10; }

// ─── Indexes & tree helpers ────────────────────────────────────────────────

function buildIndexes(tasks) {
  const byParent = new Map();
  for (const t of tasks) {
    const pid = t.parentTaskId ?? 0;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(t);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);

  const parentIds = new Set();
  for (const t of tasks) if (t.parentTaskId != null) parentIds.add(t.parentTaskId);
  const isLeaf = (id) => !parentIds.has(id);

  // DFS tree-sorted order — matches the app's row order
  const sorted = [];
  function walk(pid) {
    for (const t of byParent.get(pid) || []) { sorted.push(t); walk(t.taskId); }
  }
  walk(0);

  function leafDescendants(taskId) {
    const out = [];
    const q = [taskId];
    while (q.length) {
      const cur = q.shift();
      if (isLeaf(cur)) {
        if (cur !== taskId || isLeaf(taskId)) out.push(cur);
      }
      for (const c of byParent.get(cur) || []) q.push(c.taskId);
    }
    return out;
  }

  return { byParent, isLeaf, sorted, leafDescendants };
}

// ─── Schedule helpers (start/end → DurationDays etc.) ──────────────────────

function isoToUtc(iso) { return new Date(iso + "T00:00:00Z"); }
function addDays(d, n) { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; }
function isWeekday(d) { const dow = d.getUTCDay(); return dow !== 0 && dow !== 6; }

function businessDays(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const s = isoToUtc(startIso), e = isoToUtc(endIso);
  if (e <= s) return 0;
  let n = 0;
  for (let d = new Date(s); d < e; d = addDays(d, 1)) if (isWeekday(d)) n++;
  return n;
}

function buildDayWeekMap(startIso, endIso) {
  const map = new Map();
  if (!startIso || !endIso) return { map, totalWeeks: 0 };
  const s = isoToUtc(startIso), e = isoToUtc(endIso);
  if (e <= s) return { map, totalWeeks: 0 };
  let i = 0;
  for (let d = new Date(s); d < e; d = addDays(d, 1)) {
    if (!isWeekday(d)) continue;
    map.set(d.toISOString().slice(0, 10), Math.floor(i / 5));
    i++;
  }
  const totalWeeks = map.size === 0 ? 0 : Math.max(...map.values()) + 1;
  return { map, totalWeeks };
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET 1 — Project
// ════════════════════════════════════════════════════════════════════════════
function buildProjectSheet(wb, project) {
  const ws = wb.addWorksheet("Project");
  const rows = [
    ["Client",       project.clientName  || ""],
    ["Project",      project.projectName || ""],
    ["SOW / Task",   project.sowOrTaskId || ""],
    ["Status",       project.status      || ""],
  ];
  for (const [k, v] of rows) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = bold();
  }
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 60;
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET 2 — WBS
// ════════════════════════════════════════════════════════════════════════════
function buildWbsSheet(wb, tasks, usedResources, scheduleMap, idx) {
  const ws = wb.addWorksheet("WBS");

  const colId   = 1;
  const colTask = 2;
  const colConc = 3;
  const colDep  = 4;
  const colDur  = 5;
  const firstResCol = 6;
  const totalCol = firstResCol + usedResources.length;
  const lastCol  = totalCol;

  const rowNumberById = new Map(tasks.map((t) => [t.taskId, t.rowNumber || ""]));
  const bufMults = usedResources.map((r) => 1 + (Number(r.bufferPercent) || 0) / 100);

  // ── Header row ─────────────────────────────────────────────────────────
  ws.getCell(1, colId).value   = "WBS ID";
  ws.getCell(1, colTask).value = "Task";
  ws.getCell(1, colConc).value = "Concurrent";
  ws.getCell(1, colDep).value  = "Dependency";
  ws.getCell(1, colDur).value  = "Duration";
  for (let i = 0; i < usedResources.length; i++)
    ws.getCell(1, firstResCol + i).value = usedResources[i].roleName;
  ws.getCell(1, totalCol).value = "Total hrs";

  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(1, c);
    cell.font = bold();
    cell.fill = fill(C_HEADER);
    cell.alignment = center();
    cell.border = { ...(cell.border || {}), bottom: { style: "medium" } };
  }
  for (let i = 0; i < usedResources.length; i++) {
    const c = ws.getCell(1, firstResCol + i);
    c.border = { ...(c.border || {}), left: { style: "thin" } };
  }
  ws.getCell(1, totalCol).border = { ...(ws.getCell(1, totalCol).border || {}), left: { style: "medium" } };

  ws.views = [{ state: "frozen", ySplit: 1 }];

  // ── Data rows ──────────────────────────────────────────────────────────
  let excelRow = 2;
  for (const t of idx.sorted) {
    const leaf = idx.isLeaf(t.taskId);
    const leafIds = leaf ? [t.taskId] : idx.leafDescendants(t.taskId);
    const parentBg = !leaf ? (t.depth === 1 ? C_PARENT_L1 : C_PARENT_DEEP) : null;

    if (parentBg) {
      for (let c = 1; c <= lastCol; c++) ws.getCell(excelRow, c).fill = fill(parentBg);
    }

    // WBS ID
    const idCell = ws.getCell(excelRow, colId);
    idCell.value = t.rowNumber || "";
    if (!leaf) idCell.font = bold();

    // Task name (indent via alignment, not spaces — matches .NET ClosedXML)
    const nameCell = ws.getCell(excelRow, colTask);
    nameCell.value = t.taskName || "";
    nameCell.alignment = { indent: Math.max(0, (t.depth - 1) * 2) };
    if (!leaf) {
      nameCell.font = { bold: t.depth === 1, italic: t.depth > 1 };
    }

    // Concurrent — "Y" for leaf, blank otherwise
    const concCell = ws.getCell(excelRow, colConc);
    concCell.value = (t.isConcurrent && leaf) ? "Y" : "";
    concCell.alignment = center();

    // Dependency (comma-joined row numbers)
    if ((t.dependsOnTaskIds || []).length > 0) {
      const labels = t.dependsOnTaskIds
        .map((id) => rowNumberById.get(id))
        .filter((x) => x);
      const dCell = ws.getCell(excelRow, colDep);
      dCell.value = labels.join(", ");
      dCell.alignment = center();
    }

    // Duration (working days between start/end of the scheduled task)
    const sched = scheduleMap[t.taskId] || {};
    const duration = businessDays(sched.startDate, sched.endDate);
    if (duration > 0) {
      const dur = ws.getCell(excelRow, colDur);
      dur.value = duration;
      dur.alignment = center();
      if (!leaf) dur.font = { bold: t.depth === 1, italic: t.depth > 1 };
    }

    // Resource hours + left borders
    let rowTotal = 0;
    for (let i = 0; i < usedResources.length; i++) {
      const rid = usedResources[i].resourceId;
      let hrs = 0;
      for (const lid of leafIds) {
        const lt = tasks.find((x) => x.taskId === lid);
        if (lt) hrs += Number(lt.resourceHours[rid] || 0);
      }
      const c = ws.getCell(excelRow, firstResCol + i);
      c.border = { ...(c.border || {}), left: { style: "thin" } };
      c.alignment = center();
      if (hrs > 0) {
        c.value = round1(hrs);
        if (!leaf) c.font = { bold: t.depth === 1, italic: t.depth > 1 };
      }
      rowTotal += hrs;
    }

    // Total hrs
    const tc = ws.getCell(excelRow, totalCol);
    tc.border = { ...(tc.border || {}), left: { style: "medium" } };
    tc.alignment = rightAlign();
    if (rowTotal > 0) {
      tc.value = round1(rowTotal);
      tc.font = { bold: true, italic: !leaf && t.depth > 1 };
    }

    excelRow++;
  }

  // ── Footer: Actuals / Buffer % / Buffered ──────────────────────────────
  const leafTasks = tasks.filter((t) => idx.isLeaf(t.taskId));
  const resTotals = usedResources.map((r) => {
    return leafTasks.reduce((s, t) => s + Number(t.resourceHours[r.resourceId] || 0), 0);
  });
  const grandTotal = resTotals.reduce((s, v) => s + v, 0);
  const resBuffered = resTotals.map((h, i) => roundHalf(h * bufMults[i]));
  const bufferedGrand = resBuffered.reduce((s, v) => s + v, 0);

  // Project's total business-day span (min start → max end across all scheduled tasks)
  let minStart = null, maxEnd = null;
  for (const id of Object.keys(scheduleMap)) {
    const s = scheduleMap[id].startDate, e = scheduleMap[id].endDate;
    if (s && (minStart == null || s < minStart)) minStart = s;
    if (e && (maxEnd   == null || e > maxEnd))   maxEnd = e;
  }
  const totalDuration = businessDays(minStart, maxEnd);

  // Row 1: Actuals
  const actRow = excelRow;
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(actRow, c);
    cell.fill = fill(C_TOTAL_BG);
    cell.border = { ...(cell.border || {}), top: { style: "medium" } };
  }
  ws.getCell(actRow, colId).value = "Actuals";
  ws.getCell(actRow, colId).font = bold();

  if (totalDuration > 0) {
    const d = ws.getCell(actRow, colDur);
    d.value = totalDuration;
    d.font = bold();
    d.alignment = center();
  }
  for (let i = 0; i < usedResources.length; i++) {
    const rc = ws.getCell(actRow, firstResCol + i);
    rc.border = { ...(rc.border || {}), left: { style: "thin" } };
    rc.alignment = center();
    rc.font = bold();
    if (resTotals[i] > 0) rc.value = round1(resTotals[i]);
  }
  const gtCell = ws.getCell(actRow, totalCol);
  gtCell.value = round1(grandTotal);
  gtCell.font = bold();
  gtCell.alignment = rightAlign();
  gtCell.border = { ...(gtCell.border || {}), left: { style: "medium" } };
  excelRow++;

  // Row 2: Buffer %
  const bufRow = excelRow;
  for (let c = 1; c <= lastCol; c++) ws.getCell(bufRow, c).fill = fill(C_BUF_PCT_BG);
  const bufLabel = ws.getCell(bufRow, colId);
  bufLabel.value = "Buffer %";
  bufLabel.font = { italic: true, color: { argb: C_GRAY } };
  for (let i = 0; i < usedResources.length; i++) {
    const bc = ws.getCell(bufRow, firstResCol + i);
    bc.value = Number(usedResources[i].bufferPercent) || 0;
    bc.numFmt = FMT_PCT;
    bc.alignment = center();
    bc.font = { italic: true, color: { argb: C_GRAY } };
    bc.border = { ...(bc.border || {}), left: { style: "thin" } };
  }
  ws.getCell(bufRow, totalCol).border = { ...(ws.getCell(bufRow, totalCol).border || {}), left: { style: "medium" } };
  excelRow++;

  // Row 3: Buffered
  const bvRow = excelRow;
  for (let c = 1; c <= lastCol; c++) ws.getCell(bvRow, c).fill = fill(C_BUFFERED_BG);
  const bvLabel = ws.getCell(bvRow, colId);
  bvLabel.value = "Buffered";
  bvLabel.font = { bold: true, color: { argb: C_BLUE } };
  for (let i = 0; i < usedResources.length; i++) {
    const bvc = ws.getCell(bvRow, firstResCol + i);
    bvc.value = resBuffered[i];
    bvc.numFmt = FMT_HOURS_1;
    bvc.alignment = center();
    bvc.font = { bold: true, color: { argb: C_BLUE } };
    bvc.border = { ...(bvc.border || {}), left: { style: "thin" } };
  }
  const bvTotal = ws.getCell(bvRow, totalCol);
  bvTotal.value = bufferedGrand;
  bvTotal.numFmt = FMT_HOURS_1;
  bvTotal.font = { bold: true, color: { argb: C_BLUE } };
  bvTotal.alignment = rightAlign();
  bvTotal.border = { ...(bvTotal.border || {}), left: { style: "medium" } };

  // Column widths
  ws.getColumn(colId).width = 10;
  ws.getColumn(colTask).width = 32;
  ws.getColumn(colConc).width = 12;
  ws.getColumn(colDep).width = 14;
  ws.getColumn(colDur).width = 10;
  for (let i = 0; i < usedResources.length; i++) ws.getColumn(firstResCol + i).width = 12;
  ws.getColumn(totalCol).width = 12;
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET 3 — Resource Plan
// ════════════════════════════════════════════════════════════════════════════

function computeMonthlyHours(tasks, scheduleMap, usedResources, projectStart, idx) {
  let maxEnd = null;
  for (const id of Object.keys(scheduleMap)) {
    const e = scheduleMap[id].endDate;
    if (e && (maxEnd == null || e > maxEnd)) maxEnd = e;
  }
  if (!maxEnd) return { totalWeeks: 0, totalMonths: 0, hours: [] };

  const { map: dayToWeek, totalWeeks } = buildDayWeekMap(projectStart, maxEnd);
  if (totalWeeks === 0) return { totalWeeks: 0, totalMonths: 0, hours: [] };

  const hours = usedResources.map(() => new Array(totalWeeks).fill(0));
  for (const t of tasks) {
    if (!idx.isLeaf(t.taskId)) continue;
    const sched = scheduleMap[t.taskId];
    if (!sched || !sched.startDate || !sched.endDate) continue;
    const wkCounts = new Map();
    for (let d = isoToUtc(sched.startDate); d < isoToUtc(sched.endDate); d = addDays(d, 1)) {
      if (!isWeekday(d)) continue;
      const wk = dayToWeek.get(d.toISOString().slice(0, 10));
      if (wk == null) continue;
      wkCounts.set(wk, (wkCounts.get(wk) || 0) + 1);
    }
    let actual = 0;
    for (const c of wkCounts.values()) actual += c;
    if (actual <= 0) continue;
    for (let ri = 0; ri < usedResources.length; ri++) {
      const total = Number(t.resourceHours[usedResources[ri].resourceId] || 0);
      if (total <= 0) continue;
      for (const [wk, cnt] of wkCounts.entries()) hours[ri][wk] += (total * cnt) / actual;
    }
  }
  return { totalWeeks, totalMonths: Math.ceil(totalWeeks / 4), hours };
}

function monthHrs(plan, ri, m) {
  const start = m * 4;
  const wks = Math.min(start + 4, plan.totalWeeks) - start;
  let s = 0;
  for (let w = start; w < start + wks; w++) s += plan.hours[ri][w] || 0;
  return s;
}
function totalHrs(plan, ri) {
  return plan.hours[ri].reduce((s, v) => s + v, 0);
}

// L1 phase totals (sum of leaf hours under each depth-1 task)
function computeL1Hours(tasks, usedResources, idx) {
  const l1 = (idx.byParent.get(0) || []).filter((t) => t.depth === 1);
  const matrix = l1.map((phase) => {
    const leafIds = idx.leafDescendants(phase.taskId);
    return usedResources.map((r) => {
      let s = 0;
      for (const lid of leafIds) {
        const t = tasks.find((x) => x.taskId === lid);
        if (t) s += Number(t.resourceHours[r.resourceId] || 0);
      }
      return s;
    });
  });
  return { l1, matrix };
}

function buildResourcePlanSheet(wb, tasks, usedResources, scheduleMap, projectStart, idx, costing) {
  if (usedResources.length === 0) return;
  const plan = computeMonthlyHours(tasks, scheduleMap, usedResources, projectStart, idx);
  if (plan.totalWeeks === 0) return;

  const ws = wb.addWorksheet("Resource Plan");
  const bufMults = usedResources.map((r) => 1 + (Number(r.bufferPercent) || 0) / 100);
  const anyBuf = usedResources.some((r) => (Number(r.bufferPercent) || 0) > 0);

  if (!costing) {
    // ─── Path A — no costing: simple Resource × Month grid ──────────────
    const colRes = 1;
    const totalCol = 2 + plan.totalMonths;
    const bufPctCol = totalCol + 1;
    const bufCol = totalCol + 2;
    const lastCol = anyBuf ? bufCol : totalCol;

    const styleHdr = (c, bg) => {
      c.font = bold();
      c.fill = fill(bg || C_HEADER);
      c.alignment = center();
    };

    styleHdr(ws.getCell(1, colRes)); ws.getCell(1, colRes).value = "Resource";
    for (let m = 0; m < plan.totalMonths; m++) {
      const c = ws.getCell(1, 2 + m);
      styleHdr(c);
      c.value = `Month ${m + 1}`;
    }
    styleHdr(ws.getCell(1, totalCol), C_RP_GRAND_HDR);
    ws.getCell(1, totalCol).value = "Total";

    if (anyBuf) {
      const bpc = ws.getCell(1, bufPctCol);
      styleHdr(bpc, C_BUF_PCT_BG);
      bpc.value = "Buffer %";
      bpc.font = { bold: true, color: { argb: C_GRAY } };
      bpc.border = { ...(bpc.border || {}), left: { style: "thin" } };

      const bc = ws.getCell(1, bufCol);
      styleHdr(bc, C_RP_GRAND_HDR);
      bc.value = "Buffered Total";
      bc.font = { bold: true, color: { argb: C_BLUE } };
      bc.border = { ...(bc.border || {}), left: { style: "medium" } };
    }
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(1, c);
      cell.border = { ...(cell.border || {}), bottom: { style: "medium" } };
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];

    let row = 2;
    for (let ri = 0; ri < usedResources.length; ri++) {
      const altBg = ri % 2 === 1 ? "FFF8F9FA" : null;
      if (altBg) {
        for (let c = 1; c <= lastCol; c++) ws.getCell(row, c).fill = fill(altBg);
      }
      ws.getCell(row, colRes).value = usedResources[ri].roleName;
      const grand = totalHrs(plan, ri);
      for (let m = 0; m < plan.totalMonths; m++) {
        const h = round1(monthHrs(plan, ri, m));
        const c = ws.getCell(row, 2 + m);
        if (h > 0) { c.value = h; c.alignment = center(); }
      }
      const tc = ws.getCell(row, totalCol);
      tc.value = round1(grand);
      tc.font = bold();
      tc.alignment = center();
      tc.fill = fill(C_RP_GRAND_HDR);

      if (anyBuf) {
        const bp = ws.getCell(row, bufPctCol);
        bp.value = Number(usedResources[ri].bufferPercent) || 0;
        bp.numFmt = FMT_PCT;
        bp.alignment = center();
        bp.font = { italic: true, color: { argb: C_GRAY } };
        bp.fill = fill(C_BUF_PCT_BG);
        bp.border = { ...(bp.border || {}), left: { style: "thin" } };

        const bufVal = round1(grand * bufMults[ri]);
        const b = ws.getCell(row, bufCol);
        b.value = bufVal;
        b.font = { bold: true, color: { argb: C_BLUE } };
        b.alignment = center();
        b.fill = fill((Number(usedResources[ri].bufferPercent) || 0) > 0 ? C_BUFFERED_ALT : C_BUF_PCT_BG);
        b.border = { ...(b.border || {}), left: { style: "medium" } };
      }
      row++;
    }

    // Footer (Totals row)
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(row, c);
      cell.fill = fill(C_TOTAL_BG);
      cell.border = { ...(cell.border || {}), top: { style: "medium" } };
    }
    ws.getCell(row, colRes).value = "Total";
    ws.getCell(row, colRes).font = bold();
    let grandFooter = 0;
    for (let m = 0; m < plan.totalMonths; m++) {
      let mt = 0;
      for (let ri = 0; ri < usedResources.length; ri++) mt += monthHrs(plan, ri, m);
      mt = round1(mt);
      const c = ws.getCell(row, 2 + m);
      if (mt > 0) { c.value = mt; c.font = bold(); c.alignment = center(); }
      grandFooter += mt;
    }
    const tcf = ws.getCell(row, totalCol);
    tcf.value = round1(grandFooter);
    tcf.font = bold();
    tcf.alignment = center();
    tcf.fill = fill(C_RP_GRAND_HDR);

    if (anyBuf) {
      const bpcf = ws.getCell(row, bufPctCol);
      bpcf.fill = fill(C_BUF_PCT_BG);
      bpcf.border = { ...(bpcf.border || {}), left: { style: "thin" } };

      let bufGrand = 0;
      for (let ri = 0; ri < usedResources.length; ri++)
        bufGrand += totalHrs(plan, ri) * bufMults[ri];
      bufGrand = round1(bufGrand);
      const bcf = ws.getCell(row, bufCol);
      bcf.value = bufGrand;
      bcf.font = { bold: true, color: { argb: C_BLUE } };
      bcf.alignment = center();
      bcf.fill = fill(C_RP_GRAND_HDR);
      bcf.border = { ...(bcf.border || {}), left: { style: "medium" } };
    }

    // Column widths
    ws.getColumn(colRes).width = 28;
    for (let m = 0; m < plan.totalMonths; m++) ws.getColumn(2 + m).width = 12;
    ws.getColumn(totalCol).width = 12;
    if (anyBuf) {
      ws.getColumn(bufPctCol).width = 10;
      ws.getColumn(bufCol).width = 16;
    }
    ws.getRow(1).height = 18;
    return;
  }

  // ─── Path B — costing applied: two stacked grids ────────────────────────
  const { rates, profileName } = costing;
  const hasRate = (rid) => Object.prototype.hasOwnProperty.call(rates, rid);
  const rate = (rid) => Number(rates[rid] || 0);

  const { l1: l1Tasks, matrix: l1Hours } = computeL1Hours(tasks, usedResources, idx);

  // Shared column scheme
  const colRoleDesc = 1, colCostDesc = 2, colCostCode = 3, colRate = 4;
  const colTotal = 5, colBufPct = 6, colBuffered = 7;
  const firstL1Col = 8;
  const firstMonthCol = firstL1Col + l1Tasks.length;
  const lastCol = firstMonthCol + plan.totalMonths - 1;

  const styleHeader = (c, bg) => {
    c.font = bold();
    c.fill = fill(bg || C_HEADER);
    c.alignment = { horizontal: "center", wrapText: true };
  };
  const writeCost = (cell, has, cost) => {
    if (!has) {
      cell.value = "N/A";
      cell.font = { italic: true, color: { argb: C_GRAY } };
    } else if (cost > 0) {
      cell.value = Math.round(cost);
      cell.numFmt = FMT_CURRENCY;
    }
    cell.alignment = center();
  };

  function writeHeaderRow(hdrRow, totalLabel, totalBg, bufferedLabel) {
    const fixed = [
      [colRoleDesc, "Role Description", null],
      [colCostDesc, "Costing Description", null],
      [colCostCode, "Costing Code", null],
      [colRate, "Rate ($/hr)", null],
      [colTotal, totalLabel, totalBg],
      [colBufPct, "Buffer %", C_BUF_PCT_BG],
      [colBuffered, bufferedLabel, C_RP_GRAND_HDR],
    ];
    for (const [c, v, bg] of fixed) {
      const cell = ws.getCell(hdrRow, c);
      styleHeader(cell, bg);
      cell.value = v;
    }
    ws.getCell(hdrRow, colTotal).border = { ...(ws.getCell(hdrRow, colTotal).border || {}), left: { style: "medium" } };
    ws.getCell(hdrRow, colBufPct).font = { bold: true, color: { argb: C_GRAY } };
    ws.getCell(hdrRow, colBufPct).border = { ...(ws.getCell(hdrRow, colBufPct).border || {}), left: { style: "thin" } };
    ws.getCell(hdrRow, colBuffered).font = { bold: true, color: { argb: C_BLUE } };
    ws.getCell(hdrRow, colBuffered).border = { ...(ws.getCell(hdrRow, colBuffered).border || {}), left: { style: "medium" } };

    for (let li = 0; li < l1Tasks.length; li++) {
      const c = ws.getCell(hdrRow, firstL1Col + li);
      styleHeader(c, C_RP_MONTH_HDR);
      c.value = l1Tasks[li].taskName;
      if (li === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
    }
    for (let m = 0; m < plan.totalMonths; m++) {
      const c = ws.getCell(hdrRow, firstMonthCol + m);
      styleHeader(c, C_RP_MONTH_HDR);
      c.value = `Month ${m + 1}`;
      if (m === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
    }
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(hdrRow, c);
      cell.border = { ...(cell.border || {}), bottom: { style: "medium" } };
    }
  }

  // ── Grid 1 — Hours ──
  ws.getCell(1, 1).value = "Hours by Resource";
  ws.getCell(1, 1).font = { bold: true, size: 12, color: { argb: C_BLUE } };
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getRow(1).height = 20;

  writeHeaderRow(2, "Total Hours", C_RP_GRAND_HDR, "Buffered Hours");
  ws.views = [{ state: "frozen", ySplit: 2 }];

  let row = 3;
  for (let ri = 0; ri < usedResources.length; ri++) {
    const r = usedResources[ri];
    const has = hasRate(r.resourceId);
    const altBg = ri % 2 === 1 ? "FFF8F9FA" : null;
    if (altBg) for (let c = 1; c <= lastCol; c++) ws.getCell(row, c).fill = fill(altBg);

    ws.getCell(row, colRoleDesc).value = r.roleName;
    ws.getCell(row, colCostDesc).value = r.costingDescription || "";
    ws.getCell(row, colCostCode).value = r.costingCode || "";

    const rateCell = ws.getCell(row, colRate);
    if (has) { rateCell.value = rate(r.resourceId); rateCell.numFmt = FMT_CURRENCY_DEC; }
    else { rateCell.value = "N/A"; rateCell.font = { italic: true, color: { argb: C_GRAY } }; }
    rateCell.alignment = center();

    const tH = round1(totalHrs(plan, ri));
    const tc = ws.getCell(row, colTotal);
    tc.value = tH;
    tc.font = bold();
    tc.alignment = center();
    tc.fill = fill(C_RP_GRAND_HDR);
    tc.border = { ...(tc.border || {}), left: { style: "medium" } };

    const bp = ws.getCell(row, colBufPct);
    bp.value = Number(r.bufferPercent) || 0;
    bp.numFmt = FMT_PCT;
    bp.alignment = center();
    bp.font = { italic: true, color: { argb: C_GRAY } };
    bp.fill = fill(C_BUF_PCT_BG);
    bp.border = { ...(bp.border || {}), left: { style: "thin" } };

    const bhCell = ws.getCell(row, colBuffered);
    bhCell.border = { ...(bhCell.border || {}), left: { style: "medium" } };
    const bh = round1(tH * bufMults[ri]);
    bhCell.value = bh;
    bhCell.font = { bold: true, color: { argb: C_BLUE } };
    bhCell.alignment = center();
    bhCell.fill = fill((Number(r.bufferPercent) || 0) > 0 ? C_BUFFERED_ALT : C_BUF_PCT_BG);

    for (let li = 0; li < l1Tasks.length; li++) {
      const h = round1(l1Hours[li][ri]);
      const c = ws.getCell(row, firstL1Col + li);
      if (h > 0) c.value = h;
      c.alignment = center();
      if (li === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
    }
    for (let m = 0; m < plan.totalMonths; m++) {
      const h = round1(monthHrs(plan, ri, m));
      const c = ws.getCell(row, firstMonthCol + m);
      if (h > 0) c.value = h;
      c.alignment = center();
      if (m === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
    }
    row++;
  }

  // Grid 1 footer
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = fill(C_TOTAL_BG);
    cell.border = { ...(cell.border || {}), top: { style: "medium" } };
  }
  ws.getCell(row, colRoleDesc).value = "Total";
  ws.getCell(row, colRoleDesc).font = bold();
  let g1Grand = 0;
  for (let ri = 0; ri < usedResources.length; ri++) g1Grand += totalHrs(plan, ri);
  g1Grand = round1(g1Grand);
  const g1tc = ws.getCell(row, colTotal);
  g1tc.value = g1Grand;
  g1tc.font = bold();
  g1tc.alignment = center();
  g1tc.fill = fill(C_RP_GRAND_HDR);
  g1tc.border = { ...(g1tc.border || {}), left: { style: "medium" } };

  ws.getCell(row, colBufPct).fill = fill(C_BUF_PCT_BG);
  ws.getCell(row, colBufPct).border = { ...(ws.getCell(row, colBufPct).border || {}), left: { style: "thin" } };

  let bufG1 = 0;
  for (let ri = 0; ri < usedResources.length; ri++) bufG1 += totalHrs(plan, ri) * bufMults[ri];
  bufG1 = round1(bufG1);
  const g1bc = ws.getCell(row, colBuffered);
  g1bc.value = bufG1;
  g1bc.font = { bold: true, color: { argb: C_BLUE } };
  g1bc.alignment = center();
  g1bc.fill = fill(C_RP_GRAND_HDR);
  g1bc.border = { ...(g1bc.border || {}), left: { style: "medium" } };

  for (let li = 0; li < l1Tasks.length; li++) {
    let s = 0;
    for (let ri = 0; ri < usedResources.length; ri++) s += l1Hours[li][ri];
    s = round1(s);
    const c = ws.getCell(row, firstL1Col + li);
    if (s > 0) c.value = s;
    c.font = bold();
    c.alignment = center();
    if (li === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
  }
  for (let m = 0; m < plan.totalMonths; m++) {
    let s = 0;
    for (let ri = 0; ri < usedResources.length; ri++) s += monthHrs(plan, ri, m);
    s = round1(s);
    const c = ws.getCell(row, firstMonthCol + m);
    if (s > 0) c.value = s;
    c.font = bold();
    c.alignment = center();
    if (m === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
  }
  row++;

  // ── Grid 2 — Cost ──
  row += 2; // blank separator
  ws.getCell(row, 1).value = `Cost Estimate by Resource — ${profileName || "Applied Profile"}`;
  ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: C_BLUE } };
  ws.mergeCells(row, 1, row, lastCol);
  ws.getRow(row).height = 20;
  row++;

  writeHeaderRow(row, "Total Cost", C_RP_GRAND_HDR, "Buffered Cost");
  row++;

  for (let ri = 0; ri < usedResources.length; ri++) {
    const r = usedResources[ri];
    const has = hasRate(r.resourceId);
    const altBg = ri % 2 === 1 ? "FFF8F9FA" : null;
    if (altBg) for (let c = 1; c <= lastCol; c++) ws.getCell(row, c).fill = fill(altBg);

    ws.getCell(row, colRoleDesc).value = r.roleName;
    ws.getCell(row, colCostDesc).value = r.costingDescription || "";
    ws.getCell(row, colCostCode).value = r.costingCode || "";

    const rateCell = ws.getCell(row, colRate);
    if (has) { rateCell.value = rate(r.resourceId); rateCell.numFmt = FMT_CURRENCY_DEC; }
    else { rateCell.value = "N/A"; rateCell.font = { italic: true, color: { argb: C_GRAY } }; }
    rateCell.alignment = center();

    const tH = round1(totalHrs(plan, ri));
    const costCell = ws.getCell(row, colTotal);
    writeCost(costCell, has, tH * rate(r.resourceId));
    costCell.font = bold();
    if (has) costCell.fill = fill(C_RP_GRAND_HDR);
    costCell.border = { ...(costCell.border || {}), left: { style: "medium" } };

    const bp = ws.getCell(row, colBufPct);
    bp.value = Number(r.bufferPercent) || 0;
    bp.numFmt = FMT_PCT;
    bp.alignment = center();
    bp.font = { italic: true, color: { argb: C_GRAY } };
    bp.fill = fill(C_BUF_PCT_BG);
    bp.border = { ...(bp.border || {}), left: { style: "thin" } };

    const bcCell = ws.getCell(row, colBuffered);
    bcCell.border = { ...(bcCell.border || {}), left: { style: "medium" } };
    if (has) {
      writeCost(bcCell, true, tH * bufMults[ri] * rate(r.resourceId));
      bcCell.font = { bold: true, color: { argb: C_BLUE } };
      bcCell.fill = fill((Number(r.bufferPercent) || 0) > 0 ? C_BUFFERED_ALT : C_BUF_PCT_BG);
    } else {
      bcCell.value = "N/A";
      bcCell.font = { italic: true, color: { argb: C_GRAY } };
      bcCell.fill = fill(C_BUF_PCT_BG);
    }

    for (let li = 0; li < l1Tasks.length; li++) {
      const c = ws.getCell(row, firstL1Col + li);
      writeCost(c, has, round1(l1Hours[li][ri]) * rate(r.resourceId));
      if (li === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
    }
    for (let m = 0; m < plan.totalMonths; m++) {
      const c = ws.getCell(row, firstMonthCol + m);
      writeCost(c, has, round1(monthHrs(plan, ri, m)) * rate(r.resourceId));
      if (m === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
    }
    row++;
  }

  // Grid 2 footer
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = fill(C_TOTAL_BG);
    cell.border = { ...(cell.border || {}), top: { style: "medium" } };
  }
  ws.getCell(row, colRoleDesc).value = "Total";
  ws.getCell(row, colRoleDesc).font = bold();

  let grandCost = 0;
  for (let ri = 0; ri < usedResources.length; ri++) {
    if (hasRate(usedResources[ri].resourceId)) {
      grandCost += round1(totalHrs(plan, ri)) * rate(usedResources[ri].resourceId);
    }
  }
  const g2tc = ws.getCell(row, colTotal);
  writeCost(g2tc, true, grandCost);
  g2tc.font = bold();
  g2tc.fill = fill(C_RP_GRAND_HDR);
  g2tc.border = { ...(g2tc.border || {}), left: { style: "medium" } };

  ws.getCell(row, colBufPct).fill = fill(C_BUF_PCT_BG);
  ws.getCell(row, colBufPct).border = { ...(ws.getCell(row, colBufPct).border || {}), left: { style: "thin" } };

  let bufG2 = 0;
  for (let ri = 0; ri < usedResources.length; ri++) {
    if (hasRate(usedResources[ri].resourceId)) {
      bufG2 += round1(totalHrs(plan, ri) * bufMults[ri]) * rate(usedResources[ri].resourceId);
    }
  }
  const g2bc = ws.getCell(row, colBuffered);
  writeCost(g2bc, true, Math.round(bufG2));
  g2bc.font = { bold: true, color: { argb: C_BLUE } };
  g2bc.fill = fill(C_RP_GRAND_HDR);
  g2bc.border = { ...(g2bc.border || {}), left: { style: "medium" } };

  for (let li = 0; li < l1Tasks.length; li++) {
    let s = 0;
    for (let ri = 0; ri < usedResources.length; ri++)
      if (hasRate(usedResources[ri].resourceId))
        s += l1Hours[li][ri] * rate(usedResources[ri].resourceId);
    const c = ws.getCell(row, firstL1Col + li);
    writeCost(c, true, Math.round(s));
    c.font = bold();
    if (li === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
  }
  for (let m = 0; m < plan.totalMonths; m++) {
    let s = 0;
    for (let ri = 0; ri < usedResources.length; ri++)
      if (hasRate(usedResources[ri].resourceId))
        s += monthHrs(plan, ri, m) * rate(usedResources[ri].resourceId);
    const c = ws.getCell(row, firstMonthCol + m);
    writeCost(c, true, Math.round(s));
    c.font = bold();
    if (m === 0) c.border = { ...(c.border || {}), left: { style: "medium" } };
  }

  // Column widths (shared)
  ws.getColumn(colRoleDesc).width = 24;
  ws.getColumn(colCostDesc).width = 24;
  ws.getColumn(colCostCode).width = 14;
  ws.getColumn(colRate).width = 12;
  ws.getColumn(colTotal).width = 14;
  ws.getColumn(colBufPct).width = 10;
  ws.getColumn(colBuffered).width = 16;
  for (let li = 0; li < l1Tasks.length; li++) ws.getColumn(firstL1Col + li).width = 16;
  for (let m = 0; m < plan.totalMonths; m++) ws.getColumn(firstMonthCol + m).width = 14;
  ws.getRow(2).height = 30;
}

// ════════════════════════════════════════════════════════════════════════════
// SHEET 4 — Timeline
// ════════════════════════════════════════════════════════════════════════════
function buildTimelineSheet(wb, tasks, scheduleMap, idx, projectStart) {
  const ws = wb.addWorksheet("Timeline");

  // Filter to scheduled tasks (those with start/end). DFS order = same as WBS.
  const scheduled = idx.sorted.filter((t) => {
    const s = scheduleMap[t.taskId];
    return s && s.startDate && s.endDate;
  });
  if (scheduled.length === 0) {
    ws.getCell("A1").value = "No scheduled tasks.";
    return;
  }

  // min start / max end
  let minStart = null, maxEnd = null;
  for (const t of scheduled) {
    const s = scheduleMap[t.taskId];
    if (minStart == null || s.startDate < minStart) minStart = s.startDate;
    if (maxEnd   == null || s.endDate   > maxEnd)   maxEnd   = s.endDate;
  }
  const { map: dayToWeek, totalWeeks } = buildDayWeekMap(minStart, maxEnd);
  const totalMonths = Math.ceil(totalWeeks / 4);

  const colId = 1, colTask = 2, colDur = 3;
  const firstWkCol = 4;
  const lastWkCol = firstWkCol + totalWeeks - 1;

  // Row 1: fixed labels + month spans
  ws.getCell(1, colId).value = "WBS ID";
  ws.getCell(1, colTask).value = "Task";
  ws.getCell(1, colDur).value = "Duration";

  for (let m = 0; m < totalMonths; m++) {
    const wkStart = m * 4;
    const wkEnd = Math.min(wkStart + 4, totalWeeks) - 1;
    const colStart = firstWkCol + wkStart;
    const colEnd = firstWkCol + wkEnd;
    const cell = ws.getCell(1, colStart);
    cell.value = `Month ${m + 1}`;
    if (colEnd > colStart) ws.mergeCells(1, colStart, 1, colEnd);
    cell.alignment = center();
    cell.font = bold();
    cell.fill = fill(C_HEADER);
    // Month boundary thin border (gray-blue)
    const borderArgb = "FF607D8B";
    for (let r2 = 1; r2 <= 2; r2++) {
      const bc = ws.getCell(r2, colStart);
      bc.border = { ...(bc.border || {}), left: { style: "medium", color: { argb: borderArgb } } };
    }
  }

  // Row 2: week labels
  for (let w = 0; w < totalWeeks; w++) {
    const c = ws.getCell(2, firstWkCol + w);
    c.value = `Wk ${w + 1}`;
    c.font = bold();
    c.alignment = center();
    c.fill = fill(C_HEADER);
  }

  // Merge fixed columns across both header rows
  for (const c of [colId, colTask, colDur]) {
    ws.mergeCells(1, c, 2, c);
    const cell = ws.getCell(1, c);
    cell.font = bold();
    cell.fill = fill(C_HEADER);
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }

  // Header bottom borders
  for (let c = 1; c <= lastWkCol; c++) {
    const top = ws.getCell(1, c);
    top.border = { ...(top.border || {}), bottom: { style: "thin" } };
    const bot = ws.getCell(2, c);
    bot.border = { ...(bot.border || {}), bottom: { style: "medium" } };
  }

  // Data rows
  let excelRow = 3;
  for (const t of scheduled) {
    const leaf = idx.isLeaf(t.taskId);
    ws.getCell(excelRow, colId).value = t.rowNumber || "";

    const nameCell = ws.getCell(excelRow, colTask);
    nameCell.value = t.taskName || "";
    nameCell.alignment = { indent: Math.max(0, (t.depth - 1) * 2) };
    if (!leaf) nameCell.font = { bold: t.depth === 1, italic: t.depth > 1 };

    const sched = scheduleMap[t.taskId];
    const dur = businessDays(sched.startDate, sched.endDate);
    const dcell = ws.getCell(excelRow, colDur);
    dcell.value = dur;
    dcell.alignment = center();
    if (!leaf) dcell.font = { bold: t.depth === 1, italic: t.depth > 1 };

    // Bar colour by depth
    const barColor =
      t.depth === 1 ? C_BAR_L1 :
      t.depth === 2 ? C_BAR_L2 :
                      C_BAR_L3PLUS;

    // Which weeks are active
    const activeWeeks = new Set();
    for (let d = isoToUtc(sched.startDate); d < isoToUtc(sched.endDate); d = addDays(d, 1)) {
      if (!isWeekday(d)) continue;
      const wk = dayToWeek.get(d.toISOString().slice(0, 10));
      if (wk != null) activeWeeks.add(wk);
    }
    for (const wk of activeWeeks) {
      ws.getCell(excelRow, firstWkCol + wk).fill = fill(barColor);
    }
    excelRow++;
  }

  // Freeze + widths
  ws.views = [{ state: "frozen", xSplit: colDur, ySplit: 2 }];
  ws.getColumn(colId).width = 10;
  ws.getColumn(colTask).width = 32;
  ws.getColumn(colDur).width = 10;
  for (let w = 0; w < totalWeeks; w++) ws.getColumn(firstWkCol + w).width = 5.5;
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 18;
  ws.pageSetup.orientation = "landscape";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ENTRY
// ════════════════════════════════════════════════════════════════════════════
export async function exportProject({ project, resources, tasks, schedule: scheduleMap, costing }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "APAC WBS Builder";
  wb.created = new Date();

  const idx = buildIndexes(tasks);

  // "usedResources" = resources that actually have at least one hour anywhere
  const usedResources = resources.filter((r) =>
    tasks.some((t) => Number(t.resourceHours[r.resourceId] || 0) > 0)
  );

  // Use sorted-tree task order for all sheets
  const sortedTasks = idx.sorted;

  buildProjectSheet(wb, project);
  buildWbsSheet(wb, sortedTasks, usedResources, scheduleMap, idx);
  buildResourcePlanSheet(wb, sortedTasks, usedResources, scheduleMap, project.startDate, idx, costing || null);
  buildTimelineSheet(wb, sortedTasks, scheduleMap, idx, project.startDate);

  return wb;
}
