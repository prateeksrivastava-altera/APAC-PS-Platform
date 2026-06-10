const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PACKAGE_JSON = require(path.join(ROOT, "package.json"));
const PUBLIC_DIR = path.join(ROOT, "public");
const TRAINING_BUNDLED_ROOT = path.join(ROOT, "APAC_AI_Training_Platform", "Website");
const TRAINING_PERSISTENT_ROOT =
  process.env.TRAINING_DATA_ROOT || path.join(path.sep, "home", "data", "altera-apac-ps-hub");
const TRAINING_ROOT = fs.existsSync(TRAINING_PERSISTENT_ROOT) ? TRAINING_PERSISTENT_ROOT : TRAINING_BUNDLED_ROOT;
const TRAINING_RESOURCES_DIR = path.join(TRAINING_ROOT, "resources");
const TRAINING_VIDEOS_DIR = path.join(TRAINING_RESOURCES_DIR, "videos");
const TRAINING_DOCS_DIR = path.join(TRAINING_RESOURCES_DIR, "documents");
const TRAINING_USERS_FILE = path.join(TRAINING_ROOT, "users.json");
const TRAINING_TEMPLATES_DIR = path.join(TRAINING_ROOT, "trainings");
const TRAINING_BUNDLED_RESOURCES_DIR = path.join(TRAINING_BUNDLED_ROOT, "resources");
const TRAINING_BUNDLED_VIDEOS_DIR = path.join(TRAINING_BUNDLED_RESOURCES_DIR, "videos");
const TRAINING_BUNDLED_DOCS_DIR = path.join(TRAINING_BUNDLED_RESOURCES_DIR, "documents");
const TRAINING_BUNDLED_USERS_FILE = path.join(TRAINING_BUNDLED_ROOT, "users.json");
const TRAINING_BUNDLED_TEMPLATES_DIR = path.join(TRAINING_BUNDLED_ROOT, "trainings");
const PERSONA_PATH = path.join(ROOT, "persona_improved.md");
const MATCHA_BASE_URL = process.env.MATCHA_BASE_URL || "https://matcha.harriscomputer.com/rest/api/v1";
const TRAINING_MATCHA_BASE_URL = "https://matcha.harriscomputer.com";
const MATCHA_MISSION_ID = process.env.MATCHA_MISSION_ID || "1920";
const MATCHA_WORKSPACE_ID = process.env.MATCHA_WORKSPACE_ID || "-1";
const MATCHA_API_KEY = process.env.MATCHA_API_KEY || "";
const ALLOWED_TENANT_ID = process.env.ALLOWED_TENANT_ID || "";
const TRAINING_MATCHA_MODEL = process.env.MATCHA_MODEL || "gpt-4.1";
const APP_VERSION = PACKAGE_JSON.version || "0.0.0";

app.disable("x-powered-by");
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyDirContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  ensureDir(targetDir);
  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach(function (entry) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirContents(sourcePath, targetPath);
      return;
    }

    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  });
}

function initializeTrainingStorage() {
  ensureDir(TRAINING_ROOT);
  ensureDir(TRAINING_RESOURCES_DIR);
  ensureDir(TRAINING_VIDEOS_DIR);
  ensureDir(TRAINING_DOCS_DIR);
  ensureDir(TRAINING_TEMPLATES_DIR);

  if (TRAINING_ROOT === TRAINING_PERSISTENT_ROOT) {
    copyDirContents(TRAINING_BUNDLED_VIDEOS_DIR, TRAINING_VIDEOS_DIR);
    copyDirContents(TRAINING_BUNDLED_DOCS_DIR, TRAINING_DOCS_DIR);
    copyDirContents(TRAINING_BUNDLED_TEMPLATES_DIR, TRAINING_TEMPLATES_DIR);

    if (!fs.existsSync(TRAINING_USERS_FILE)) {
      if (fs.existsSync(TRAINING_BUNDLED_USERS_FILE)) {
        fs.copyFileSync(TRAINING_BUNDLED_USERS_FILE, TRAINING_USERS_FILE);
      } else {
        fs.writeFileSync(TRAINING_USERS_FILE, "[]");
      }
    }

    return;
  }

  if (!fs.existsSync(TRAINING_USERS_FILE)) {
    fs.writeFileSync(TRAINING_USERS_FILE, "[]");
  }
}

