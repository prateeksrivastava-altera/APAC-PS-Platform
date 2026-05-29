#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DEFAULT_BASE_URL = "https://matcha.harriscomputer.com/rest/api/v1";
const DEFAULT_MISSION_ID = 1920;
const DEFAULT_WORKSPACE_ID = -1;

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadConfig() {
  const configPath = path.join(process.cwd(), "matcha.config.json");
  const fileConfig = readJsonFile(configPath);

  return {
    apiKey: process.env.MATCHA_API_KEY || fileConfig.apiKey || "",
    baseUrl: process.env.MATCHA_BASE_URL || fileConfig.baseUrl || DEFAULT_BASE_URL,
    missionId: Number(process.env.MATCHA_MISSION_ID || fileConfig.missionId || DEFAULT_MISSION_ID),
    workspaceId: Number(process.env.MATCHA_WORKSPACE_ID || fileConfig.workspaceId || DEFAULT_WORKSPACE_ID),
    personaPath:
      process.env.MATCHA_PERSONA_PATH ||
      fileConfig.personaPath ||
      path.join(process.cwd(), "persona_improved.md"),
  };
}

function parseArgs(argv) {
  const args = { message: "", skipMissionLookup: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if ((arg === "--message" || arg === "-m") && argv[index + 1]) {
      args.message = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--skip-mission-lookup") {
      args.skipMissionLookup = true;
    }
  }

  return args;
}

function readPersona(personaPath) {
  if (!fs.existsSync(personaPath)) {
    return "";
  }

  return fs.readFileSync(personaPath, "utf8").trim();
}

function buildHeaders(apiKey, extraHeaders = {}) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "MATCHA-API-KEY": apiKey,
    ...extraHeaders,
  };
}

async function apiRequest(url, options) {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let parsed;

  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch (error) {
    parsed = bodyText;
  }

  if (!response.ok) {
    const detail =
      typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${detail}`);
  }

  return parsed;
}

async function listMissions(config) {
  const select =
    "id,workspace_id,workspace_name,name,description,syscontext,mission_blurb,updated_at";
  const url = new URL(`${config.baseUrl}/missions`);
  url.searchParams.set("workspace_id", String(config.workspaceId));
  url.searchParams.set("select", select);

  return apiRequest(url, {
    method: "GET",
    headers: buildHeaders(config.apiKey),
  });
}

async function getMissionById(config, missionId) {
  const missions = await listMissions(config);
  return missions.find((mission) => Number(mission.id) === Number(missionId)) || null;
}

function extractOutputText(payload) {
  if (!payload || !Array.isArray(payload.output)) {
    return "";
  }

  const chunks = [];

  for (const item of payload.output) {
    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (contentItem.type === "output_text" && contentItem.text) {
        chunks.push(contentItem.text);
      }
    }
  }

  return chunks.join("\n\n").trim();
}

async function createCompletion(config, prompt, personaContext) {
  const url = `${config.baseUrl}/completions`;
  const body = {
    mission_id: config.missionId,
    input: prompt,
    context: personaContext || undefined,
  };

  return apiRequest(url, {
    method: "POST",
    headers: buildHeaders(config.apiKey),
    body: JSON.stringify(body),
  });
}

function printMissionSummary(mission) {
  if (!mission) {
    console.log(
      "Mission lookup: not found in the current workspace listing. Completion can still succeed if the mission is callable but not returned by workspace_id filtering."
    );
    return;
  }

  console.log("Mission lookup:");
  console.log(`- ID: ${mission.id}`);
  console.log(`- Name: ${mission.name}`);
  console.log(`- Workspace: ${mission.workspace_name || mission.workspace_id}`);
  if (mission.updated_at) {
    console.log(`- Updated: ${mission.updated_at}`);
  }
  if (mission.description) {
    console.log(`- Description: ${mission.description}`);
  }
  console.log("");
}

function validateConfig(config) {
  if (!config.apiKey) {
    throw new Error(
      "Missing API key. Set MATCHA_API_KEY or create matcha.config.json from matcha.config.example.json."
    );
  }
}

async function promptInteractive(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const config = loadConfig();
  const args = parseArgs(process.argv.slice(2));
  validateConfig(config);

  const personaContext = readPersona(config.personaPath);
  const prompt = args.message || (await promptInteractive("Enter your troubleshooting question: "));

  if (!prompt) {
    throw new Error("No prompt provided.");
  }

  if (!args.skipMissionLookup) {
    const mission = await getMissionById(config, config.missionId);
    printMissionSummary(mission);
  }

  const completion = await createCompletion(config, prompt, personaContext);
  const text = extractOutputText(completion);

  console.log("Assistant response:");
  console.log(text || JSON.stringify(completion, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
