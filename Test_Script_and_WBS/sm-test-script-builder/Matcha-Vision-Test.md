# Matcha Vision Test — Image Describer Mission

Use this document to manually test whether your Matcha instance supports vision/image input.

---

## Step 1 — Convert Your Screenshot to Base64

Save the screenshot as a file (e.g. `test-image.png`) then run this in PowerShell:

```powershell
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("C:\path\to\test-image.png"))
```

Copy the output — you will paste it into the test payload below.

---

## Step 2 — System Prompt / Persona for the Image Describer Mission

Create a new mission in Matcha with the following system prompt:

```
You are a JSON-only API. Your entire response must be a single valid JSON object. Do not include any text, explanation, reasoning, markdown, or commentary before or after the JSON. Do not use code fences. Output nothing except the JSON object.

ROLE: You are a document image analyst for software test script generation. You receive an image from a software product document (PDF or Word) and produce a detailed, structured description of its content for use by downstream test script generation missions.

OUTPUT SCHEMA:
{
  "description": "full natural-language description of the image content",
  "imageType": "one of: UI Screenshot, Diagram, Flowchart, Table, Chart, Architecture, Other",
  "keyElements": ["list of key UI elements, field labels, button names, data values, or steps visible in the image"],
  "testRelevance": "brief note on how the content of this image relates to testable software functionality"
}

RULES:
- Describe ALL visible UI elements: field names, button labels, tab names, column headers, data values, status indicators, icons
- For tables: list every column header and describe the data shown in each row
- For flowcharts and process diagrams: describe each step, decision point, and connection in sequence
- For UI screenshots: describe the page layout, all visible controls, their labels, and their current state or values
- Include any visible text verbatim where relevant (e.g. error messages, labels, headings)
- Be specific and thorough — this description will be used to generate software test scripts
- Do NOT hallucinate elements not visible in the image
- Do NOT include a "generatedAt" field

Output ONLY the JSON object. No other text.
```

---

## Step 3 — Test Payload to Send to Matcha

Send the following as the `input` to your Image Describer mission. Replace `[BASE64_STRING]` with the output from Step 1.

```
You are receiving a screenshot from a software product document. Analyse the image and return a structured JSON description.

IMAGE FORMAT: JPEG or PNG
IMAGE DATA (base64): [BASE64_STRING]
IMAGE SOURCE: Page 3 of product documentation
```

### Full Matcha API call (for reference):

```json
{
  "mission_id": "<your image describer mission id>",
  "input": "You are receiving a screenshot from a software product document. Analyse the image and return a structured JSON description.\n\nIMAGE FORMAT: PNG\nIMAGE DATA (base64): [BASE64_STRING]\nIMAGE SOURCE: Page 3 of product documentation"
}
```

---

## Step 4 — What a Successful Response Looks Like

If Matcha vision is working, the response should look something like this for the vitals screenshot:

```json
{
  "description": "A patient record screen showing vital signs for Michael Johnson (Wristband ID: WB2024001). The patient is identified as Delayed status, Male. The screen has five tabs: Summary, Triage, Injuries, Vitals (currently active), and Notes. The Vitals tab shows a 'Record Vital Signs' section with an 'Add Reading' button, and a 'Vital Signs History' table with two recorded readings.",
  "imageType": "UI Screenshot",
  "keyElements": [
    "Wristband ID: WB2024001",
    "Patient name: Michael Johnson",
    "Status badges: Identified, Delayed, Male",
    "Last updated: Jan 02, 2026 13:30",
    "Tabs: Summary, Triage, Injuries, Vitals (active), Notes",
    "Add Reading button",
    "Vital Signs History table",
    "Columns: Time, BP, HR, RR, SpO2, Temp, Pain, BGL, Notes",
    "Row 1: Jan 02 2026 13:30 | 135/85 | 92 | 18 | 97% | 36.8°C | 7 | - | -",
    "Row 2: Jan 02 2026 13:30 | 130/62 | 88 | 16 | 98% | 36.7°C | 6 | - | -",
    "Delete (bin) icon on each row"
  ],
  "testRelevance": "Tests can cover: adding a new vital signs reading, validating all column fields, deleting a reading, tab navigation, and verifying status badge display."
}
```

---

## Step 5 — Interpreting the Result

| Result | What it means |
|--------|--------------|
| Returns JSON matching the schema above | ✅ Matcha supports vision — proceed with implementation |
| Returns a description but not in JSON format | ⚠️ Mission system prompt needs adjustment — check JSON-only instruction |
| Returns an error about unsupported input type | ❌ Matcha does not support vision input in this way — explore alternative format |
| Returns a hallucinated description unrelated to the image | ❌ The underlying model is text-only — vision not supported |
| Returns an empty response or timeout | ❌ Image may be too large — try reducing resolution and retry |

---

## Notes

- If the base64 string is very long, try reducing the image to 800px wide before converting — it reduces size significantly with no meaningful loss for UI screenshots
- The test payload above sends the base64 as plain text in the `input` field. If Matcha has a separate field for images (e.g. `images: [...]`), ask the vendor for the correct request format and update accordingly
- If vision works, the mission ID for the Image Describer gets added to `.env` as `MISSION_ID_IMAGE_DESCRIBER`
