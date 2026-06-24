const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const { Readable } = require("stream");
const JSZip = require("jszip");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

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
const TRAINING_USERS_DIR = path.join(TRAINING_ROOT, "users");
const TRAINING_TEMPLATES_DIR = path.join(TRAINING_ROOT, "trainings");
const HUB_DATA_ROOT =
  process.env.HUB_DATA_ROOT ||
  (fs.existsSync(TRAINING_PERSISTENT_ROOT) ? TRAINING_PERSISTENT_ROOT : path.join(ROOT, ".tmp", "hub-data"));
const HUB_REQUESTS_FILE = path.join(HUB_DATA_ROOT, "hub-requests.json");
const HUB_ACCESS_FILE = path.join(HUB_DATA_ROOT, "hub-access.json");
const TRAINING_BUNDLED_RESOURCES_DIR = path.join(TRAINING_BUNDLED_ROOT, "resources");
const TRAINING_BUNDLED_VIDEOS_DIR = path.join(TRAINING_BUNDLED_RESOURCES_DIR, "videos");
const TRAINING_BUNDLED_DOCS_DIR = path.join(TRAINING_BUNDLED_RESOURCES_DIR, "documents");
const TRAINING_BUNDLED_TEMPLATES_DIR = path.join(TRAINING_BUNDLED_ROOT, "trainings");
const PERSONA_PATH = path.join(ROOT, "persona_improved.md");
const TEST_SCRIPT_APP_DIR = path.join(ROOT, "Test_Script_and_WBS", "sm-test-script-builder");
const TEST_SCRIPT_APP_BASE_PATH = "/test-script-builder";
const TEST_SCRIPT_APP_PORT = Number(process.env.TEST_SCRIPT_APP_PORT || 3210);
const INTEGRATION_TEMPLATE_PATH = path.join(PUBLIC_DIR, "resources", "2026 Integration Design Document.docx");
const INTEGRATION_EXPORTS_DIR = path.join(ROOT, ".tmp", "integration-exports");
const MATCHA_BASE_URL = process.env.MATCHA_BASE_URL || "https://matcha.harriscomputer.com/rest/api/v1";
const TRAINING_MATCHA_BASE_URL = "https://matcha.harriscomputer.com";
const MATCHA_MISSION_ID = process.env.MATCHA_MISSION_ID || "1920";
const INTEGRATION_MATCHA_MISSION_ID = process.env.INTEGRATION_MATCHA_MISSION_ID || "4050";
const MATCHA_WORKSPACE_ID = process.env.MATCHA_WORKSPACE_ID || "-1";
const MATCHA_API_KEY = process.env.MATCHA_API_KEY || "";
const ALLOWED_TENANT_ID = process.env.ALLOWED_TENANT_ID || "";
const TRAINING_MATCHA_MODEL = process.env.MATCHA_MODEL || "gpt-4.1";
const APP_VERSION = PACKAGE_JSON.version || "0.0.0";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XMLNS_BLOCK =
  'xmlns:w="' +
  WORD_NS +
  '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const INTEGRATION_SECTION_ORDER = [
  "Purpose",
  "Scope",
  "Assumptions",
  "Environment",
  "Interface Overview",
  "Source System",
  "Target System",
  "Message / Data Flow",
  "Field Mapping Notes",
  "Scheduling / Triggering",
  "Error Handling",
  "Security / Access",
  "Dependencies",
  "Risks",
  "Open Points",
  "Recommended Next Steps"
];
const TROUBLESHOOTING_KB_FOLDER_BY_PRODUCT = {
  sunrise: "Sunrise Docs and KB",
  opal: "Opal Docs and KB",
  "patient-flow": "Patient Flow Docs and KB"
};
const HUB_REQUEST_ADMIN_EMAIL = "prateek.srivastava@alterahealth.com";
const HUB_REQUEST_STATUS_VALUES = ["New", "WIP", "Closed Completed", "Closed Cancelled"];
const HUB_APP_DEFINITIONS = [
  { id: "troubleshooting-platform", label: "Troubleshooting Platform" },
  { id: "training-platform", label: "Training Platform" },
  { id: "subject-matter-expert", label: "Subject Matter Expert Platform" },
  { id: "integration-sow-platform", label: "SOW to Design" },
  { id: "test-script-builder", label: "Test Script Builder" }
];
const HUB_APP_ID_SET = new Set(
  HUB_APP_DEFINITIONS.map(function (appDefinition) {
    return appDefinition.id;
  })
);

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
  ensureDir(TRAINING_USERS_DIR);

  if (TRAINING_ROOT === TRAINING_PERSISTENT_ROOT) {
    copyDirContents(TRAINING_BUNDLED_VIDEOS_DIR, TRAINING_VIDEOS_DIR);
    copyDirContents(TRAINING_BUNDLED_DOCS_DIR, TRAINING_DOCS_DIR);
    copyDirContents(TRAINING_BUNDLED_TEMPLATES_DIR, TRAINING_TEMPLATES_DIR);

    return;
  }
}

initializeTrainingStorage();
ensureDir(INTEGRATION_EXPORTS_DIR);
ensureDir(HUB_DATA_ROOT);

const childApps = {
  testScriptBuilder: {
    name: "test-script-builder",
    port: TEST_SCRIPT_APP_PORT,
    basePath: TEST_SCRIPT_APP_BASE_PATH,
    cwd: TEST_SCRIPT_APP_DIR,
    child: null,
    starting: null,
  }
};

function noCache(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

function cleanupChildProcess(runtime) {
  if (runtime.child) {
    runtime.child.removeAllListeners();
  }
  runtime.child = null;
  runtime.starting = null;
}

async function waitForChildHealth(runtime, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch("http://127.0.0.1:" + runtime.port + "/health", {
        cache: "no-store"
      });
      if (response.ok) {
        return;
      }
      lastError = new Error("Child health probe returned " + response.status);
    } catch (error) {
      lastError = error;
    }
    await new Promise(function (resolve) {
      setTimeout(resolve, 250);
    });
  }
  throw lastError || new Error("Timed out waiting for child app health.");
}

