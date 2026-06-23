// Run with: npm test
//
// These exercise the pure validators that gate the PUT /api/projects/:id
// handler. No DB, no HTTP server — the handler trusts that a body which
// passes validateUpdateProjectBody is safe to apply.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validateUpdateProjectBody } from "../lib/validation.js";

const fullProject = {
  clientName: "Acme",
  projectName: "Migration",
  sowOrTaskId: "SOW-1",
  status: "Draft",
  bufferPercent: 20,
};

test("validateUpdateProjectBody accepts a full body", () => {
  const r = validateUpdateProjectBody({ project: fullProject, resources: [] });
  assert.equal(r.ok, true);
});

test("validateUpdateProjectBody accepts a populated resources array", () => {
  const r = validateUpdateProjectBody({
    project: fullProject,
    resources: [{ resourceId: 1, bufferPercent: 0 }],
  });
  assert.equal(r.ok, true);
});

test("validateUpdateProjectBody allows optional tasks / actuals to be absent", () => {
  const r = validateUpdateProjectBody({ project: fullProject, resources: [] });
  assert.equal(r.ok, true);
  // Sanity: present-but-empty is also fine (means "wipe").
  const r2 = validateUpdateProjectBody({
    project: fullProject,
    resources: [],
    tasks: [],
    actuals: [],
  });
  assert.equal(r2.ok, true);
});

// ----- Regression: PUT {"project":{"status":"Approved"}} must be rejected. -----
//
// Before this guard, the handler would coerce every missing project scalar
// to "" / null and DELETE every row in ProjectResources for the project,
// silently destroying saved data. We hit this in prod testing the new
// approver gate (migration 012) and had to restore from version snapshots
// and hour-table inference.
test("rejects the approver-gate-style partial body that silently wiped prod data", () => {
  const r = validateUpdateProjectBody({ project: { status: "Approved" } });
  assert.equal(r.ok, false);
  assert.match(r.field, /^project\./);
});

test("rejects missing 'project' object", () => {
  const r = validateUpdateProjectBody({ resources: [] });
  assert.equal(r.ok, false);
  assert.equal(r.field, "project");
});

test("rejects each missing required project scalar by name", () => {
  for (const omitted of Object.keys(fullProject)) {
    const partial = { ...fullProject };
    delete partial[omitted];
    const r = validateUpdateProjectBody({ project: partial, resources: [] });
    assert.equal(r.ok, false, `expected failure when omitting ${omitted}`);
    assert.equal(r.field, `project.${omitted}`);
  }
});

test("rejects missing resources array (would otherwise wipe ProjectResources)", () => {
  const r = validateUpdateProjectBody({ project: fullProject });
  assert.equal(r.ok, false);
  assert.equal(r.field, "resources");
});

test("rejects non-array resources (string, object, null)", () => {
  for (const bad of ["nope", { 0: { resourceId: 1 } }, null]) {
    const r = validateUpdateProjectBody({ project: fullProject, resources: bad });
    assert.equal(r.ok, false);
    assert.equal(r.field, "resources");
  }
});

test("rejects non-object body", () => {
  for (const bad of [null, undefined, "x", 42]) {
    const r = validateUpdateProjectBody(bad);
    assert.equal(r.ok, false);
    assert.equal(r.field, "body");
  }
});
