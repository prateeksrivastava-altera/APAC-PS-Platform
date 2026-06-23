import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import config from "./config.js";
import { executePipeline } from "./services/pipelineOrchestrator.js";
import { callMission } from "./services/matchaApiService.js";
import { requireAuth } from "./services/authMiddleware.js";

// ---- VALIDATE CONFIG ----

if (!config.matcha.apiKey) {
  console.error("ERROR: MATCHA_API_KEY is not set.");
  console.error("Copy .env.example to .env and set your API key.");
  process.exit(1);
}

// ---- EXPRESS APP ----

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---- ENDPOINTS ----

// Public — returns Azure AD config for MSAL client initialization.
// When Azure AD is not configured (dev / running behind the APAC shell),
// echo the upstream X-Forwarded-User so the page renders the shell-provided identity.
app.get("/auth-config", (req, res) => {
  const forwarded = (req.headers["x-forwarded-user"] || "").toString().trim();
  const devName = forwarded || "Developer";
  res.json({
    clientId: config.azure.clientId,
    tenantId: config.azure.tenantId,
    devUser: {
      name: devName,
      username: forwarded ? `${forwarded}@local` : "dev@local",
    },
  });
});

// Public — readiness probe polled by the APAC shell launcher.
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Single-mission endpoint (backward compatibility)
app.post("/chat", requireAuth, async (req, res) => {
  const { input, mission_id } = req.body;

  if (!input || !input.trim()) {
    return res.status(400).json({ error: "Missing input text" });
  }

  try {
    const missionId = mission_id || config.matcha.missions.decomposer;
    const outputText = await callMission(missionId, input);
    res.json({ status: "completed", outputText });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Pipeline endpoint — chains 4 missions with SSE progress
app.post("/pipeline", requireAuth, async (req, res) => {
  const { input } = req.body || {};

  if (!input || !input.trim()) {
    return res.status(400).json({ error: "Missing input text" });
  }

  await executePipeline(input, res);
});

// ---- START ----

// Bind to loopback only — child apps are unreachable from the LAN; only the
// APAC shell process on the same machine can proxy traffic to us.
app.listen(config.port, "127.0.0.1", () => {
  console.log(
    `Test Script Generator running at http://127.0.0.1:${config.port}`
  );
});