async function ensureChildApp(runtime) {
  if (!fs.existsSync(runtime.cwd)) {
    throw new Error("Child app folder not found: " + runtime.cwd);
  }

  if (runtime.child && runtime.child.exitCode == null && !runtime.child.killed) {
    return runtime;
  }

  if (runtime.starting) {
    await runtime.starting;
    return runtime;
  }

  runtime.starting = (async function () {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: runtime.cwd,
      env: Object.assign({}, process.env, {
        PORT: String(runtime.port),
      }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    runtime.child = child;

    child.stdout.on("data", function (chunk) {
      process.stdout.write("[test-script-builder] " + String(chunk));
    });
    child.stderr.on("data", function (chunk) {
      process.stderr.write("[test-script-builder] " + String(chunk));
    });
    child.on("exit", function () {
      cleanupChildProcess(runtime);
    });
    child.on("error", function () {
      cleanupChildProcess(runtime);
    });

    try {
      await waitForChildHealth(runtime, 15000);
    } catch (error) {
      try {
        child.kill();
      } catch (_killError) {
        // Ignore child termination errors.
      }
      cleanupChildProcess(runtime);
      throw error;
    } finally {
      runtime.starting = null;
    }
  })();

  await runtime.starting;
  return runtime;
}

function setProxyResponseHeaders(sourceHeaders, res) {
  sourceHeaders.forEach(function (value, key) {
    const lowerKey = String(key || "").toLowerCase();
    if (lowerKey === "content-encoding" || lowerKey === "transfer-encoding" || lowerKey === "connection") {
      return;
    }
    res.setHeader(key, value);
  });
}

async function proxyChildRequest(req, res, runtime, childPath, user) {
  await ensureChildApp(runtime);

  const childUrl = new URL("http://127.0.0.1:" + runtime.port + childPath);
  const headers = new Headers();

  Object.keys(req.headers || {}).forEach(function (key) {
    if (key === "host" || key === "connection" || key === "content-length") {
      return;
    }
    const value = req.headers[key];
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
      return;
    }
    if (typeof value === "string") {
      headers.set(key, value);
    }
  });

  headers.set("x-forwarded-user", String(user && user.name ? user.name : ""));
  headers.set("x-forwarded-email", String(user && user.email ? user.email : ""));
  headers.set("x-forwarded-oid", String(user && user.userId ? user.userId : ""));

  const method = String(req.method || "GET").toUpperCase();
  const fetchOptions = {
    method,
    headers,
    redirect: "manual"
  };

  if (method !== "GET" && method !== "HEAD") {
    fetchOptions.body = req;
    fetchOptions.duplex = "half";
  }

  const response = await fetch(childUrl, fetchOptions);
  res.status(response.status);
  setProxyResponseHeaders(response.headers, res);

  if (!response.body) {
    return res.end();
  }

  Readable.fromWeb(response.body).pipe(res);
}

function getMatchaWriteHeaders() {
  return {
    "MATCHA-API-KEY": MATCHA_API_KEY,
    Authorization: "Bearer " + MATCHA_API_KEY,
    "x-api-key": MATCHA_API_KEY
  };
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

  const email = principal.userDetails || claimValue("preferred_username") || "";
  const rawName = claimValue("name") || "";
  const displayName = rawName || humanizeIdentityName(email) || "Authenticated User";

  return {
    userId: principal.userId,
    name: displayName,
    email,
    tenantId,
    roles: Array.isArray(principal.userRoles) ? principal.userRoles : []
  };
}

function humanizeIdentityName(value) {
  const email = String(value || "").trim().toLowerCase();
  const localPart = email.includes("@") ? email.split("@")[0] : email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ")
    .trim();
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
  const principalUser = userFromPrincipal(principal);
  if (principalUser) {
    return principalUser;
  }

  const fallbackUserId = String(req.headers["x-ms-client-principal-id"] || "").trim();
  if (!fallbackUserId) {
    return null;
  }

  const fallbackEmail = String(req.headers["x-ms-client-principal-name"] || "").trim();
  const fallbackDisplayName = String(req.headers["x-ms-client-principal-display-name"] || "").trim();
  const fallbackTenantId = String(req.headers["x-ms-client-principal-tenant-id"] || "").trim();

  if (ALLOWED_TENANT_ID && fallbackTenantId && fallbackTenantId !== ALLOWED_TENANT_ID) {
    return {
      denied: true,
      tenantId: fallbackTenantId
    };
  }

  return {
    userId: fallbackUserId,
    name: fallbackDisplayName || humanizeIdentityName(fallbackEmail) || "Authenticated User",
    email: fallbackEmail,
    tenantId: fallbackTenantId,
    roles: []
  };
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

  res.status(401).json({ error: "Authentication required." });
  return null;
}

function matchaHeaders() {
  return {
    "Content-Type": "application/json",
    "MATCHA-API-KEY": MATCHA_API_KEY
  };
}

function extractMatchaText(payload) {
  return (
    payload?.output?.[0]?.content?.[0]?.text ||
    payload?.choices?.[0]?.message?.content ||
    ""
  );
}

