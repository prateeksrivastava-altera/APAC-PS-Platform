import dotenv from "dotenv";
dotenv.config();

const mode = (process.env.MODE || "dev").toLowerCase() === "prod" ? "prod" : "dev";

const pick = (devKey, prodKey, fallback = "") => {
  const value = mode === "prod" ? process.env[prodKey] : process.env[devKey];
  return value && value.trim() ? value.trim() : fallback;
};

const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  mode,
  db: {
    host: pick("WBS_DB_HOST_DEV", "WBS_DB_HOST_PROD", "localhost"),
    port: parseInt(pick("WBS_DB_PORT_DEV", "WBS_DB_PORT_PROD", "5432"), 10),
    database: pick("WBS_DB_NAME_DEV", "WBS_DB_NAME_PROD", "apac_wbs"),
    user: pick("WBS_DB_USER_DEV", "WBS_DB_USER_PROD", "postgres"),
    password: pick("WBS_DB_PASSWORD_DEV", "WBS_DB_PASSWORD_PROD", ""),
    // pg accepts ssl: { rejectUnauthorized: false } for managed Postgres
    // that uses a self-signed cert. Pass "require" or "true" to enable.
    ssl: process.env.WBS_DB_SSL && /^(1|true|require)$/i.test(process.env.WBS_DB_SSL)
      ? { rejectUnauthorized: false }
      : false,
  },
  // Comma-separated emails force-promoted to admin on every startup. This is
  // the only way to seed the first admin without hand-editing the database.
  bootstrapAdmins: (process.env.WBS_BOOTSTRAP_ADMIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Matcha LLM integration — used by the AI Project Analyst (project.html
  // "AI Assistant" tab). When apiKey is blank the feature is treated as
  // disabled and the /api/projects/:id/ai/* endpoints respond with 503.
  matcha: {
    apiKey: process.env.MATCHA_API_KEY || "",
    baseUrl:
      (process.env.BASE_URL || "https://matcha.harriscomputer.com/rest/api/v1").trim(),
    workspaceId: parseInt(process.env.WORKSPACE_ID || "0", 10),
    timeoutSeconds: parseInt(process.env.MATCHA_TIMEOUT_SECONDS || "120", 10),
    missions: {
      wbs: parseInt(process.env.MISSION_ID_WBS || "0", 10),
    },
  },
};

export default config;