initializeTrainingStorage();

function noCache(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

function readPersona() {
  try {
    return fs.readFileSync(PERSONA_PATH, "utf8");
  } catch {
    return "";
  }
}

function normalizeChatMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(function (item) {
        if (!item || typeof item !== "object") {
          return "";
        }

        if (typeof item.text === "string") {
          return item.text;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  if (content && typeof content === "object") {
    if (typeof content.text === "string") {
      return content.text;
    }

    // Preserve supported multimodal objects such as image_url payloads.
    return content;
  }

  return "";
}

function normalizeChatHistoryMessages(chatHistory) {
  return chatHistory
    .map(function (message) {
      const role = message?.role === "assistant" ? "assistant" : "user";
      const content = normalizeChatMessageContent(message?.content);

      if (!content) {
        return null;
      }

      return {
        role,
        content
      };
    })
    .filter(Boolean);
}

function encodeUser(user) {
  if (!user) {
    return null;
  }

  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    tenantId: user.tenantId,
    roles: user.roles || []
  };
}

function decodeClientPrincipal(headerValue) {
  if (!headerValue) {
    return null;
  }

  try {
    const json = Buffer.from(String(headerValue), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function userFromPrincipal(principal) {
  if (!principal?.userId) {
    return null;
  }

  const claims = Array.isArray(principal.claims) ? principal.claims : [];
  const claimValue = function (type) {
    const claim = claims.find((item) => item?.typ === type);
    return claim?.val || "";
  };

  const tenantId =
    claimValue("http://schemas.microsoft.com/identity/claims/tenantid") ||
    claimValue("tid");

  if (ALLOWED_TENANT_ID && tenantId && tenantId !== ALLOWED_TENANT_ID) {
    return {
      denied: true,
      tenantId
    };
  }

  return {
    userId: principal.userId,
    name: claimValue("name") || principal.userDetails || "Authenticated User",
    email: principal.userDetails || claimValue("preferred_username") || "",
    tenantId,
    roles: Array.isArray(principal.userRoles) ? principal.userRoles : []
  };
}

function getRequestUser(req) {
  if (String(process.env.DEV_BYPASS_AUTH || "").toLowerCase() === "true") {
    return {
      userId: "dev-user",
      name: process.env.DEV_USER_NAME || "Development User",
      email: process.env.DEV_USER_EMAIL || "dev@example.com",
      tenantId: "dev-tenant",
      roles: ["developer"]
    };
  }

  const principal = decodeClientPrincipal(req.headers["x-ms-client-principal"]);
  return userFromPrincipal(principal);
}

function requireHubAuth(req, res) {
  const user = getRequestUser(req);
  if (user?.denied) {
    res.status(403).json({ error: "User is not in the allowed tenant." });
    return null;
  }

  if (user) {
    return user;
  }

  return {
    userId: "guest-user",
    name: "Guest User",
    email: "",
    tenantId: "",
    roles: ["guest"]
  };
}

function matchaHeaders() {
  return {
    "Content-Type": "application/json",
    "MATCHA-API-KEY": MATCHA_API_KEY
  };
}

app.get("/auth.js", function (req, res) {
  noCache(res);
  res.type("application/javascript").sendFile(path.join(ROOT, "auth.js"));
});

app.use(
  express.static(PUBLIC_DIR, {
    etag: false,
    lastModified: false,
    setHeaders: noCache
  })
);

app.get("/", function (req, res) {
  noCache(res);
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/api/health", function (req, res) {
  const user = getRequestUser(req);
  res.json({
    ok: true,
    appVersion: APP_VERSION,
    hasMatchaKey: Boolean(MATCHA_API_KEY),
    missionId: MATCHA_MISSION_ID,
    workspaceId: MATCHA_WORKSPACE_ID,
    authenticated: Boolean(user && !user.denied),
    trainingMounted: true
  });
});

app.get("/api/me", function (req, res) {
  const user = getRequestUser(req);
  if (!user || user.denied) {
    return res.json({
      authenticated: false,
      user: null
    });
  }

  return res.json({
    authenticated: true,
    user: encodeUser(user)
  });
});

app.get("/api/mission", async function (req, res) {
  const user = requireHubAuth(req, res);
  if (!user) {
    return;
  }

  if (!MATCHA_API_KEY) {
    return res.status(500).json({ error: "MATCHA_API_KEY is not configured." });
  }

  const url =
    MATCHA_BASE_URL +
    "/missions?select=id,name,description,workspace_id&workspace_id=" +
    encodeURIComponent(MATCHA_WORKSPACE_ID) +
    "&id=" +
    encodeURIComponent(MATCHA_MISSION_ID);

  try {
    const response = await fetch(url, {
      headers: {
        "MATCHA-API-KEY": MATCHA_API_KEY
      }
    });

    const payload = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Matcha API error " + response.status + " " + response.statusText + ": " + payload
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      parsed = payload;
    }

    const mission = Array.isArray(parsed) ? parsed[0] || null : parsed;
    return res.json({
      missionId: MATCHA_MISSION_ID,
      workspaceId: MATCHA_WORKSPACE_ID,
      lookupResult: mission ? "Mission returned by workspace-filtered lookup" : "Not returned by mission listing",
      mission
    });
  } catch (error) {
    return res.status(500).json({ error: "Mission lookup failed: " + error.message });
  }
});

app.post("/api/chat", async function (req, res) {
  const user = requireHubAuth(req, res);
  if (!user) {
    return;
  }

  if (!MATCHA_API_KEY) {
    return res.status(500).json({ error: "MATCHA_API_KEY is not configured." });
  }

  const prompt = String(req.body?.prompt || "").trim();
  const chatHistory = Array.isArray(req.body?.chatHistory) ? req.body.chatHistory : [];
  const screenshots = Array.isArray(req.body?.screenshots) ? req.body.screenshots : [];

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  const messages = normalizeChatHistoryMessages(chatHistory);
  messages.push({
    role: "user",
    content: prompt
  });

  screenshots.forEach(function (item) {
    const dataUrl = String(item?.dataUrl || "");
    if (!dataUrl.startsWith("data:image/")) {
      return;
    }

    messages.push({
      role: "user",
      content: {
        type: "image_url",
        image_url: {
          url: dataUrl
        }
      }
    });
  });

  try {
    const response = await fetch(MATCHA_BASE_URL + "/completions", {
      method: "POST",
      headers: matchaHeaders(),
      body: JSON.stringify({
        mission_id: Number(MATCHA_MISSION_ID),
        messages,
        context: readPersona() || undefined
      })
    });

    const payloadText = await response.text();
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      payload = { raw: payloadText };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          "Matcha API error " +
          response.status +
          " " +
          response.statusText +
          ": " +
          payloadText
      });
    }

    const text =
      payload?.output?.[0]?.content?.[0]?.text ||
      payload?.choices?.[0]?.message?.content ||
      "";

    return res.json({
      text,
      raw: payload,
      user: encodeUser(user)
    });
  } catch (error) {
    return res.status(500).json({ error: "Chat request failed: " + error.message });
  }
});

function safeFileName(original) {
  return path.basename(String(original || "")).replace(/[^\w.\- ]+/g, "_");
}

function uniqueFileName(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = name;
  let counter = 1;

  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = base + "-" + Date.now() + "-" + counter + ext;
    counter += 1;
  }

  return candidate;
}

