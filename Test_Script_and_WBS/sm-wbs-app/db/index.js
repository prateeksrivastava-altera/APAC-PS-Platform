import pg from "pg";
import config from "../config.js";

// Single shared pool. Created lazily on first query so import-time doesn't
// crash the process if Postgres is briefly unreachable.
let _pool = null;

export function getPool() {
  if (!_pool) {
    _pool = new pg.Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      ssl: config.db.ssl,
      // Bounded per-app pool. Each app on the shared Postgres server has its
      // own pool; keep these small so the server's global max_connections
      // (default 100) isn't exhausted as more apps are added. Tunable via env.
      max: parseInt(process.env.WBS_DB_POOL_MAX || "10", 10),
      idleTimeoutMillis: 30_000,
    });
    _pool.on("error", (err) => {
      console.error("[wbs] pg pool error:", err.message);
    });
  }
  return _pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

export async function pingDb() {
  const res = await query("SELECT 1 AS ok");
  return res.rows[0].ok === 1;
}

export async function close() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
