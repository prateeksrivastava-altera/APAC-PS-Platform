import config from "../config.js";

/**
 * Mission definitions — 4-step pipeline.
 */
export const MISSIONS = [
  {
    id: config.matcha.missions.decomposer,
    name: "Identifying Test Areas",
    step: 1,
  },
  {
    id: config.matcha.missions.normaliser,
    name: "Defining Expected Outcomes",
    step: 2,
  },
  {
    id: config.matcha.missions.scenarioBuilder,
    name: "Creating Test Flows",
    step: 3,
  },
  {
    id: config.matcha.missions.materialiser,
    name: "Compiling Test Report",
    step: 4,
  },
];

/**
 * Returns mission-specific directives for missions 2-4.
 */
export function getMissionDirective(step) {
  switch (step) {
    case 2:
      return `MISSION DIRECTIVE — DEFINING EXPECTED OUTCOMES:
You are receiving the original source documentation AND the previous mission's analysis of test areas.
Your task is to define expected outcomes and success criteria for each identified test area.

CRITICAL INSTRUCTIONS:
- Cross-reference the original source documentation below to ensure NOTHING was missed by the previous analysis.
- If the source documentation mentions features, workflows, screens, or configurations that are NOT covered in the previous analysis, ADD them.
- Define clear, specific success criteria for every test area.
- Map dependencies between features (e.g. "encryption requires a passkey").
- Ensure every feature in the source document maps to at least one expected outcome.
- Do NOT hallucinate — only reference features explicitly described in the source documentation.
- Do NOT invent requirement IDs (REQ-001, FR-12, UC-3) — use human-readable descriptions only.
- Follow the priority definitions: High (core workflows, safety, security), Medium (CRUD, validations, UI), Low (cosmetic, tooltips).
- Expected outcomes must be VERBOSE and DETAILED — describe the full UI state, exact label text, exact error messages in quotes, page layout, and visible elements.
- Preserve the documentReference value from the previous mission for each test area — do NOT change, remove, or omit it.
- If the previous mission did not include a documentReference for an item, infer it from the source documentation section or page that matches the test area.`;

    case 3:
      return `MISSION DIRECTIVE — CREATING TEST FLOWS:
You are receiving the original source documentation AND the previous mission's expected outcomes analysis.
Your task is to construct detailed test scenarios with step-by-step flows.

CRITICAL INSTRUCTIONS:
- Cross-reference the original source documentation to verify completeness — every feature must have at least one test scenario.
- Create one test case per distinct feature — do NOT combine unrelated features.
- Cover positive (happy-path), negative (error conditions), and edge case scenarios.
- Steps may combine related actions into a logical sequence when they form part of the same verification.
- Reference specific UI elements by name as described in the source documentation.
- Every step MUST have a specific, verifiable expected outcome.
- Expected results must describe the COMPLETE UI state: page layout, section positioning, visible labels, field states, exact message text in quotes.
- Include field validation details: minimum/maximum character limits, mandatory field behaviour, exact error message text.
- Include a Scenario Guide with 2-4 preconditions per test case (user role, system state, data prerequisites, navigation start point).
- Do NOT hallucinate — only reference features explicitly described in the source documentation.
- Do NOT invent requirement IDs or reference codes.
- For multi-step workflows, create both full end-to-end AND individual step test cases.
- Preserve the documentReference value for each test scenario — carry it forward unchanged from the previous mission's output.
- When adding new test scenarios not present in the previous mission, set documentReference to the section heading or page number from the source documentation where the feature is described.
- Do NOT omit documentReference — every scenario must have this field (use "" if no structural reference is identifiable).`;

    case 4:
      return `MISSION DIRECTIVE — COMPILING TEST REPORT:
You are receiving the original source documentation AND the previous mission's test flows.
Your task is to compile the final test report in a standardised format.

CRITICAL INSTRUCTIONS:
- Cross-reference the original source documentation one final time — if any features are still missing test coverage, add them now.
- Assign priorities using: High (core workflows, safety, security), Medium (CRUD, validations, UI), Low (cosmetic, tooltips).
- Do NOT hallucinate — only reference features explicitly described in the source documentation.
- Do NOT invent requirement IDs (REQ-001, FR-12, UC-3) or fake dates/timestamps.
- Use consistent action verbs: Click, Enter, Select, Navigate to, Verify, Confirm.
- Every Scenario Guide must have 2-4 human-readable preconditions — no codes or identifiers.
- Preserve ALL detail from the previous mission output — do NOT summarise or condense steps.
- Expected results must remain VERBOSE with full UI state descriptions, exact quoted text, and layout details.
- Preserve the documentReference field for every scenario — carry it forward from the previous mission unchanged.
- Every scenario in the output JSON MUST include a "documentReference" field (use "" if not identifiable).

OUTPUT FORMAT — return valid JSON matching exactly this structure:
{
  "testSuite": "Name of the test suite",
  "scenarios": [
    {
      "id": "TC-001",
      "title": "Descriptive test case title",
      "priority": "High",
      "documentReference": "Section 3.2 - Bulk Export",
      "tags": ["tag1"],
      "preconditions": ["Precondition one", "Precondition two"],
      "steps": [
        {
          "action": "Overview of step",
          "detail": "Step detail",
          "input": "Input value if applicable",
          "expected": "Expected outcome",
          "scenarioGuide": "Scenario guide content"
        }
      ]
    }
  ]
}`;

    default:
      return "";
  }
}

/**
 * Composes the input for a given mission step.
 * All steps receive only the current input — missions 2-4 have their own
 * system prompts in the Matcha platform and expect only the previous mission's JSON output.
 */
export function composeMissionInput(step, originalInput, currentInput) {
  return currentInput;
}
