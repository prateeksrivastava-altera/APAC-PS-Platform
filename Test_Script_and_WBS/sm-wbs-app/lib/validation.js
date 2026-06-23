// Pure request-body validators.
//
// Each validator returns either { ok: true } or { ok: false, field, message }.
// No I/O, no thrown errors — the caller maps a failure straight to a 400.

// Scalars on body.project that the UPDATE in PUT /api/projects/:id writes
// unconditionally. If any of these is missing from the incoming body, the
// row is rewritten with a coerced default ("" / null / 20) — which silently
// destroys whatever value was saved. So: require all of them.
const REQUIRED_PROJECT_FIELDS = [
  "clientName",
  "projectName",
  "sowOrTaskId",
  "status",
  "bufferPercent",
];

export function validateUpdateProjectBody(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, field: "body", message: "request body must be a JSON object" };
  }
  const project = body.project;
  if (!project || typeof project !== "object") {
    return { ok: false, field: "project", message: "missing 'project' object in body" };
  }
  for (const f of REQUIRED_PROJECT_FIELDS) {
    if (!(f in project)) {
      return {
        ok: false,
        field: `project.${f}`,
        message:
          `missing required field 'project.${f}'. PUT /api/projects/:id replaces the full project row; ` +
          `a partial body would silently overwrite saved scalars with defaults. Send a full body.`,
      };
    }
  }
  // resources must be sent explicitly because the handler does a
  // delete-and-replace inside the txn. Use [] to clear, not omission.
  if (!Array.isArray(body.resources)) {
    return {
      ok: false,
      field: "resources",
      message:
        "missing required field 'resources' (must be an array). Omitting it would silently delete " +
        "the project's ProjectResources rows. Send the full roster, or [] to explicitly clear.",
    };
  }
  return { ok: true };
}
