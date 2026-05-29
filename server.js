#!/usr/bin/env node

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.MATCHA_BASE_URL || "https://matcha.harriscomputer.com/rest/api/v1";
const MATCHA_API_KEY = process.env.MATCHA_API_KEY || "";
const MISSION_ID = Number(process.env.MATCHA_MISSION_ID || 1920);
const WORKSPACE_ID = Number(process.env.MATCHA_WORKSPACE_ID || -1);
const PERSONA_PATH = process.env.MATCHA_PERSONA_PATH || path.join(__dirname, "persona_improved.md");
const DEV_BYPASS_AUTH = String(process.env.DEV_BYPASS_AUTH || "").toLowerCase() === "true";
const DEV_USER_NAME = process.env.DEV_USER_NAME || "Local Developer";
const DEV_USER_EMAIL = process.env.DEV_USER_EMAIL || "developer@example.com";
const ALLOWED_TENANT_ID = process.env.ALLOWED_TENANT_ID || "";
const STATIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function readPersona() {
  try {
    return fs.readFileSync(PERSONA_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseClientPrincipal(req) {
  const principalHeader = req.headers["x-ms-client-principal"];
  if (!principalHeader) {
    return null;
  }

  try {
    const decoded = Buffer.from(String(principalHeader), "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function getClaimValue(principal, claimName) {
  const claims = principal?.claims || [];
  const match = claims.find((claim) => claim.typ === claimName);
  return match ? String(match.val || "") : "";
}

function buildUserFromPrincipal(principal) {
  if (!principal?.userId) {
    return null;
  }

  return {
    isAuthenticated: true,
    userId: principal.userId,
    userDetails: principal.userDetails || "",
    displayName:
      getClaimValue(principal, "name") ||
      getClaimValue(principal, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name") ||
      principal.userDetails ||
      "Authenticated User",
    identityProvider: principal.identityProvider || "aad",
    roles: Array.isArray(principal.userRoles) ? principal.userRoles : [],
    claims: Array.isArray(principal.claims) ? principal.claims : [],
    tenantId:
      getClaimValue(principal, "tid") ||
      getClaimValue(principal, "http://schemas.microsoft.com/identity/claims/tenantid"),
  };
}

function getCurrentUser(req) {
  if (DEV_BYPASS_AUTH) {
    return {
      isAuthenticated: true,
      userId: "dev-user",
      userDetails: DEV_USER_EMAIL,
      displayName: DEV_USER_NAME,
      identityProvider: "development",
      roles: ["anonymous", "authenticated"],
      claims: [],
      tenantId: "",
    };
  }

  return buildUserFromPrincipal(parseClientPrincipal(req));
}

function requireAuth(req, res) {
  const user = getCurrentUser(req);
  if (!user?.isAuthenticated) {
    sendJson(res, 401, {
      error: "Authentication required.",
      loginUrl: "/.auth/login/aad?post_login_redirect_uri=/",
    });
    return null;
  }

  if (ALLOWED_TENANT_ID && user.tenantId && user.tenantId !== ALLOWED_TENANT_ID) {
    sendJson(res, 403, {
      error: "Authenticated user is not from the allowed Microsoft Entra tenant.",
    });
    return null;
  }

  return user;
}

async function matchaRequest(url, options) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let payload;

  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    throw new Error(
      `Matcha API error ${response.status} ${response.statusText}: ${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`
    );
  }

  return payload;
}

async function fetchMission() {
  const url = new URL(`${BASE_URL}/missions`);
  url.searchParams.set(
    "select",
    "id,workspace_id,workspace_name,name,description,syscontext,mission_blurb,updated_at"
  );
  url.searchParams.set("workspace_id", String(WORKSPACE_ID));

  const missions = await matchaRequest(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "MATCHA-API-KEY": MATCHA_API_KEY,
    },
  });

  return Array.isArray(missions)
    ? missions.find((mission) => Number(mission.id) === MISSION_ID) || null
    : null;
}

function extractOutputText(payload) {
  if (!payload || !Array.isArray(payload.output)) {
    return "";
  }

  const parts = [];
  for (const message of payload.output) {
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const item of message.content) {
      if (item.type === "output_text" && item.text) {
        parts.push(item.text);
      }
    }
  }

  return parts.join("\n\n").trim();
}

async function handleApiMe(req, res) {
  const user = getCurrentUser(req);
  sendJson(res, 200, {
    authenticated: Boolean(user?.isAuthenticated),
    user: user || null,
    authMode: DEV_BYPASS_AUTH ? "development-bypass" : "azure-easy-auth",
  });
}

async function handleApiHealth(req, res) {
  sendJson(res, 200, {
    ok: true,
    node: process.version,
    missionId: MISSION_ID,
    workspaceId: WORKSPACE_ID,
    hasMatchaKey: Boolean(MATCHA_API_KEY),
    authMode: DEV_BYPASS_AUTH ? "development-bypass" : "azure-easy-auth",
  });
}

async function handleApiMission(req, res) {
  const user = requireAuth(req, res);
  if (!user) {
    return;
  }

  if (!MATCHA_API_KEY) {
    sendJson(res, 500, { error: "MATCHA_API_KEY is not configured." });
    return;
  }

  try {
    const mission = await fetchMission();
    sendJson(res, 200, {
      missionId: MISSION_ID,
      workspaceId: WORKSPACE_ID,
      found: Boolean(mission),
      mission,
      note: mission
        ? ""
        : "Mission was not returned by the workspace-filtered list. Completion may still work with the mission ID.",
    });
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
}

async function handleApiChat(req, res) {
  const user = requireAuth(req, res);
  if (!user) {
    return;
  }

  if (!MATCHA_API_KEY) {
    sendJson(res, 500, { error: "MATCHA_API_KEY is not configured." });
    return;
  }

  try {
    const raw = await readRequestBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const prompt = String(body.prompt || "").trim();
    const chatHistory = Array.isArray(body.chatHistory) ? body.chatHistory : [];

    if (!prompt) {
      sendJson(res, 400, { error: "Prompt is required." });
      return;
    }

    const payload = await matchaRequest(`${BASE_URL}/completions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "MATCHA-API-KEY": MATCHA_API_KEY,
      },
      body: JSON.stringify({
        mission_id: MISSION_ID,
        input: prompt,
        context: readPersona() || undefined,
        chat_history: chatHistory.length ? chatHistory : undefined,
      }),
    });

    sendJson(res, 200, {
      text: extractOutputText(payload),
      raw: payload,
      user: {
        displayName: user.displayName,
        userDetails: user.userDetails,
      },
    });
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
}

function safeJoinStatic(requestPath) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const resolved = path.normalize(path.join(STATIC_DIR, normalized));
  if (!resolved.startsWith(STATIC_DIR)) {
    return null;
  }
  return resolved;
}

async function handleStatic(req, res, pathname) {
  const filePath = safeJoinStatic(pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      return handleStatic(req, res, path.join(pathname, "index.html"));
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = await fs.promises.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = requestUrl;

  if (req.method === "GET" && pathname === "/api/health") {
    return handleApiHealth(req, res);
  }

  if (req.method === "GET" && pathname === "/api/me") {
    return handleApiMe(req, res);
  }

  if (req.method === "GET" && pathname === "/api/mission") {
    return handleApiMission(req, res);
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    return handleApiChat(req, res);
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return handleStatic(req, res, pathname);
  }

  return sendText(res, 405, "Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
