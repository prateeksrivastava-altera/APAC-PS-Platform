import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { getPool, close } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Files applied in order. Both already use IF NOT EXISTS / ON CONFLICT
// DO NOTHING, so re-running them on a populated DB is safe.
const migrations = [
  { id: "001_schema.sql", file: path.join(__dirname, "schema.sql") },
  { id: "002_seed.sql", file: path.join(__dirname, "seed.sql") },
  { id: "003_add_client_abbreviation.sql", file: path.join(__dirname, "003_add_client_abbreviation.sql") },
  { id: "004_add_product_solution_module.sql", file: path.join(__dirname, "004_add_product_solution_module.sql") },
  { id: "005_add_project_archive.sql", file: path.join(__dirname, "005_add_project_archive.sql") },
  { id: "006_add_user_permissions.sql", file: path.join(__dirname, "006_add_user_permissions.sql") },
  { id: "007_add_user_oid_admin.sql", file: path.join(__dirname, "007_add_user_oid_admin.sql") },
  { id: "008_add_user_active.sql", file: path.join(__dirname, "008_add_user_active.sql") },
  { id: "009_add_ai_conversations.sql", file: path.join(__dirname, "009_add_ai_conversations.sql") },
  { id: "010_add_actuals.sql", file: path.join(__dirname, "010_add_actuals.sql") },
  { id: "011_add_status_approved.sql", file: path.join(__dirname, "011_add_status_approved.sql") },
  { id: "012_add_user_approver.sql", file: path.join(__dirname, "012_add_user_approver.sql") },
];

export async function runMigrations() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    // Bootstrap the tracking table (the schema file also creates this; running
    // here means we can record entries even on a fresh DB).
    await client.query(`
      CREATE TABLE IF NOT EXISTS AppliedMigrations (
        MigrationId TEXT PRIMARY KEY,
        AppliedAt   TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      )
    `);

    const applied = new Set(
      (await client.query("SELECT MigrationId FROM AppliedMigrations")).rows.map(
        (r) => r.migrationid
      )
    );

    for (const m of migrations) {
      if (applied.has(m.id)) {
        console.log(`[wbs:migrate] skip ${m.id} (already applied)`);
        continue;
      }
      console.log(`[wbs:migrate] apply ${m.id}`);
      const sql = await fs.readFile(m.file, "utf-8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO AppliedMigrations (MigrationId) VALUES ($1) ON CONFLICT DO NOTHING",
          [m.id]
        );
        await client.query("COMMIT");
        console.log(`[wbs:migrate] ok   ${m.id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${m.id} failed: ${err.message}`);
      }
    }
  } finally {
    client.release();
  }
}

// CLI: `node db/migrate.js` runs migrations and exits.
// Use pathToFileURL so the comparison matches Node's import.meta.url shape
// on both POSIX and Windows (file:///C:/... — three slashes).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations()
    .then(() => close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
