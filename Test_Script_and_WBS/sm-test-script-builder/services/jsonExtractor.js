const ANCHORS = [
  '{"sections"',
  '{"requirements"',
  '{"testSuite"',
  '{"scenarios"',
];

/**
 * Attempts to extract a valid JSON object from text that may contain
 * non-JSON preamble or postamble (e.g. LLM thinking output).
 *
 * @param {string|null} text - Raw text potentially containing JSON
 * @returns {string|null} Cleaned JSON string, or null if no valid JSON found
 */
export function extractJson(text) {
  if (!text) return null;

  const lastBrace = text.lastIndexOf("}");
  if (lastBrace === -1) return null;

  // Strategy 1: first '{' to last '}'
  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    if (isValidJson(candidate)) return candidate;
  }

  // Strategy 2: anchor on known root keys
  for (const anchor of ANCHORS) {
    const idx = text.indexOf(anchor);
    if (idx !== -1) {
      const candidate = text.slice(idx, lastBrace + 1);
      if (isValidJson(candidate)) return candidate;
    }
  }

  return null;
}

/**
 * Checks if a string is valid JSON that parses to an object.
 */
function isValidJson(text) {
  try {
    const parsed = JSON.parse(text);
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}
