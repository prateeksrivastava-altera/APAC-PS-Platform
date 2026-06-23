import config from "../config.js";

/**
 * Calls a single Matcha mission and returns the output text.
 * Finds the content block with type "output_text" (skipping thinking/reasoning).
 *
 * @param {number} missionId - The Matcha mission ID
 * @param {string} input - The input text for the mission
 * @returns {Promise<string>} The output text from the mission
 */
export async function callMission(missionId, input) {
  const url = `${config.matcha.baseUrl.replace(/\/+$/, "")}/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.matcha.timeoutSeconds * 1000
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MATCHA-API-KEY": config.matcha.apiKey,
      },
      body: JSON.stringify({
        mission_id: missionId,
        input: input,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mission ${missionId} failed (HTTP ${response.status}): ${errorText}`
      );
    }

    const data = await response.json();

    // Find the content block with type "output_text" (not thinking/reasoning)
    const contentBlocks = data?.output?.[0]?.content || [];
    const outputBlock =
      contentBlocks.find((b) => b.type === "output_text") || contentBlocks[0];
    const outputText = outputBlock?.text;

    if (!outputText) {
      throw new Error(
        `Mission ${missionId} returned no output text. Status: ${data?.status}`
      );
    }

    return outputText;
  } finally {
    clearTimeout(timeout);
  }
}