function makeStorage(targetDir) {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, targetDir);
    },
    filename: function (req, file, cb) {
      const fileName = uniqueFileName(targetDir, safeFileName(file.originalname));
      cb(null, fileName);
    }
  });
}

const trainingVideoUpload = multer({
  storage: makeStorage(TRAINING_VIDEOS_DIR),
  fileFilter: function (req, file, cb) {
    if (file.mimetype && file.mimetype.startsWith("video/")) {
      return cb(null, true);
    }

    return cb(new Error("Only video files are allowed."));
  }
});

const trainingDocumentUpload = multer({
  storage: makeStorage(TRAINING_DOCS_DIR),
  fileFilter: function (req, file, cb) {
    if (file.mimetype === "application/pdf") {
      return cb(null, true);
    }

    return cb(new Error("Only PDF files are allowed."));
  }
});

function slugify(value) {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "training-" + Date.now()
  );
}

function listTrainingFiles() {
  return fs.readdirSync(TRAINING_TEMPLATES_DIR).filter(function (file) {
    return file.toLowerCase().endsWith(".json");
  });
}

function readTrainingTemplatesFromDisk() {
  const templates = {};
  listTrainingFiles().forEach(function (file) {
    try {
      const raw = fs.readFileSync(path.join(TRAINING_TEMPLATES_DIR, file), "utf8");
      const data = JSON.parse(raw || "{}");
      if (!data?.role) {
        return;
      }

      if (!templates[data.role]) {
        templates[data.role] = [];
      }
      templates[data.role].push(data);
    } catch {
      // Ignore malformed template files.
    }
  });
  return templates;
}