function buildIntegrationMissionContext(taskType, notes) {
  const taskLabelMap = {
    generate_design_from_sow: "Generate integration design content from signed SOW",
    review_sow_for_gaps: "Review signed SOW for design gaps and missing information",
    refine_existing_design: "Refine an existing integration design approach",
    integration_consultant_sme_chat: "Answer targeted Integration Consultant SME questions",
  };

  const taskLabel = taskLabelMap[taskType] || "Handle APAC integration SME and development request";

  return [
    "You are APAC PS Integration SME & Development assistant.",
    "Mission role: support APAC PS integration scoping, design drafting, design review, and implementation planning.",
    "Current task mode: " + taskLabel + ".",
    "If the current task mode is Integration Consultant SME chat, answer as a practical APAC PS integration SME. Be concise, targeted, and advisory. Do not force a formal design-document structure unless the user explicitly asks for one.",
    "If the request is SOW-to-design, convert the supplied signed SOW content into implementation-ready design draft content.",
    "Separate confirmed information from assumptions and mark unknowns as TBD instead of inventing facts.",
    "Prefer practical APAC PS delivery language over theory.",
    "When generating design content, structure the response so it can be merged into a formal Word template later.",
    "Recommended section order for design drafting: Purpose, Scope, Assumptions, Environment, Interface Overview, Source System, Target System, Field/Data Flow, Error Handling, Security, Scheduling/Triggering, Dependencies, Risks, Open Points, Recommended Next Steps.",
    "If the user asks for another integration SME task, answer only for that task and do not force the design structure.",
    notes ? "Output notes: " + notes : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeIntegrationHeading(value) {
  return String(value || "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeXmlText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function nodeText(node) {
  if (!node) {
    return "";
  }

  if (node.nodeType === 3) {
    return node.data || "";
  }

  let result = "";
  const children = node.childNodes || [];
  for (let index = 0; index < children.length; index += 1) {
    result += nodeText(children[index]);
  }
  return result;
}

function getWordTextNodes(node, collector) {
  if (!node) {
    return collector;
  }

  if (node.nodeType === 1 && node.nodeName === "w:t") {
    collector.push(node);
  }

  const children = node.childNodes || [];
  for (let index = 0; index < children.length; index += 1) {
    getWordTextNodes(children[index], collector);
  }

  return collector;
}

function setStructuredNodeText(node, value) {
  const textNodes = getWordTextNodes(node, []);
  if (!textNodes.length) {
    return;
  }

  textNodes[0].textContent = String(value || "");
  for (let index = 1; index < textNodes.length; index += 1) {
    textNodes[index].textContent = "";
  }
}

function getSdtAlias(node) {
  const aliases = node.getElementsByTagName("w:alias");
  return aliases.length ? aliases[0].getAttribute("w:val") || "" : "";
}

function getSdtTag(node) {
  const tags = node.getElementsByTagName("w:tag");
  return tags.length ? tags[0].getAttribute("w:val") || "" : "";
}

function replaceStructuredContentByAlias(doc, alias, value) {
  const sdts = doc.getElementsByTagName("w:sdt");
  for (let index = 0; index < sdts.length; index += 1) {
    if (getSdtAlias(sdts[index]) === alias) {
      setStructuredNodeText(sdts[index], value);
    }
  }
}

function replaceStructuredContentByTag(doc, tag, value) {
  const sdts = doc.getElementsByTagName("w:sdt");
  for (let index = 0; index < sdts.length; index += 1) {
    if (getSdtTag(sdts[index]) === tag) {
      setStructuredNodeText(sdts[index], value);
    }
  }
}

function deriveIntegrationMetadata(options) {
  const combined = [
    options?.instruction || "",
    options?.sowText || "",
    options?.generatedText || ""
  ].join("\n");

  function matchFirst(patterns) {
    for (let index = 0; index < patterns.length; index += 1) {
      const match = combined.match(patterns[index]);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return "";
  }

  const projectName =
    matchFirst([
      /(?:^|\n)\s*(?:Project Name|Project|Engagement Name|Engagement)\s*[:\-]\s*(.+)$/im,
      /(?:^|\n)\s*(?:Implementation Name|Workstream)\s*[:\-]\s*(.+)$/im
    ]) ||
    path.basename(String(options?.sowFileName || "Integration Design"), path.extname(String(options?.sowFileName || "")));

  const clientName =
    matchFirst([
      /(?:^|\n)\s*(?:Client Name|Client|Customer|Organisation|Organization)\s*[:\-]\s*(.+)$/im
    ]) || "TBD";

  return {
    title: "Integration Design Document",
    subject: projectName || "Project Name",
    projectName: projectName || "Project Name",
    clientName
  };
}

function parseIntegrationSections(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const sections = [];
  let currentSection = null;

  function startSection(title) {
    currentSection = {
      title,
      items: []
    };
    sections.push(currentSection);
  }

  lines.forEach(function (rawLine) {
    const line = String(rawLine || "").trim();
    if (!line) {
      return;
    }

    const normalized = normalizeIntegrationHeading(line.replace(/:$/, ""));
    const knownHeading = INTEGRATION_SECTION_ORDER.find(function (heading) {
      return normalizeIntegrationHeading(heading) === normalized;
    });

    if (knownHeading) {
      startSection(knownHeading);
      return;
    }

    const markdownHeading = line.match(/^#{1,3}\s+(.+)$/);
    if (markdownHeading) {
      startSection(markdownHeading[1].replace(/:$/, "").trim());
      return;
    }

    if (!currentSection) {
      startSection("Generated Design Draft");
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      currentSection.items.push({ type: "bullet", text: bulletMatch[1].trim() });
      return;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      currentSection.items.push({ type: "number", text: orderedMatch[1].trim() });
      return;
    }

    currentSection.items.push({ type: "paragraph", text: line });
  });

  return sections;
}

function createWordParagraphFragment(text, styleName) {
  const styleXml = styleName ? '<w:pPr><w:pStyle w:val="' + styleName + '" /></w:pPr>' : "";
  return (
    "<w:p " +
    XMLNS_BLOCK +
    ">" +
    styleXml +
    "<w:r><w:t>" +
    escapeXmlText(text) +
    "</w:t></w:r></w:p>"
  );
}

function createWordPageBreakFragment() {
  return "<w:p " + XMLNS_BLOCK + '><w:r><w:br w:type="page" /></w:r></w:p>';
}

function appendWordFragment(doc, parentNode, fragmentXml) {
  const fragmentDoc = new DOMParser().parseFromString(
    "<root " + XMLNS_BLOCK + ">" + fragmentXml + "</root>",
    "text/xml"
  );
  const fragmentRoot = fragmentDoc.documentElement;
  const fragmentChildren = fragmentRoot.childNodes || [];
  for (let index = 0; index < fragmentChildren.length; index += 1) {
    parentNode.appendChild(fragmentChildren[index].cloneNode(true));
  }
}

function ensureSectionPropertiesForTitlePage(doc, finalSectPr, firstTitleSectPr) {
  if (!finalSectPr || !firstTitleSectPr) {
    return;
  }

  const serializer = new XMLSerializer();
  const existingNames = new Set();
  const finalChildren = finalSectPr.childNodes || [];

  for (let index = 0; index < finalChildren.length; index += 1) {
    if (finalChildren[index]?.nodeType === 1) {
      existingNames.add(finalChildren[index].nodeName);
    }
  }

  const titleChildren = firstTitleSectPr.childNodes || [];
  for (let index = 0; index < titleChildren.length; index += 1) {
    const child = titleChildren[index];
    if (!child || child.nodeType !== 1) {
      continue;
    }

    if (child.nodeName === "w:headerReference" || child.nodeName === "w:footerReference" || child.nodeName === "w:titlePg") {
      const type = child.getAttribute("w:type") || "";
      const duplicate = Array.from(finalSectPr.childNodes || []).some(function (existingChild) {
        return (
          existingChild?.nodeType === 1 &&
          existingChild.nodeName === child.nodeName &&
          (existingChild.getAttribute("w:type") || "") === type
        );
      });

      if (!duplicate) {
        appendWordFragment(doc, finalSectPr, serializer.serializeToString(child));
      }
    }
  }
}

async function buildIntegrationTemplateExport(options) {
  if (!fs.existsSync(INTEGRATION_TEMPLATE_PATH)) {
    throw new Error("Integration IDD template not found at public/resources/2026 Integration Design Document.docx");
  }

  const templateBuffer = fs.readFileSync(INTEGRATION_TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentXml = await zip.file("word/document.xml").async("string");
  const doc = new DOMParser().parseFromString(documentXml, "text/xml");
  const serializer = new XMLSerializer();

  const metadata = deriveIntegrationMetadata(options);
  replaceStructuredContentByAlias(doc, "Title", metadata.title);
  replaceStructuredContentByAlias(doc, "Subject", metadata.subject);
  replaceStructuredContentByAlias(doc, "Client", metadata.clientName);
  replaceStructuredContentByTag(doc, "Client", metadata.clientName);
  replaceStructuredContentByAlias(doc, "Project Name", metadata.projectName);
  replaceStructuredContentByTag(doc, "Project Name", metadata.projectName);

  const body = doc.getElementsByTagName("w:body")[0];
  if (!body) {
    throw new Error("Template document body was not found.");
  }

  const childNodes = Array.from(body.childNodes || []).filter(function (node) {
    return node?.nodeType === 1;
  });
  const coverNodes = [];
  let finalSectPr = null;
  let titlePageSectPr = null;

  childNodes.forEach(function (node) {
    if (node.nodeName === "w:sectPr") {
      finalSectPr = node.cloneNode(true);
      return;
    }

    const nodeLabel = normalizeIntegrationHeading(nodeText(node));
    if (!coverNodes.length || !nodeLabel.startsWith("document purpose")) {
      if (nodeLabel.startsWith("document purpose")) {
        return;
      }
      if (coverNodes.length < 3) {
        coverNodes.push(node.cloneNode(true));
      }
    }

    const sectionBreak = node.getElementsByTagName("w:sectPr");
    if (!titlePageSectPr && sectionBreak.length) {
      const candidate = sectionBreak[sectionBreak.length - 1];
      if (serializer.serializeToString(candidate).includes("<w:titlePg")) {
        titlePageSectPr = candidate.cloneNode(true);
      }
    }
  });

  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }

  coverNodes.forEach(function (node) {
    body.appendChild(node);
  });
  appendWordFragment(doc, body, createWordPageBreakFragment());

  const sections = parseIntegrationSections(options.generatedText);
  sections.forEach(function (section) {
    appendWordFragment(doc, body, createWordParagraphFragment(section.title, "Heading1"));
    section.items.forEach(function (item) {
      if (item.type === "bullet") {
        appendWordFragment(doc, body, createWordParagraphFragment(item.text, "ListBullet"));
        return;
      }

      if (item.type === "number") {
        appendWordFragment(doc, body, createWordParagraphFragment(item.text, "ListNumber"));
        return;
      }

      appendWordFragment(doc, body, createWordParagraphFragment(item.text, ""));
    });
  });

  if (!finalSectPr) {
    throw new Error("Template section properties were not found.");
  }

  ensureSectionPropertiesForTitlePage(doc, finalSectPr, titlePageSectPr);
  body.appendChild(finalSectPr);

  zip.file("word/document.xml", serializer.serializeToString(doc));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE"
  });
}

app.get("/auth.js", function (req, res) {
  noCache(res);
  res.type("application/javascript").sendFile(path.join(ROOT, "auth.js"));
});

app.use(TEST_SCRIPT_APP_BASE_PATH, async function (req, res) {
  const user = requireHubAppAccess(req, res, "test-script-builder");
  if (!user) {
    return;
  }

  const childPath = req.originalUrl.slice(TEST_SCRIPT_APP_BASE_PATH.length) || "/";
  try {
    await proxyChildRequest(req, res, childApps.testScriptBuilder, childPath, user);
  } catch (error) {
    if (!res.headersSent) {
      res.status(502).json({ error: "Test Script Builder proxy failed: " + error.message });
      return;
    }
    res.end();
  }
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
    integrationMissionId: INTEGRATION_MATCHA_MISSION_ID,
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

app.get("/api/access-control", function (req, res) {
  const user = requireHubAuth(req, res);
  if (!user) {
    return;
  }

  const isAdmin = isHubRequestAdmin(user);
  const allowedApps = getHubAllowedAppsForUser(user);
  const config = readHubAccessConfig();

  return res.json({
    currentUser: {
      email: normalizeEmail(user.email || ""),
      isAdmin,
      apps: allowedApps
    },
    appDefinitions: HUB_APP_DEFINITIONS,
    users: isAdmin ? config.users : []
  });
});

app.post("/api/access-control/users", function (req, res) {
  const user = requireHubAuth(req, res);
  if (!user) {
    return;
  }

  if (!isHubRequestAdmin(user)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  const email = normalizeEmail(req.body && req.body.email);
  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  const config = readHubAccessConfig();
  const existing = config.users.find(function (entry) {
    return entry.email === email;
  });
  if (existing) {
    return res.status(409).json({ error: "User already exists." });
  }

  const entry = normalizeHubAccessUser({
    email,
    apps: [],
    updatedAtIso: new Date().toISOString()
  });
  config.users.push(entry);
  writeHubAccessConfig(config);
  return res.status(201).json({ user: entry });
});

app.put("/api/access-control/users/:email/apps", function (req, res) {
  const user = requireHubAuth(req, res);
  if (!user) {
    return;
  }

  if (!isHubRequestAdmin(user)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  const targetEmail = normalizeEmail(req.params.email);
  if (!targetEmail) {
    return res.status(400).json({ error: "Email is required." });
  }

  const config = readHubAccessConfig();
  const index = config.users.findIndex(function (entry) {
    return entry.email === targetEmail;
  });
  if (index < 0) {
    return res.status(404).json({ error: "User not found." });
  }

  const nextApps = Array.isArray(req.body && req.body.apps)
    ? req.body.apps.map(normalizeHubAppId).filter(Boolean)
    : null;
  if (!nextApps) {
    return res.status(400).json({ error: "Apps array is required." });
  }

  config.users[index] = normalizeHubAccessUser({
    email: targetEmail,
    apps: nextApps,
    updatedAtIso: new Date().toISOString()
  });
  writeHubAccessConfig(config);
  return res.json({ user: config.users[index] });
});

app.get("/api/hub-requests", function (req, res) {
  const user = requireHubAuth(req, res);
  if (!user) {
    return;
  }

  if (!isHubRequestAdmin(user)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  const requests = readHubRequests().sort(function (left, right) {
    return String(right.reportedAtIso || "").localeCompare(String(left.reportedAtIso || ""));
  });
  return res.json({
    requests: requests,
    statusValues: HUB_REQUEST_STATUS_VALUES
  });
});

app.post("/api/hub-requests", function (req, res) {
  const user = requireHubAuth(req, res);
  if (!user) {
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requestType = String(body.type || "").trim().toLowerCase();
  const application = String(body.application || "").trim();
  const description = String(body.description || "").trim();

  if (requestType !== "bug" && requestType !== "enhancement") {
    return res.status(400).json({ error: "Type must be bug or enhancement." });
  }
  if (!application) {
    return res.status(400).json({ error: "Application is required." });
  }
  if (!description) {
    return res.status(400).json({ error: "Description is required." });
  }

  const now = new Date();
  const entry = {
    id: createHubRequestId(),
    type: requestType === "bug" ? "Bug" : "Enhancement",
    application: application,
    description: description,
    reportedByName: String(user.name || user.email || "").trim(),
    reportedByEmail: normalizeEmail(user.email || ""),
    reportedAtIso: now.toISOString(),
    reportedAtDisplay: now.toLocaleString(),
    status: "New",
    notes: ""
  };

  const requests = readHubRequests();
  requests.push(entry);
  writeHubRequests(requests);
  return res.status(201).json({ request: entry });
});

app.put("/api/hub-requests/:id", function (req, res) {
  const user = requireHubAuth(req, res);
  if (!user) {
    return;
  }

  if (!isHubRequestAdmin(user)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  const requestId = String(req.params.id || "").trim();
  if (!requestId) {
    return res.status(400).json({ error: "Request ID is required." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requests = readHubRequests();
  const index = requests.findIndex(function (entry) {
    return String(entry.id || "") === requestId;
  });

  if (index < 0) {
    return res.status(404).json({ error: "Request not found." });
  }

  requests[index] = Object.assign({}, requests[index], {
    status: normalizeHubRequestStatus(body.status),
    notes: String(body.notes || "").trim()
  });

  writeHubRequests(requests);
  return res.json({ request: requests[index] });
});

app.get("/api/mission", async function (req, res) {
  const user = requireHubAppAccess(req, res, "troubleshooting-platform");
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
  const user = requireHubAppAccess(req, res, "troubleshooting-platform");
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

    const text = extractMatchaText(payload);

    return res.json({
      text,
      raw: payload,
      user: encodeUser(user)
    });
  } catch (error) {
    return res.status(500).json({ error: "Chat request failed: " + error.message });
  }
});

const integrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 60 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".txt", ".md"]);
    const extension = path.extname(String(file.originalname || "")).toLowerCase();

    if (allowedExtensions.has(extension)) {
      return cb(null, true);
    }

  return cb(new Error("Invalid file type. Allowed: PDF, DOC, DOCX, TXT, MD"));
  }
});

const smeChatUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const allowedExtensions = new Set([".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"]);
    const extension = path.extname(String(file.originalname || "")).toLowerCase();

    if (allowedExtensions.has(extension)) {
      return cb(null, true);
    }

    return cb(new Error("Invalid file type. Allowed: PDF, DOCX, TXT, PNG, JPG"));
  }
});

const trainingKbUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    if (extension === ".docx") {
      return cb(null, true);
    }

    return cb(new Error("Invalid file type. Allowed: DOCX"));
  }
});

app.post("/api/integration-design", integrationUpload.single("sowFile"), async function (req, res) {
  const user = requireHubAppAccess(req, res, "integration-sow-platform");
  if (!user) {
    return;
  }

  if (!MATCHA_API_KEY) {
    return res.status(500).json({ error: "MATCHA_API_KEY is not configured." });
  }

  const taskType = "generate_design_from_sow";
  const instruction =
    "Generate the integration design draft from the attached signed SOW using the approved APAC integration structure. Keep unknown values as TBD and do not invent project facts.";
  const sowText = "";
  const notes = "Channel: SOW to Design workspace. Behave in formal SOW-to-design mode, not SME chat mode.";
  const sowFile = req.file || null;

  if (!sowFile) {
    return res.status(400).json({ error: "An attached SOW file is required." });
  }

  const messages = [
    {
      role: "user",
      content: [
        "User request:",
        instruction,
        "",
        "Task type:",
        taskType
      ]
        .filter(Boolean)
        .join("\n")
    }
  ];

  if (sowFile && sowFile.buffer?.length) {
    messages.push({
      role: "user",
      content: {
        type: "file",
        file: {
          file_name: sowFile.originalname,
          file_data: sowFile.buffer.toString("base64")
        }
      }
    });
  }

  try {
    const response = await fetch(MATCHA_BASE_URL + "/completions", {
      method: "POST",
      headers: matchaHeaders(),
      body: JSON.stringify({
        mission_id: Number(INTEGRATION_MATCHA_MISSION_ID),
        messages,
        context: buildIntegrationMissionContext(taskType, notes)
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

    const generatedText = extractMatchaText(payload);
    let downloadUrl = "";
    let exportFileName = "";

    if (taskType === "generate_design_from_sow") {
      const exportBuffer = await buildIntegrationTemplateExport({
        instruction,
        sowText,
        generatedText,
        sowFileName: sowFile?.originalname || ""
      });
      const exportId = "idd-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      exportFileName = safeFileName(exportId + ".docx");
      fs.writeFileSync(path.join(INTEGRATION_EXPORTS_DIR, exportFileName), exportBuffer);
      downloadUrl = "/api/integration-design/download/" + encodeURIComponent(exportFileName);
    }

    return res.json({
      text: generatedText,
      raw: payload,
      missionId: INTEGRATION_MATCHA_MISSION_ID,
      attachedFileName: sowFile ? sowFile.originalname : "",
      downloadUrl,
      exportFileName,
      user: encodeUser(user)
    });
  } catch (error) {
    return res.status(500).json({ error: "Integration design request failed: " + error.message });
  }
});

app.post("/api/sme-chat", smeChatUpload.single("attachment"), async function (req, res) {
  const user = requireHubAppAccess(req, res, "subject-matter-expert");
  if (!user) {
    return;
  }

  if (!MATCHA_API_KEY) {
    return res.status(500).json({ error: "MATCHA_API_KEY is not configured." });
  }

  const prompt = String(req.body?.prompt || "").trim();
  let chatHistory = [];
  if (Array.isArray(req.body?.chatHistory)) {
    chatHistory = req.body.chatHistory;
  } else if (typeof req.body?.chatHistory === "string" && req.body.chatHistory.trim()) {
    try {
      chatHistory = JSON.parse(req.body.chatHistory);
    } catch {
      chatHistory = [];
    }
  }
  const roleKey = String(req.body?.roleKey || "").trim();
  const missionId = String(req.body?.missionId || "").trim();
  const attachment = req.file || null;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  if (!missionId) {
    return res.status(400).json({ error: "SME missionId is required." });
  }

  const messages = normalizeChatHistoryMessages(chatHistory);
  let attachmentMessage = "";
  if (attachment && attachment.buffer) {
    const extension = path.extname(String(attachment.originalname || "")).toLowerCase();
    if ([".png", ".jpg", ".jpeg"].includes(extension)) {
      const mimeType =
        attachment.mimetype && attachment.mimetype.startsWith("image/")
          ? attachment.mimetype
          : extension === ".png"
            ? "image/png"
            : "image/jpeg";
      messages.push({
        role: "user",
        content: {
          type: "image_url",
          image_url: {
            url: "data:" + mimeType + ";base64," + attachment.buffer.toString("base64")
          }
        }
      });
      attachmentMessage = "Attached image: " + safeFileName(attachment.originalname || "image");
    } else {
      messages.push({
        role: "user",
        content: {
          type: "file",
          file: {
            file_name: safeFileName(attachment.originalname || "attachment"),
            file_data: attachment.buffer.toString("base64")
          }
        }
      });
      attachmentMessage = "Attached file: " + safeFileName(attachment.originalname || "attachment");
    }
  }
  messages.push({
    role: "user",
    content: prompt
  });

  const notes = [
    "Channel: Subject Matter Expert workspace.",
    "Selected role: " + (roleKey || "integration-consultant") + ".",
    "Use SME chat behavior unless the user explicitly asks for SOW-to-design or formal design drafting."
  ].join("\n");

  try {
    const response = await fetch(MATCHA_BASE_URL + "/completions", {
      method: "POST",
      headers: matchaHeaders(),
      body: JSON.stringify({
        mission_id: Number(missionId),
        messages,
        context: buildIntegrationMissionContext("integration_consultant_sme_chat", notes)
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

    return res.json({
      text: extractMatchaText(payload),
      raw: payload,
      attachmentMessage,
      missionId,
      roleKey,
      user: encodeUser(user)
    });
  } catch (error) {
    return res.status(500).json({ error: "SME chat request failed: " + error.message });
  }
});

app.get("/api/integration-design/download/:fileName", function (req, res) {
  const user = requireHubAppAccess(req, res, "integration-sow-platform");
  if (!user) {
    return;
  }

  const requestedName = safeFileName(req.params.fileName);
  const filePath = path.join(INTEGRATION_EXPORTS_DIR, requestedName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Generated document not found." });
  }

  noCache(res);
  return res.download(filePath, requestedName);
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

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeAccessType(value) {
  const next = String(value || "")
    .trim()
    .toLowerCase();

  if (next === "admin" || next === "trainer") {
    return next;
  }

  return "trainee";
}

function uniqueNormalizedStrings(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(normalizeEmail)
    .filter(function (value) {
      if (!value || seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function normalizeTrainingUser(user) {
  const email = normalizeEmail(user && (user.email || user.employeeId));
  if (!email) {
    return null;
  }

  return {
    email,
    name: String((user && user.name) || "").trim(),
    title: String((user && user.title) || "").trim(),
    trainingRole: String((user && (user.trainingRole || user.role)) || "").trim(),
    accessType: normalizeAccessType((user && user.accessType) || ""),
    managerEmail: normalizeEmail(user && (user.managerEmail || user.managerEmployeeId)),
    approvals: Array.isArray(user && user.approvals) ? user.approvals : [],
    trainings: Array.isArray(user && user.trainings) ? user.trainings : []
  };
}

function normalizeTrainingTemplate(training, fallbackRole) {
  const role = String((training && training.role) || fallbackRole || "").trim();
  if (!role) {
    return null;
  }

  return Object.assign({}, training, {
    id: String((training && training.id) || slugify(role + "-" + ((training && training.name) || "training"))).trim(),
    role,
    name: String((training && training.name) || "").trim(),
    description: String((training && training.description) || "").trim(),
    createdByEmail: normalizeEmail(training && training.createdByEmail),
    contributorEmails: uniqueNormalizedStrings(training && training.contributorEmails)
  });
}

function normalizeTrainingTemplates(templates) {
  const normalized = {};

  Object.keys(templates || {}).forEach(function (role) {
    const items = Array.isArray(templates[role]) ? templates[role] : [];
    const nextItems = items
      .map(function (training) {
        return normalizeTrainingTemplate(training, role);
      })
      .filter(Boolean);

    if (nextItems.length) {
      normalized[role] = nextItems;
    }
  });

  return normalized;
}

function templateFingerprint(training) {
  return JSON.stringify(normalizeTrainingTemplate(training, training && training.role) || {});
}

function canEditTrainingTemplate(training, actorEmail, isAdmin) {
  if (isAdmin) {
    return true;
  }

  const normalizedActorEmail = normalizeEmail(actorEmail);
  const normalizedTraining = normalizeTrainingTemplate(training, training && training.role);
  if (!normalizedTraining) {
    return false;
  }

  return (
    normalizedTraining.createdByEmail === normalizedActorEmail ||
    normalizedTraining.contributorEmails.includes(normalizedActorEmail)
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
      const normalized = normalizeTrainingTemplate(data, data.role);
      if (normalized) {
        templates[data.role].push(normalized);
      }
    } catch {
      // Ignore malformed template files.
    }
  });
  return normalizeTrainingTemplates(templates);
}

function writeTrainingTemplatesToDisk(templates) {
  const normalizedTemplates = normalizeTrainingTemplates(templates);
  const keep = new Set();

  Object.keys(normalizedTemplates).forEach(function (role) {
    normalizedTemplates[role].forEach(function (training) {
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

function trainingUserFileName(email) {
  return safeFileName(normalizeEmail(email) + ".json");
}

function trainingUserFilePath(email) {
  return path.join(TRAINING_USERS_DIR, trainingUserFileName(email));
}

function listTrainingUserFiles() {
  try {
    return fs.readdirSync(TRAINING_USERS_DIR).filter(function (file) {
      return file.toLowerCase().endsWith(".json");
    });
  } catch {
    return [];
  }
}

function readTrainingUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  try {
    const raw = fs.readFileSync(trainingUserFilePath(normalizedEmail), "utf8");
    return normalizeTrainingUser(JSON.parse(raw || "{}"));
  } catch {
    return null;
  }
}

function readTrainingUsers() {
  return listTrainingUserFiles()
    .map(function (file) {
      try {
        const raw = fs.readFileSync(path.join(TRAINING_USERS_DIR, file), "utf8");
        return normalizeTrainingUser(JSON.parse(raw || "{}"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeTrainingUser(user) {
  const normalizedUser = normalizeTrainingUser(user);
  if (!normalizedUser) {
    return null;
  }

  fs.writeFileSync(
    trainingUserFilePath(normalizedUser.email),
    JSON.stringify(normalizedUser, null, 2)
  );
  return normalizedUser;
}

function deleteTrainingUserByEmail(email) {
  const filePath = trainingUserFilePath(email);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.unlinkSync(filePath);
  return true;
}

function normalizeHubRequestStatus(value) {
  const next = String(value || "").trim();
  return HUB_REQUEST_STATUS_VALUES.includes(next) ? next : "New";
}

function readHubRequests() {
  try {
    const raw = fs.readFileSync(HUB_REQUESTS_FILE, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHubRequests(requests) {
  const list = Array.isArray(requests) ? requests : [];
  fs.writeFileSync(HUB_REQUESTS_FILE, JSON.stringify(list, null, 2));
  return list;
}

function createDefaultHubAccessConfig() {
  return {
    version: 1,
    users: [
      {
        email: HUB_REQUEST_ADMIN_EMAIL,
        apps: HUB_APP_DEFINITIONS.map(function (appDefinition) {
          return appDefinition.id;
        }),
        updatedAtIso: new Date().toISOString()
      }
    ]
  };
}

function normalizeHubAppId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!HUB_APP_ID_SET.has(normalized)) {
    return "";
  }
  return normalized;
}

function normalizeHubAccessUser(entry) {
  const email = normalizeEmail(entry && entry.email);
  if (!email) {
    return null;
  }

  const apps = Array.isArray(entry && entry.apps)
    ? Array.from(
        new Set(
          entry.apps
            .map(normalizeHubAppId)
            .filter(Boolean)
        )
      )
    : [];

  const nextApps = email === HUB_REQUEST_ADMIN_EMAIL
    ? Array.from(
        new Set(
          apps.concat(
            HUB_APP_DEFINITIONS.map(function (appDefinition) {
              return appDefinition.id;
            })
          )
        )
      )
    : apps;

  return {
    email,
    apps: nextApps,
    updatedAtIso: String(entry && entry.updatedAtIso ? entry.updatedAtIso : new Date().toISOString())
  };
}

function writeHubAccessConfig(config) {
  const users = Array.isArray(config && config.users)
    ? config.users.map(normalizeHubAccessUser).filter(Boolean)
    : [];
  const dedupedUsers = [];
  const seenEmails = new Set();

  users.forEach(function (entry) {
    if (seenEmails.has(entry.email)) {
      return;
    }
    seenEmails.add(entry.email);
    dedupedUsers.push(entry);
  });

  if (!seenEmails.has(HUB_REQUEST_ADMIN_EMAIL)) {
    dedupedUsers.unshift(normalizeHubAccessUser(createDefaultHubAccessConfig().users[0]));
  }

  fs.writeFileSync(
    HUB_ACCESS_FILE,
    JSON.stringify(
      {
        version: 1,
        users: dedupedUsers
      },
      null,
      2
    )
  );
}

function readHubAccessConfig() {
  const fallback = createDefaultHubAccessConfig();
  if (!fs.existsSync(HUB_ACCESS_FILE)) {
    writeHubAccessConfig(fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(HUB_ACCESS_FILE, "utf8"));
    const users = Array.isArray(parsed && parsed.users)
      ? parsed.users.map(normalizeHubAccessUser).filter(Boolean)
      : [];
    const hasAdmin = users.some(function (entry) {
      return entry.email === HUB_REQUEST_ADMIN_EMAIL;
    });
    if (!hasAdmin) {
      users.unshift(normalizeHubAccessUser(fallback.users[0]));
    }
    return {
      version: 1,
      users
    };
  } catch {
    writeHubAccessConfig(fallback);
    return fallback;
  }
}

function isHubRequestAdmin(user) {
  return normalizeEmail(user && user.email) === HUB_REQUEST_ADMIN_EMAIL;
}

function getHubAccessEntryByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const config = readHubAccessConfig();
  return (
    config.users.find(function (entry) {
      return entry.email === normalizedEmail;
    }) || null
  );
}

function getHubAllowedAppsForUser(user) {
  const email = normalizeEmail(user && user.email);
  if (!email) {
    return [];
  }

  const entry = getHubAccessEntryByEmail(email);
  return entry ? entry.apps.slice() : [];
}

function hasHubAppAccess(user, appId) {
  const normalizedAppId = normalizeHubAppId(appId);
  if (!normalizedAppId) {
    return false;
  }

  return getHubAllowedAppsForUser(user).includes(normalizedAppId);
}

function requireHubAppAccess(req, res, appId) {
  const user = requireHubAuth(req, res);
  if (!user) {
    return null;
  }

  if (!hasHubAppAccess(user, appId)) {
    res.status(403).json({ error: "You do not have access to this application." });
    return null;
  }

  return user;
}

function createHubRequestId() {
  return "HUB-" + Date.now();
}

function getTrainingActor(req, res) {
  const hubUser = requireHubAuth(req, res);
  if (!hubUser) {
    return null;
  }

  const email = normalizeEmail(hubUser.email || hubUser.preferredUsername || hubUser.name);
  if (!email) {
    res.status(403).json({ error: "Authenticated user email is unavailable." });
    return null;
  }

  const profile = readTrainingUserByEmail(email);

  const accessType = normalizeAccessType(profile && profile.accessType);

  return {
    hubUser,
    email,
    profile: profile || null,
    accessType,
    isAdmin: accessType === "admin",
    isTrainer: accessType === "trainer" || accessType === "admin"
  };
}

const trainingRouter = express.Router();

trainingRouter.use("/resources", express.static(TRAINING_RESOURCES_DIR, { etag: false, lastModified: false }));

trainingRouter.get("/", function (req, res) {
  noCache(res);
  res.sendFile(path.join(TRAINING_BUNDLED_ROOT, "index.html"));
});

trainingRouter.get("/api/session", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  return res.json({
    authenticated: true,
    authUser: encodeUser(actor.hubUser),
    profile: actor.profile,
    accessType: actor.accessType,
    isAdmin: actor.isAdmin,
    isTrainer: actor.isTrainer
  });
});

trainingRouter.get("/api/library/video", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

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
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

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
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  if (!actor.isTrainer) {
    return res.status(403).json({ error: "Trainer or admin access required." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }

  return res.json({ fileName: req.file.filename });
});

trainingRouter.post("/api/upload/document", trainingDocumentUpload.single("file"), function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  if (!actor.isTrainer) {
    return res.status(403).json({ error: "Trainer or admin access required." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }

  return res.json({ fileName: req.file.filename });
});

trainingRouter.get("/api/templates", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  return res.json(readTrainingTemplatesFromDisk());
});

trainingRouter.put("/api/templates", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  if (!actor.isTrainer) {
    return res.status(403).json({ error: "Trainer or admin access required." });
  }

  const existingTemplates = readTrainingTemplatesFromDisk();
  const incomingTemplates = normalizeTrainingTemplates(req.body && typeof req.body === "object" ? req.body : {});

  if (!actor.isAdmin) {
    const existingMap = new Map();
    const incomingMap = new Map();

    Object.keys(existingTemplates).forEach(function (role) {
      (existingTemplates[role] || []).forEach(function (training) {
        existingMap.set(role + "::" + training.id, training);
      });
    });

    Object.keys(incomingTemplates).forEach(function (role) {
      (incomingTemplates[role] || []).forEach(function (training) {
        if (!training.createdByEmail) {
          training.createdByEmail = actor.email;
        }
        incomingMap.set(role + "::" + training.id, training);
      });
    });

    const keys = new Set([].concat(Array.from(existingMap.keys()), Array.from(incomingMap.keys())));
    for (const key of keys) {
      const before = existingMap.get(key) || null;
      const after = incomingMap.get(key) || null;
      if (templateFingerprint(before) === templateFingerprint(after)) {
        continue;
      }

      if (!canEditTrainingTemplate(before || after, actor.email, false)) {
        return res.status(403).json({ error: "You can only modify trainings you created or contribute to." });
      }

      if (after && !after.createdByEmail) {
        after.createdByEmail = actor.email;
      }
    }
  }

  writeTrainingTemplatesToDisk(incomingTemplates);
  return res.json(incomingTemplates);
});

trainingRouter.get("/api/users", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  return res.json(readTrainingUsers());
});

trainingRouter.get("/api/users/:id", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  const targetEmail = normalizeEmail(req.params.id);
  if (!targetEmail) {
    return res.status(400).json({ error: "Missing email" });
  }

  if (!actor.isAdmin && actor.email !== targetEmail) {
    return res.status(403).json({ error: "You can only view your own profile." });
  }

  const user = readTrainingUserByEmail(targetEmail);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json(user);
});

trainingRouter.get("/api/team", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  const users = readTrainingUsers().filter(function (user) {
    return normalizeEmail(user.managerEmail) === actor.email;
  });
  return res.json(users);
});

trainingRouter.post("/api/users", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  const user = normalizeTrainingUser(req.body || {});
  if (!user || !user.email) {
    return res.status(400).json({ error: "Missing email" });
  }
  if (!actor.isAdmin && user.email !== actor.email) {
    return res.status(403).json({ error: "You can only register your own profile." });
  }
  const existingUser = readTrainingUserByEmail(user.email);
  if (existingUser && !(actor.isAdmin && user.email === actor.email)) {
    return res.status(409).json({ error: "Email exists" });
  }

  if (!actor.isAdmin) {
    user.accessType = "trainee";
  }

  const savedUser = writeTrainingUser(existingUser ? Object.assign({}, existingUser, user) : user);
  return res.json(savedUser);
});

trainingRouter.put("/api/users/:id", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  const targetId = normalizeEmail(req.params.id);
  const existingUser = readTrainingUserByEmail(targetId);
  if (!existingUser) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!actor.isAdmin && actor.email !== existingUser.email) {
    return res.status(403).json({ error: "You can only update your own profile." });
  }

  const nextUser = normalizeTrainingUser(Object.assign({}, existingUser, req.body || {}));
  if (!nextUser || !nextUser.email) {
    return res.status(400).json({ error: "Missing email" });
  }

  const duplicateUser =
    nextUser.email !== targetId ? readTrainingUserByEmail(nextUser.email) : null;
  if (duplicateUser) {
    return res.status(409).json({ error: "Email exists" });
  }

  if (!actor.isAdmin) {
    nextUser.accessType = existingUser.accessType;
  }

  if (targetId !== nextUser.email) {
    deleteTrainingUserByEmail(targetId);
  }

  const savedUser = writeTrainingUser(nextUser);
  return res.json(savedUser);
});

trainingRouter.delete("/api/users/:id", function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  if (!actor.isAdmin) {
    return res.status(403).json({ error: "Admin access required." });
  }

  const targetId = normalizeEmail(req.params.id);
  if (!readTrainingUserByEmail(targetId)) {
    return res.status(404).json({ error: "User not found" });
  }

  deleteTrainingUserByEmail(targetId);
  return res.json({ ok: true });
});

trainingRouter.get("/api/matcha/missions", async function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  if (!actor.isTrainer) {
    return res.status(403).json({ error: "Trainer or admin access required." });
  }

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
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  if (!actor.isTrainer) {
    return res.status(403).json({ error: "Trainer or admin access required." });
  }

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

trainingRouter.post("/api/matcha/kb-issue-upload", trainingKbUpload.single("file"), async function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  if (!MATCHA_API_KEY) {
    return res.status(500).json({ error: "MATCHA_API_KEY not set" });
  }

  const product = String(req.body?.product || "").trim().toLowerCase();
  const targetFolderName = TROUBLESHOOTING_KB_FOLDER_BY_PRODUCT[product];
  if (!targetFolderName) {
    return res.status(400).json({ error: "Invalid product" });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: "Missing DOCX file" });
  }

  try {
    const foldersResponse = await fetch(
      TRAINING_MATCHA_BASE_URL +
        "/rest/api/v1/folders?mission_id=" +
        encodeURIComponent(MATCHA_MISSION_ID),
      {
        headers: {
          "MATCHA-API-KEY": MATCHA_API_KEY
        }
      }
    );

    const foldersText = await foldersResponse.text();
    if (!foldersResponse.ok) {
      return res.status(500).json({ error: "Matcha folders request failed", details: foldersText });
    }

    const folders = JSON.parse(foldersText);
    const targetFolder = Array.isArray(folders)
      ? folders.find(function (folder) {
          return String(folder.name || folder.folder_name || "").trim().toLowerCase() === targetFolderName.toLowerCase();
        })
      : null;

    if (!targetFolder) {
      return res.status(404).json({ error: "Target Matcha folder not found", folderName: targetFolderName });
    }

    const folderId = targetFolder.id || targetFolder.folder_id || targetFolder.folderId;
    const uploadName = safeFileName(req.file.originalname || "Issue_Template.docx");
    const form = new FormData();
    form.append("file", new Blob([req.file.buffer]), uploadName);

    let uploadResponse = await fetch(
      TRAINING_MATCHA_BASE_URL + "/rest/api/v1/file?folder_id=" + encodeURIComponent(folderId),
      {
        method: "POST",
        headers: getMatchaWriteHeaders(),
        body: form
      }
    );

    if (!uploadResponse.ok && uploadResponse.status === 404) {
      uploadResponse = await fetch(
        TRAINING_MATCHA_BASE_URL + "/rest/api/v1/upload?folder_id=" + encodeURIComponent(folderId),
        {
          method: "POST",
          headers: getMatchaWriteHeaders(),
          body: form
        }
      );
    }

    const uploadText = await uploadResponse.text();
    if (!uploadResponse.ok) {
      return res.status(500).json({ error: "Matcha KB upload failed", details: uploadText });
    }

    let uploadPayload = {};
    try {
      uploadPayload = JSON.parse(uploadText);
    } catch {
      uploadPayload = { raw: uploadText };
    }

    return res.json({
      ok: true,
      missionId: MATCHA_MISSION_ID,
      folderId: String(folderId),
      folderName: targetFolderName,
      fileName: uploadName,
      upload: uploadPayload
    });
  } catch (error) {
    return res.status(500).json({ error: "Matcha KB upload failed", details: error.message });
  }
});

trainingRouter.post("/api/matcha/preload-docs", async function (req, res) {
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

  if (!actor.isTrainer) {
    return res.status(403).json({ error: "Trainer or admin access required." });
  }

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
  const actor = getTrainingActor(req, res);
  if (!actor) {
    return;
  }

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
    "User: " + (userContext.name || "Unknown") + " (" + (userContext.email || "N/A") + ")",
    "Training role: " + (userContext.trainingRole || "N/A") + " | Title: " + (userContext.title || "N/A"),
    "Training: " + (userContext.trainingName || "N/A"),
    "Phase: " + (userContext.phaseName || "N/A") + " | Activity: " + (userContext.activityLabel || "N/A"),
    payload.document?.displayName ? "Selected document: " + payload.document.displayName : "",
    payload.documentPrompt || ""
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
    const forceUpload = Boolean(payload.document?.forceUpload);

    if (payload.document?.fileName && folderId) {
      const docPath = path.join(TRAINING_DOCS_DIR, payload.document.fileName);
      if (fs.existsSync(docPath)) {
        if (!forceUpload) {
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
        }

        if (!uploadedFileId) {
          const uploadFileName = forceUpload
            ? Date.now() + "__" + safeFileName(payload.document.fileName)
            : payload.document.fileName;
          const form = new FormData();
          form.append("file", new Blob([fs.readFileSync(docPath)]), uploadFileName);

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
          fileStatus = String(uploadData.status || uploadData.file_status || uploadData.state || "").toLowerCase();
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
      const requestInput =
        (lastUser && String(lastUser.content || "").trim()) ||
        payload.documentPrompt ||
        "Read the selected training document and help the trainee.";
      const response = await fetch(TRAINING_MATCHA_BASE_URL + "/rest/api/v1/completions", {
        method: "POST",
        headers: matchaHeaders(),
        body: JSON.stringify({
          mission_id: Number(missionId),
          input: requestInput,
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

app.use("/training-platform", function (req, res, next) {
  const user = requireHubAppAccess(req, res, "training-platform");
  if (!user) {
    return;
  }
  next();
});

app.use("/training-platform", trainingRouter);

["SIGINT", "SIGTERM", "exit"].forEach(function (signalName) {
  process.on(signalName, function () {
    Object.keys(childApps).forEach(function (key) {
      const runtime = childApps[key];
      if (runtime && runtime.child && runtime.child.exitCode == null && !runtime.child.killed) {
        try {
          runtime.child.kill();
        } catch (_error) {
          // Ignore child shutdown failures.
        }
      }
    });
  });
});

app.listen(PORT, function () {
  console.log("APAC PS Application Hub running on http://localhost:" + PORT);
});
