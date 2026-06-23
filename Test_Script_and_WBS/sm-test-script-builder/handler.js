import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const {
  MATCHA_API_KEY,
  BASE_URL,
  MISSION_ID_DECOMPOSER,
  MISSION_ID_NORMALISER,
  MISSION_ID_SCENARIO_BUILDER,
  MISSION_ID_MATERIALISER,
} = process.env;

/**
 * Extracts a JSON object from text that may contain preamble/explanation.
 * Finds the first '{' and the last '}' and attempts to parse the substring.
 * If that fails, scans for '{"testSuite"' or '{"scenarios"' as anchors.
 * Returns the parsed object, or null if no valid JSON found.
 */
function extractJSON(text) {
  if (typeof text !== "string") return null;

  const lastBrace = text.lastIndexOf("}");
  if (lastBrace === -1) return null;

  // Attempt 1: first '{' to last '}'
  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.substring(firstBrace, lastBrace + 1));
    } catch { /* try next strategy */ }
  }

  // Attempt 2: anchor on known root keys
  for (const anchor of ['{"sections"', '{"requirements"', '{"testSuite"', '{"scenarios"']) {
    const idx = text.indexOf(anchor);
    if (idx !== -1) {
      try {
        return JSON.parse(text.substring(idx, lastBrace + 1));
      } catch { /* continue */ }
    }
  }

  return null;
}

async function callMission(missionId, input) {
  const response = await fetch(`${BASE_URL}/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MATCHA-API-KEY": MATCHA_API_KEY,
    },
    body: JSON.stringify({ mission_id: missionId, input }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mission ${missionId} failed (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  // Find the content block with type "output_text" (not thinking/reasoning blocks)
  const contentBlocks = data?.output?.[0]?.content || [];
  const outputBlock = contentBlocks.find(b => b.type === "output_text") || contentBlocks[0];
  const outputText = outputBlock?.text;
  if (!outputText) {
    throw new Error(`Mission ${missionId} returned no output text.`);
  }
  return outputText;
}

// Single mission handler (backward compatibility)
export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const input = body.input || "";

    if (!input) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing input text" }),
      };
    }

    const outputText = await callMission(MISSION_ID_DECOMPOSER, input);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", output: outputText }),
    };
  } catch (err) {
    console.error("Lambda error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// Pipeline handler - chains all 4 missions sequentially
export const pipelineHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const input = body.input || "";

    if (!input) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing input text" }),
      };
    }

    const missions = [
      MISSION_ID_DECOMPOSER,
      MISSION_ID_NORMALISER,
      MISSION_ID_SCENARIO_BUILDER,
      MISSION_ID_MATERIALISER,
    ];

    let currentInput = input;
    for (const missionId of missions) {
      const outputText = await callMission(missionId, currentInput);

      // Extract clean JSON before passing to next mission (strip LLM preamble)
      let parsed;
      try {
        parsed = JSON.parse(outputText);
      } catch {
        parsed = extractJSON(outputText);
      }
      currentInput = parsed ? JSON.stringify(parsed) : outputText;
    }

    // Attempt to parse final output as JSON (strip LLM preamble if needed)
    let finalResult;
    try {
      finalResult = JSON.parse(currentInput);
    } catch {
      finalResult = extractJSON(currentInput) || currentInput;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", result: finalResult }),
    };
  } catch (err) {
    console.error("Pipeline Lambda error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