function writeTrainingTemplatesToDisk(templates) {
  const keep = new Set();

  Object.keys(templates || {}).forEach(function (role) {
    (templates[role] || []).forEach(function (training) {
      const id = training.id || slugify(role + "-" + training.name);
      const fileName = safeFileName(id + ".json");
      const filePath = path.join(TRAINING_TEMPLATES_DIR, fileName);
      const payload = Object.assign({}, training, { id, role });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
      keep.add(fileName.toLowerCase());
    });
  });

  listTrainingFiles().forEach(function (file) {
    if (!keep.has(file.toLowerCase())) {
      fs.unlinkSync(path.join(TRAINING_TEMPLATES_DIR, file));
    }
  });
}

function readTrainingUsers() {
  try {
    return JSON.parse(fs.readFileSync(TRAINING_USERS_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeTrainingUsers(users) {
  fs.writeFileSync(TRAINING_USERS_FILE, JSON.stringify(users, null, 2));
}

const trainingRouter = express.Router();

trainingRouter.use("/resources", express.static(TRAINING_RESOURCES_DIR, { etag: false, lastModified: false }));

trainingRouter.get("/", function (req, res) {
  noCache(res);
  res.sendFile(path.join(TRAINING_BUNDLED_ROOT, "index.html"));
});

trainingRouter.get("/api/library/video", function (req, res) {
  fs.readdir(TRAINING_VIDEOS_DIR, function (error, files) {
    if (error) {
      return res.status(500).json([]);
    }

    return res.json(files.filter(function (file) {
      return !file.startsWith(".");
    }));
  });
});

trainingRouter.get("/api/library/document", function (req, res) {
  fs.readdir(TRAINING_DOCS_DIR, function (error, files) {
    if (error) {
      return res.status(500).json([]);
    }

    return res.json(
      files.filter(function (file) {
        return file.toLowerCase().endsWith(".pdf");
      })
    );
  });
});

trainingRouter.post("/api/upload/video", trainingVideoUpload.single("file"), function (req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }

  return res.json({ fileName: req.file.filename });
});

trainingRouter.post("/api/upload/document", trainingDocumentUpload.single("file"), function (req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }

  return res.json({ fileName: req.file.filename });
});

trainingRouter.get("/api/templates", function (req, res) {
  return res.json(readTrainingTemplatesFromDisk());
});

trainingRouter.put("/api/templates", function (req, res) {
  const templates = req.body && typeof req.body === "object" ? req.body : {};
  writeTrainingTemplatesToDisk(templates);
  return res.json(templates);
});

trainingRouter.get("/api/users", function (req, res) {
  return res.json(readTrainingUsers());
});

trainingRouter.post("/api/users", function (req, res) {
  const users = readTrainingUsers();
  const user = req.body || {};
  if (!user.employeeId) {
    return res.status(400).json({ error: "Missing employeeId" });
  }
  if (users.some(function (item) { return item.employeeId === user.employeeId; })) {
    return res.status(409).json({ error: "Employee ID exists" });
  }

  users.push(user);
  writeTrainingUsers(users);
  return res.json(user);
});

trainingRouter.put("/api/users/:id", function (req, res) {
  const users = readTrainingUsers();
  const index = users.findIndex(function (item) {
    return item.employeeId === req.params.id;
  });

  if (index === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  users[index] = req.body || users[index];
  writeTrainingUsers(users);
  return res.json(users[index]);
});

trainingRouter.delete("/api/users/:id", function (req, res) {
  const users = readTrainingUsers();
  const nextUsers = users.filter(function (item) {
    return item.employeeId !== req.params.id;
  });

  if (nextUsers.length === users.length) {
    return res.status(404).json({ error: "User not found" });
  }

  writeTrainingUsers(nextUsers);
  return res.json({ ok: true });
});

trainingRouter.get("/api/matcha/missions", async function (req, res) {
  if (!MATCHA_API_KEY) {
    return res.status(500).json({ error: "MATCHA_API_KEY not set" });
  }

  try {
    const response = await fetch(TRAINING_MATCHA_BASE_URL + "/rest/api/v1/missions", {
      headers: {
        "MATCHA-API-KEY": MATCHA_API_KEY
      }
    });

    const payload = await response.text();
    if (!response.ok) {
      return res.status(500).json({ error: "Matcha missions request failed", details: payload });
    }

    return res.json(JSON.parse(payload));
  } catch (error) {
    return res.status(500).json({ error: "Matcha missions request failed", details: error.message });
  }
});

trainingRouter.get("/api/matcha/folders", async function (req, res) {
  if (!MATCHA_API_KEY) {
    return res.status(500).json({ error: "MATCHA_API_KEY not set" });
  }

  if (!req.query.missionId) {
    return res.status(400).json({ error: "Missing missionId" });
  }

  try {
    const response = await fetch(
      TRAINING_MATCHA_BASE_URL +
        "/rest/api/v1/folders?mission_id=" +
        encodeURIComponent(req.query.missionId),
      {
        headers: {
          "MATCHA-API-KEY": MATCHA_API_KEY
        }
      }
    );

    const payload = await response.text();
    if (!response.ok) {
      return res.status(500).json({ error: "Matcha folders request failed", details: payload });
    }

    return res.json(JSON.parse(payload));
  } catch (error) {
    return res.status(500).json({ error: "Matcha folders request failed", details: error.message });
  }
});

trainingRouter.post("/api/matcha/preload-docs", async function (req, res) {
  if (!MATCHA_API_KEY) {
    return res.status(500).json({ error: "MATCHA_API_KEY not set" });
  }

  const folderId = req.body?.folderId;
  const files = Array.isArray(req.body?.files) ? req.body.files.filter(Boolean) : [];
  if (!folderId || !files.length) {
    return res.status(400).json({ error: "Missing folderId or files" });
  }

  try {
    const listResponse = await fetch(
      TRAINING_MATCHA_BASE_URL + "/rest/api/v1/files?folder_id=" + encodeURIComponent(folderId),
      {
        headers: {
          "MATCHA-API-KEY": MATCHA_API_KEY
        }
      }
    );
    const listData = listResponse.ok ? await listResponse.json() : [];
    const existingNames = new Set(
      Array.isArray(listData)
        ? listData.map(function (file) { return String(file.filename || file.name || ""); }).filter(Boolean)
        : []
    );

    const uploaded = [];
    const skipped = [];
    const failed = [];

    for (const fileName of files) {
      if (existingNames.has(fileName)) {
        skipped.push(fileName);
        continue;
      }

      const docPath = path.join(TRAINING_DOCS_DIR, fileName);
      if (!fs.existsSync(docPath)) {
        failed.push({ fileName, error: "File not found on server." });
        continue;
      }

      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(docPath)]), fileName);
      let uploadResponse = await fetch(
        TRAINING_MATCHA_BASE_URL + "/rest/api/v1/file?folder_id=" + encodeURIComponent(folderId),
        {
          method: "POST",
          headers: {
            "MATCHA-API-KEY": MATCHA_API_KEY,
            Authorization: "Bearer " + MATCHA_API_KEY,
            "x-api-key": MATCHA_API_KEY
          },
          body: form
        }
      );

      if (!uploadResponse.ok && uploadResponse.status === 404) {
        uploadResponse = await fetch(
          TRAINING_MATCHA_BASE_URL + "/rest/api/v1/upload?folder_id=" + encodeURIComponent(folderId),
          {
            method: "POST",
            headers: {
              "MATCHA-API-KEY": MATCHA_API_KEY,
              Authorization: "Bearer " + MATCHA_API_KEY,
              "x-api-key": MATCHA_API_KEY
            },
            body: form
          }
        );
      }

      if (!uploadResponse.ok) {
        failed.push({
          fileName,
          error: await uploadResponse.text()
        });
        continue;
      }

      uploaded.push(fileName);
    }

    return res.json({ uploaded, skipped, failed });
  } catch (error) {
    return res.status(500).json({ error: "Matcha preload failed", details: error.message });
  }
});

