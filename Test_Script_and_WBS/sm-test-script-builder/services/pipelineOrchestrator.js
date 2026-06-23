import { callMission } from "./matchaApiService.js";
import { extractJson } from "./jsonExtractor.js";
import { MISSIONS, composeMissionInput } from "./missionDirectives.js";

/**
 * Writes a single SSE event: event: {name}\ndata: {json}\n\n
 */
function writeSseEvent(res, eventName, data) {
  const json = JSON.stringify(data);
  res.write(`event: ${eventName}\ndata: ${json}\n\n`);
}

/**
 * Tries to parse text as JSON. Falls back to extractJson.
 * Returns cleaned JSON string, or the original text if not valid.
 */
function tryParseJson(text) {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed);
  } catch {
    const extracted = extractJson(text);
    return extracted || text;
  }
}

/**
 * Tries to deserialize JSON text into an object.
 * Returns parsed object, or the raw string if parsing fails.
 */
function tryDeserialize(text) {
  try {
    return JSON.parse(text);
  } catch {
    const extracted = extractJson(text);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch {
        return text;
      }
    }
    return text;
  }
}

/**
 * Executes the 4-mission pipeline, streaming SSE progress events.
 *
 * @param {string} input - The assembled prompt text
 * @param {import('express').Response} res - Express response for SSE
 */
export async function executePipeline(input, res) {
  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Disable compression/buffering for SSE
  res.flushHeaders();

  const originalInput = input;
  let currentInput = input;

  try {
    for (const mission of MISSIONS) {
      // Send "running" progress event
      writeSseEvent(res, "progress", {
        step: mission.step,
        totalSteps: 4,
        missionName: mission.name,
        status: "running",
      });

      // Compose enriched input for missions 2-4
      const missionInput = composeMissionInput(
        mission.step,
        originalInput,
        currentInput
      );

      // Call the Matcha mission
      const outputText = await callMission(mission.id, missionInput);

      // Extract clean JSON before passing to next mission
      currentInput = tryParseJson(outputText);

      // Send "completed" progress event
      writeSseEvent(res, "progress", {
        step: mission.step,
        totalSteps: 4,
        missionName: mission.name,
        status: "completed",
      });
    }

    // Parse final output and send complete event
    const finalResult = tryDeserialize(currentInput);

    writeSseEvent(res, "complete", {
      result: finalResult,
    });
  } catch (err) {
    console.error("Pipeline error:", err.message);

    writeSseEvent(res, "error", {
      error: err.message,
    });
  }

  res.end();
}