trainingRouter.post("/api/matcha/chat", async function (req, res) {
  if (!MATCHA_API_KEY) {
    return res.status(500).json({ error: "MATCHA_API_KEY not set" });
  }

  const payload = req.body || {};
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const userContext = payload.userContext || {};
  const missionId = payload.missionId || "";
  if (!missionId) {
    return res.status(400).json({ error: "Missing missionId" });
  }

  const systemContent = [
    "You are Matcha AI mentor for APAC AI Training Programs.",
    "User: " + (userContext.name || "Unknown") + " (" + (userContext.employeeId || "N/A") + ")",
    "Role: " + (userContext.role || "N/A") + " | Title: " + (userContext.title || "N/A"),
    "Training: " + (userContext.trainingName || "N/A"),
    "Phase: " + (userContext.phaseName || "N/A") + " | Activity: " + (userContext.activityLabel || "N/A"),
    payload.document?.fileName ? "Document context: " + payload.document.fileName : ""
  ]
    .filter(Boolean)
    .join("\n");

  const openAiLikeBody = {
    model: TRAINING_MATCHA_MODEL,
    messages: [{ role: "system", content: systemContent }].concat(messages)
  };

  try {
    let uploadedFileId = "";
    let folderId = payload.document?.folderId || "";
    let fileStatus = "";

    if (payload.document?.fileName && folderId) {
      const docPath = path.join(TRAINING_DOCS_DIR, payload.document.fileName);
      if (fs.existsSync(docPath)) {
        const listResponse = await fetch(
          TRAINING_MATCHA_BASE_URL + "/rest/api/v1/files?folder_id=" + encodeURIComponent(folderId),
          {
            headers: {
              "MATCHA-API-KEY": MATCHA_API_KEY
            }
          }
        );

        if (listResponse.ok) {
          const listData = await listResponse.json();
          if (Array.isArray(listData)) {
            const existing = listData.find(function (file) {
              return String(file.filename || file.name) === payload.document.fileName;
            });

            if (existing) {
              uploadedFileId = existing.id || existing.file_id || existing.fileId || "";
              fileStatus = String(existing.status || existing.file_status || existing.state || "").toLowerCase();
            }
          }
        }

        if (!uploadedFileId) {
          const form = new FormData();
          form.append("file", new Blob([fs.readFileSync(docPath)]), payload.document.fileName);

          let uploadResponse = await fetch(
            TRAINING_MATCHA_BASE_URL + "/rest/api/v1/file?folder_id=" + encodeURIComponent(folderId),
            {
              method: "POST",
              headers: {
                "MATCHA-API-KEY": MATCHA_API_KEY,
                Authorization: "Bearer " + MATCHA_API_KEY,
                "x-api-key": MATCHA_API_KEY
              },
              body: form
            }
          );

          if (!uploadResponse.ok && uploadResponse.status === 404) {
            uploadResponse = await fetch(
              TRAINING_MATCHA_BASE_URL + "/rest/api/v1/upload?folder_id=" + encodeURIComponent(folderId),
              {
                method: "POST",
                headers: {
                  "MATCHA-API-KEY": MATCHA_API_KEY,
                  Authorization: "Bearer " + MATCHA_API_KEY,
                  "x-api-key": MATCHA_API_KEY
                },
                body: form
              }
            );
          }

          if (!uploadResponse.ok) {
            return res.status(500).json({
              error: "Matcha file upload failed",
              details: await uploadResponse.text()
            });
          }

          const uploadData = await uploadResponse.json();
          uploadedFileId = uploadData.id || uploadData.file_id || uploadData.fileId || "";
        }
      }
    }

    if (uploadedFileId && ["pending", "processing", "indexing", "uploading", "queued"].includes(fileStatus)) {
      return res.json({
        content: "I am still uploading/indexing the document. Please wait a moment and try again.",
        raw: { status: fileStatus || "pending" }
      });
    }

    if (uploadedFileId) {
      const lastUser = messages.slice().reverse().find(function (item) {
        return item.role === "user";
      });
      const userIndex = lastUser ? messages.lastIndexOf(lastUser) : -1;
      const chatHistory = userIndex >= 0 ? messages.slice(0, userIndex) : messages;
      const response = await fetch(TRAINING_MATCHA_BASE_URL + "/rest/api/v1/completions", {
        method: "POST",
        headers: matchaHeaders(),
        body: JSON.stringify({
          mission_id: Number(missionId),
          input: lastUser ? lastUser.content : "",
          context: systemContent,
          chat_history: chatHistory,
          includeCompleteDocuments: true,
          filesToInclude: [uploadedFileId],
          folder_id: Number(folderId)
        })
      });

      const payloadText = await response.text();
      if (!response.ok) {
        return res.status(500).json({ error: "Matcha request failed", details: payloadText });
      }

      const payloadJson = JSON.parse(payloadText);
      return res.json({
        content: payloadJson?.output?.[0]?.content?.[0]?.text || "",
        raw: payloadJson
      });
    }

    const response = await fetch(
      TRAINING_MATCHA_BASE_URL + "/rest/api/mission_" + missionId + "/openai/v1/chat/completions/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MATCHA-API-KEY": MATCHA_API_KEY,
          Authorization: "Bearer " + MATCHA_API_KEY,
          "x-api-key": MATCHA_API_KEY
        },
        body: JSON.stringify(openAiLikeBody)
      }
    );

    const payloadText = await response.text();
    if (!response.ok) {
      return res.status(500).json({ error: "Matcha request failed", details: payloadText });
    }

    const payloadJson = JSON.parse(payloadText);
    return res.json({
      content: payloadJson?.choices?.[0]?.message?.content || "",
      raw: payloadJson
    });
  } catch (error) {
    return res.status(500).json({ error: "Matcha request failed", details: error.message });
  }
});

trainingRouter.use(function (error, req, res, next) {
  return res.status(400).json({ error: error.message || "Upload error" });
});

app.use("/training-platform", trainingRouter);

app.listen(PORT, function () {
  console.log("APAC PS Application Hub running on http://localhost:" + PORT);
});
