// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================

const API_URL = "pipeline";
const CHAR_LIMIT = 400_000;

const MISSION_NAMES = [
  "Identifying Test Areas",
  "Defining Expected Outcomes",
  "Creating Test Flows",
  "Compiling Test Report",
];

const MISSION_DESCRIPTIONS = [
  "Analyzing document structure and identifying key testing areas",
  "Determining success criteria and expected results for each test",
  "Building detailed test scenarios and user flows",
  "Generating comprehensive test scripts and documentation",
];

const STEP_LABELS = [
  "Upload Document",
  "Select Content",
  "Edit Prompt",
  "Generate Tests",
  "View Results",
];

const STEP_ICONS = [
  "upload_file",
  "checklist",
  "edit_note",
  "play_circle",
  "task_alt",
];

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `You are an expert QA test analyst. Analyse the following product documentation thoroughly and generate comprehensive, structured test scripts.

INSTRUCTIONS:
- Identify ALL testable requirements, features, workflows, and user interactions described in the documentation.
- For each testable area, create detailed test scenarios that cover:
  * Positive/happy-path scenarios (expected correct usage)
  * Negative scenarios (invalid inputs, error conditions, access denied)
  * Edge cases and boundary conditions (empty fields, max lengths, special characters)
  * State transitions and workflow sequences
- Derive preconditions from context (e.g. user must be logged in, patient record must exist).
- Each test step should be specific and actionable — avoid vague instructions like "verify it works".
- Include the expected outcome for EVERY step, not just the final step.
- Organise scenarios to mirror the document's section structure where possible.
- Be thorough — more detailed scenarios with granular steps are better than fewer high-level ones.
- Pay close attention to field validations, mandatory vs optional fields, default values, and system behaviours mentioned in the documentation.

PRIORITY ASSIGNMENT:
Assign a priority to each test scenario using these definitions:
- High: core workflows, patient safety, data integrity, security, login/authentication
- Medium: standard CRUD operations, field validations, navigation, UI behaviour
- Low: cosmetic issues, tooltips, default values, edge cases with low impact

ANALYSIS APPROACH:
Before generating test scripts, systematically analyse the documentation:
1. Identify every distinct feature, workflow, screen, and configuration option.
2. For each feature, note: who uses it, what inputs it requires, what outputs or state changes it produces, and what can go wrong.
3. Break compound features into separate testable units — if a single section covers multiple independent actions (e.g. "save and delete templates"), create a separate test case for each action.
4. Map dependencies between features (e.g. "encryption requires a passkey, which requires a previous export").

SCENARIO GUIDE STANDARDS:
Every test case MUST include a Scenario Guide that specifies:
- Required user role or permissions (e.g. "User has 'Medical Records' or 'Super User' permissions")
- System state prerequisites (e.g. "Patient record exists with at least one episode")
- Data prerequisites (e.g. "A previous encrypted export exists for the patient")
- Navigation starting point (e.g. "User is on the Bulk Export page")
Format each precondition as a bullet point starting with "- ". Include 2-4 preconditions per test case. Never leave the Scenario Guide empty or vague.
Do NOT place requirement IDs, reference codes, or identifiers (e.g. REQ-001, FR-12, UC-3) in the Scenario Guide — only human-readable preconditions belong here.

TEST COVERAGE RULES:
- Create one test case per distinct feature or workflow — do NOT combine unrelated features into a single test case.
- Every feature mentioned in the documentation must have at least one test case.
- For features with configuration options (dropdowns, toggles, checkboxes), include a test case that validates each option's behaviour.
- Include at least one negative/validation test case per feature area (e.g. submitting without required fields, invalid inputs, access denied scenarios).
- If the documentation describes a multi-step workflow, create a test case for the full end-to-end flow AND separate test cases for individual steps that can fail independently.

STEP QUALITY RULES:
- Steps may combine related actions when they form a logical sequence (e.g. enter a value AND click a button AND verify the result).
- For each step, describe the FULL expected UI state — not just the immediate result but what the user should see on screen: page layout, section positioning, visible labels, field states, highlighted elements, and exact message text in quotes.
- When a step triggers validation (e.g. mandatory field, character limits), describe the exact error message text in double quotes and the visual indicator (e.g. "field highlights in red with supporting text that reads...").
- When verifying a page or section, list ALL visible elements: headers, sub-labels, input fields, buttons, their labels, and their layout/positioning on the page.
- Include field validation behaviour: minimum/maximum character limits, mandatory field behaviour, accepted character types (alphabetical, special, numerical).
- Use detailed action descriptions: instead of "Enter invalid short name", write "Enter a string shorter than 10 characters in the 'Name of Drug Rule' field".
- Use detailed expected results: instead of "Error message appears", write "The text field will be highlighted in red with a supporting text that reads 'Please enter a minimum of 10 characters'".
- Reference specific UI elements by their exact labels as described in the source documentation.
- Use consistent action verbs: Click, Select, Enter, Navigate to, Verify, Confirm.

OUTPUT DETAIL LEVEL:
- Produce VERBOSE, DETAILED test scripts — more detail is always better than less.
- Expected results should describe the complete UI state after the action, not just a summary.
- When the documentation describes a wizard or multi-section page, describe the layout: which side each section is on, approximate proportions, what each section contains.
- When the documentation specifies exact label text, button text, or error messages, reproduce them exactly in double quotes.
- Include setup/precondition actions as full steps (e.g. "Log into the application as [role], select [location]") not just as metadata.
- A single test case step can verify multiple related things (e.g. "Verify that the page contains: 1. A header labelled '...', 2. An input field labelled '...', 3. A button labelled '...'").

IMPORTANT — DO NOT HALLUCINATE:
- Do NOT invent, fabricate, or assume any information not present in the provided documentation.
- Do NOT generate fake dates, version numbers, system names, URLs, or reference codes (e.g. REQ-001, FR-12, UC-3, ID-xxx). If the source documentation does not contain requirement IDs, do NOT invent them.
- Do NOT include a "generatedAt" timestamp — the application handles this separately.
- If the documentation does not specify a value (e.g. a field length, a timeout, a date), do NOT make one up. Instead, use a placeholder like "[as per documentation]" or "[to be confirmed]".
- Only reference features, fields, screens, tabs, and workflows that are explicitly described in the source documentation.
- If a section is ambiguous, generate the test step but flag it in the Scenario Guide column with "VERIFY: [what needs confirmation]".

DOCUMENT REFERENCE TRACKING:
For each test scenario, identify and record the source document section or page it was derived from.
- If the documentation has named headings or sections, use the heading text as the reference (e.g. "Section 3.2 - Bulk Export" or "Appointment Scheduling").
- If the documentation is structured as numbered pages (e.g. PDF), use the page number(s) as the reference (e.g. "Page 7" or "Pages 7-9").
- If the documentation has no detectable structure, leave documentReference as an empty string "".
- Do NOT invent section names or page numbers — only reference structure explicitly present in the source document.
- Each scenario maps to exactly ONE documentReference value — the section or page it was primarily derived from.`;

// ============================================================
// APPLICATION STATE
// ============================================================

let currentStep = 1;
let rotatingInfoInterval = null;

const wizardData = {
  file: null,
  fileName: "",
  // Headers mode
  sections: [],
  checkboxStates: [],
  // Pages mode
  pages: [],
  pageCheckboxStates: [],
  // Text mode
  rawText: "",
  textSelections: [],
  // Selection state
  selectionMode: "headers", // "headers" | "pages" | "text"
  hasHeadings: false,
  hasPages: false,
  totalPages: 0,
  // Pipeline
  assembledPrompt: "",
  pipelineResult: null,
  pipelineRaw: "",
};

// ============================================================
// DOM REFERENCES
// ============================================================

const stepper = document.getElementById("stepper");
const wizardContent = document.getElementById("wizardContent");
const stepElements = [1, 2, 3, 4, 5].map((n) =>
  document.getElementById("step" + n)
);
const startOverBtn = document.getElementById("startOverBtn");
const helpBtn = document.getElementById("helpBtn");

// ============================================================
// UTILITIES
// ============================================================

function extractJSON(text) {
  if (typeof text !== "string") return null;
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace === -1) return null;

  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.substring(firstBrace, lastBrace + 1));
    } catch {
      /* try next strategy */
    }
  }

  for (const anchor of [
    '{"sections"',
    '{"requirements"',
    '{"testSuite"',
    '{"scenarios"',
  ]) {
    const idx = text.indexOf(anchor);
    if (idx !== -1) {
      try {
        return JSON.parse(text.substring(idx, lastBrace + 1));
      } catch {
        /* continue */
      }
    }
  }

  return null;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatTimestamp() {
  return new Date().toLocaleString();
}

function el(tag, className, textContent) {
  // Buttons created with the legacy .md-btn classes become Material Web
  // Components automatically — the variant is inferred from the md-btn--
  // modifier. Any non-md-btn classes (layout hooks) are preserved, and event
  // wiring (.addEventListener, .disabled, .type) works unchanged on MWC.
  if (tag === "button" && className && className.indexOf("md-btn") !== -1) {
    const isIcon = className.indexOf("md-btn--icon") !== -1;
    const variant =
      className.indexOf("md-btn--outlined") !== -1 ? "md-outlined-button" :
      className.indexOf("md-btn--text")     !== -1 ? "md-text-button" :
      className.indexOf("md-btn--tonal")    !== -1 ? "md-filled-tonal-button" :
      isIcon ? "md-icon-button" :
               "md-filled-button";
    const e = document.createElement(variant);
    const extra = className
      .split(/\s+/)
      .filter((c) => c && c.indexOf("md-btn") !== 0)
      .join(" ");
    if (extra) e.className = extra;
    if (textContent) e.textContent = textContent;
    // A label-bearing MWC button needs its leading icon in slot="icon".
    // The call sites append a Material Symbols <span>; auto-slot it so the
    // icon and label lay out correctly instead of overlapping.
    if (!isIcon) {
      const nativeAppend = e.appendChild.bind(e);
      e.appendChild = (child) => {
        if (child && child.nodeType === 1 && child.classList &&
            child.classList.contains("material-symbols-outlined")) {
          child.setAttribute("slot", "icon");
        }
        return nativeAppend(child);
      };
    }
    return e;
  }
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (textContent) e.textContent = textContent;
  return e;
}

function icon(name, className) {
  const span = document.createElement("span");
  span.className = "material-symbols-outlined" + (className ? " " + className : "");
  span.textContent = name;
  return span;
}

// ============================================================
// TEXT CHUNKING HELPER
// ============================================================

function chunkTextIntoPages(text, targetSize = 3000) {
  const paragraphs = text.split(/\n\s*\n/);
  const pages = [];
  let currentChunk = "";
  let pageNum = 1;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (currentChunk.length > 0 && currentChunk.length + trimmed.length + 2 > targetSize) {
      pages.push({
        pageNum,
        content: currentChunk.trim(),
        charCount: currentChunk.trim().length,
      });
      pageNum++;
      currentChunk = trimmed;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  if (currentChunk.trim().length > 0) {
    pages.push({
      pageNum,
      content: currentChunk.trim(),
      charCount: currentChunk.trim().length,
    });
  }

  return pages;
}

// ============================================================
// NAVIGATION & STEPPER
// ============================================================

function goToStep(n) {
  currentStep = n;

  // Hide all steps
  stepElements.forEach((s) => (s.style.display = "none"));
  // Show target
  stepElements[n - 1].style.display = "";
  // Reset animation
  stepElements[n - 1].style.animation = "none";
  stepElements[n - 1].offsetHeight; // trigger reflow
  stepElements[n - 1].style.animation = "";

  updateStepper();

  // Show/hide Start Over button
  startOverBtn.style.display = n > 1 ? "" : "none";

  // Scroll content area to top
  wizardContent.scrollTop = 0;

  // Render step
  switch (n) {
    case 1: renderStepUpload(); break;
    case 2: renderStepHeaders(); break;
    case 3: renderStepPrompt(); break;
    case 4: renderStepGenerate(); break;
    case 5: renderStepResults(); break;
  }
}

function updateStepper() {
  const steps = stepper.querySelectorAll(".stepper__step");
  const connectors = stepper.querySelectorAll(".stepper__connector");

  steps.forEach((stepEl, i) => {
    const stepNum = i + 1;
    const circleEl = stepEl.querySelector(".stepper__circle");

    stepEl.classList.remove("stepper__step--active", "stepper__step--completed");

    if (stepNum < currentStep) {
      stepEl.classList.add("stepper__step--completed");
      circleEl.innerHTML = "";
      circleEl.appendChild(icon("check"));
    } else if (stepNum === currentStep) {
      stepEl.classList.add("stepper__step--active");
      circleEl.innerHTML = "";
      circleEl.appendChild(icon(STEP_ICONS[i]));
    } else {
      circleEl.innerHTML = "<span>" + stepNum + "</span>";
    }
  });

  connectors.forEach((conn, i) => {
    if (i + 1 < currentStep) {
      conn.classList.add("stepper__connector--completed");
    } else {
      conn.classList.remove("stepper__connector--completed");
    }
  });
}

// ============================================================
// DOCUMENT PARSERS
// ============================================================

async function parseDocxSections(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const doc = new DOMParser().parseFromString(result.value, "text/html");

  const rawText = doc.body.textContent || "";
  const headings = doc.querySelectorAll("h1, h2");
  const hasHeadings = headings.length > 0;

  const sections = [];
  if (hasHeadings) {
    for (let h = 0; h < headings.length; h++) {
      const heading = headings[h];
      const level = heading.tagName === "H1" ? 1 : 2;
      const title = heading.textContent.trim();
      const nextHeading = headings[h + 1] || null;

      let content = "";
      let elNode = heading.nextElementSibling;
      while (elNode && elNode !== nextHeading) {
        content += (elNode.textContent || "") + "\n";
        elNode = elNode.nextElementSibling;
      }
      content = content.trim();
      sections.push({
        level,
        title,
        content,
        charCount: title.length + content.length,
      });
    }
  } else {
    sections.push({
      level: 1,
      title: "Full Document",
      content: rawText,
      charCount: rawText.length,
    });
  }

  // Build page data: synthetic chunks for headerless docs
  const pages = !hasHeadings ? chunkTextIntoPages(rawText) : [];
  const hasPages = pages.length > 1;

  return {
    sections,
    pages,
    rawText,
    hasHeadings,
    hasPages,
    totalPages: pages.length,
  };
}

async function parsePdfSections(file) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pdfPages = [];
  const allHeights = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((item) => item.str.trim().length > 0);
    pdfPages.push({ pageNum: i, items });
    for (const item of items) {
      if (item.height > 0) allHeights.push(item.height);
    }
  }

  // Always build page-level data
  const resultPages = [];
  const rawTextParts = [];
  for (const pg of pdfPages) {
    const pageText = pg.items.map((item) => item.str).join(" ").trim();
    if (pageText.length > 0) {
      resultPages.push({
        pageNum: pg.pageNum,
        content: pageText,
        charCount: pageText.length,
      });
      rawTextParts.push(pageText);
    }
  }
  const rawText = rawTextParts.join("\n\n");

  // Heading detection
  allHeights.sort((a, b) => a - b);
  const median =
    allHeights.length > 0
      ? allHeights[Math.floor(allHeights.length / 2)]
      : 12;

  const h1Threshold = median * 1.6;
  const h2Threshold = median * 1.3;

  const sections = [];
  let currentSection = null;

  for (const pg of pdfPages) {
    for (const item of pg.items) {
      const isH1 = item.height >= h1Threshold;
      const isH2 = !isH1 && item.height >= h2Threshold;

      if (isH1 || isH2) {
        if (currentSection) {
          currentSection.content = currentSection.content.trim();
          currentSection.charCount =
            currentSection.title.length + currentSection.content.length;
          sections.push(currentSection);
        }
        currentSection = {
          level: isH1 ? 1 : 2,
          title: item.str.trim(),
          content: "",
          charCount: 0,
          page: pg.pageNum,
        };
      } else if (currentSection) {
        currentSection.content += item.str + " ";
      }
    }
  }

  if (currentSection) {
    currentSection.content = currentSection.content.trim();
    currentSection.charCount =
      currentSection.title.length + currentSection.content.length;
    sections.push(currentSection);
  }

  const hasHeadings = sections.length > 0;

  // Fallback sections: page-based if no headings detected
  if (!hasHeadings) {
    for (const pg of resultPages) {
      sections.push({
        level: 1,
        title: "Page " + pg.pageNum,
        content: pg.content,
        charCount: ("Page " + pg.pageNum).length + pg.content.length,
        isPage: true,
      });
    }
  }

  return {
    sections,
    pages: resultPages,
    rawText,
    hasHeadings,
    hasPages: resultPages.length > 1,
    totalPages: pdf.numPages,
  };
}

async function parseTxtFile(file) {
  const text = await readFileAsText(file);
  const pages = chunkTextIntoPages(text);
  return {
    sections: [
      { level: 1, title: "Full Document", content: text, charCount: text.length },
    ],
    pages,
    rawText: text,
    hasHeadings: false,
    hasPages: pages.length > 1,
    totalPages: pages.length,
  };
}

async function parseCsvFile(file) {
  const text = await readFileAsText(file);
  const pages = chunkTextIntoPages(text);
  return {
    sections: [
      { level: 1, title: "Full Document", content: text, charCount: text.length },
    ],
    pages,
    rawText: text,
    hasHeadings: false,
    hasPages: pages.length > 1,
    totalPages: pages.length,
  };
}

// ============================================================
// STEP 1: UPLOAD DOCUMENT
// ============================================================

function renderStepUpload() {
  const container = stepElements[0];
  container.innerHTML = "";

  // Title
  container.appendChild(el("h2", "step-title", "Upload Your Document"));
  container.appendChild(
    el(
      "p",
      "step-subtitle",
      "Upload your product documentation to generate comprehensive test scripts."
    )
  );

  // If file already selected (returning from step 2), show file display
  if (wizardData.file) {
    const display = renderFileDisplay();
    container.appendChild(display);

    const continueBtn = el("button", "md-btn md-btn--filled");
    continueBtn.appendChild(icon("arrow_forward"));
    continueBtn.appendChild(document.createTextNode("Continue"));
    continueBtn.addEventListener("click", () => goToStep(2));
    container.appendChild(continueBtn);
    return;
  }

  // Upload card
  const card = el("div", "md-card");

  // Upload zone
  const zone = el("div", "upload-zone");
  zone.id = "uploadZone";

  const zoneIcon = icon("cloud_upload", "upload-zone__icon");
  zone.appendChild(zoneIcon);

  zone.appendChild(el("div", "upload-zone__text", "Drag and drop your document here"));
  zone.appendChild(el("div", "upload-zone__hint", "or click to browse"));

  const browseBtn = el("button", "md-btn md-btn--filled upload-zone__browse-btn");
  browseBtn.type = "button";
  browseBtn.appendChild(icon("upload_file"));
  browseBtn.appendChild(document.createTextNode("Select Document"));
  zone.appendChild(browseBtn);

  // File type badges
  const badges = el("div", "file-type-badges");
  for (const fmt of ["PDF", "Word", "Text", "CSV"]) {
    const badge = el("span", "file-type-badge");
    badge.appendChild(icon("check_circle"));
    badge.appendChild(document.createTextNode(fmt));
    badges.appendChild(badge);
  }
  zone.appendChild(badges);

  card.appendChild(zone);
  container.appendChild(card);

  // Hidden file input
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".txt,.csv,.docx,.pdf";
  fileInput.className = "hidden-file-input";
  fileInput.id = "wizardFileInput";
  container.appendChild(fileInput);

  // Loading container (hidden initially)
  const loadingEl = el("div", "upload-loading");
  loadingEl.id = "uploadLoading";
  loadingEl.style.display = "none";
  loadingEl.appendChild(icon("progress_activity"));
  loadingEl.appendChild(el("span", null, "Analyzing document..."));
  container.appendChild(loadingEl);

  // Error container (hidden initially)
  const errorEl = el("div", "error-banner");
  errorEl.id = "uploadError";
  errorEl.style.display = "none";
  container.appendChild(errorEl);

  // Info card
  const infoCard = el("div", "md-info-card");
  infoCard.style.marginTop = "24px";
  const infoTitle = el("div", null);
  infoTitle.style.fontWeight = "500";
  infoTitle.style.marginBottom = "8px";
  infoTitle.textContent = "How This Tool Works";
  infoCard.appendChild(infoTitle);
  const steps = [
    "Upload your document",
    "Select sections to include",
    "Review the AI prompt",
    "Generate and download test scripts",
  ];
  const ol = document.createElement("ol");
  ol.style.paddingLeft = "20px";
  ol.style.margin = "0";
  for (const s of steps) {
    const li = document.createElement("li");
    li.textContent = s;
    li.style.marginBottom = "4px";
    ol.appendChild(li);
  }
  infoCard.appendChild(ol);
  container.appendChild(infoCard);

  // Event listeners
  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  zone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });

  // Drag and drop
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-active");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-active"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-active");
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });
}

function renderFileDisplay() {
  const display = el("div", "upload-file-display");
  display.appendChild(icon("description", "upload-file-display__icon"));

  const nameEl = el("span", "upload-file-display__name", wizardData.fileName);
  display.appendChild(nameEl);

  if (wizardData.file) {
    display.appendChild(
      el("span", "upload-file-display__size", formatFileSize(wizardData.file.size))
    );
  }

  const removeBtn = el("button", "upload-file-display__remove");
  removeBtn.type = "button";
  removeBtn.title = "Remove file";
  removeBtn.appendChild(icon("close"));
  removeBtn.addEventListener("click", () => {
    wizardData.file = null;
    wizardData.fileName = "";
    wizardData.sections = [];
    wizardData.checkboxStates = [];
    wizardData.pages = [];
    wizardData.pageCheckboxStates = [];
    wizardData.rawText = "";
    wizardData.textSelections = [];
    wizardData.hasHeadings = false;
    wizardData.hasPages = false;
    wizardData.totalPages = 0;
    renderStepUpload();
  });
  display.appendChild(removeBtn);

  return display;
}

async function handleFileSelected(file) {
  const accepted = [".txt", ".csv", ".docx", ".pdf"];
  const name = file.name.toLowerCase();
  if (!accepted.some((ext) => name.endsWith(ext))) {
    showUploadError("Unsupported file type. Please upload a .docx, .pdf, .txt, or .csv file.");
    return;
  }

  wizardData.file = file;
  wizardData.fileName = file.name;

  // Show loading
  const zone = document.getElementById("uploadZone");
  const loading = document.getElementById("uploadLoading");
  if (zone) zone.style.display = "none";
  if (loading) loading.style.display = "";

  try {
    let result;
    if (name.endsWith(".docx")) {
      result = await parseDocxSections(file);
    } else if (name.endsWith(".pdf")) {
      result = await parsePdfSections(file);
    } else if (name.endsWith(".csv")) {
      result = await parseCsvFile(file);
    } else {
      result = await parseTxtFile(file);
    }

    if (result.sections.length === 0 && result.rawText.trim().length === 0) {
      showUploadError("No content could be extracted from the document.");
      return;
    }

    // Unpack parser result into wizardData
    wizardData.sections = result.sections;
    wizardData.checkboxStates = new Array(result.sections.length).fill(false);
    wizardData.pages = result.pages;
    wizardData.pageCheckboxStates = new Array(result.pages.length).fill(false);
    wizardData.rawText = result.rawText;
    wizardData.textSelections = [];
    wizardData.hasHeadings = result.hasHeadings;
    wizardData.hasPages = result.hasPages;
    wizardData.totalPages = result.totalPages;

    // Auto-select default mode
    if (result.hasHeadings) {
      wizardData.selectionMode = "headers";
    } else if (result.hasPages) {
      wizardData.selectionMode = "pages";
    } else {
      wizardData.selectionMode = "text";
    }

    goToStep(2);
  } catch (err) {
    showUploadError("Failed to parse document: " + err.message);
  }
}

function showUploadError(message) {
  const loading = document.getElementById("uploadLoading");
  const zone = document.getElementById("uploadZone");
  const errorEl = document.getElementById("uploadError");
  if (loading) loading.style.display = "none";
  if (zone) zone.style.display = "";
  if (errorEl) {
    errorEl.style.display = "";
    errorEl.innerHTML = "";
    errorEl.appendChild(icon("error"));
    errorEl.appendChild(el("span", null, message));
  }
  wizardData.file = null;
  wizardData.fileName = "";
}

// ============================================================
// STEP 2: SELECT HEADERS
// ============================================================

function renderStepHeaders() {
  const container = stepElements[1];
  container.innerHTML = "";

  container.appendChild(el("h2", "step-title", "Select Content for Testing"));
  container.appendChild(
    el("p", "step-subtitle", "Choose which document content to include in the AI analysis.")
  );

  // Mode toggle bar
  const toggle = el("div", "selection-mode-toggle");
  const modes = [
    { key: "headers", icon: "checklist", label: "Headers", enabled: wizardData.hasHeadings },
    { key: "pages", icon: "auto_stories", label: "Pages", enabled: wizardData.hasPages },
    { key: "text", icon: "text_select_move_forward_word", label: "Text", enabled: true },
  ];

  for (const mode of modes) {
    const btn = document.createElement("button");
    btn.type = "button";
    let cls = "selection-mode-toggle__btn";
    if (wizardData.selectionMode === mode.key) cls += " selection-mode-toggle__btn--active";
    if (!mode.enabled) cls += " selection-mode-toggle__btn--disabled";
    btn.className = cls;
    btn.appendChild(icon(mode.icon));
    btn.appendChild(document.createTextNode(mode.label));
    if (!mode.enabled) {
      btn.title = mode.key === "headers"
        ? "No headings detected in this document"
        : "No page structure available";
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => {
        wizardData.selectionMode = mode.key;
        renderModeContent();
        // Update toggle active states
        toggle.querySelectorAll(".selection-mode-toggle__btn").forEach((b, idx) => {
          b.classList.toggle("selection-mode-toggle__btn--active", modes[idx].key === mode.key);
        });
      });
    }
    toggle.appendChild(btn);
  }
  container.appendChild(toggle);

  // Mode content area
  const contentArea = el("div", "selection-content");
  contentArea.id = "selectionContent";
  container.appendChild(contentArea);

  // Character counter (shared across modes)
  const charCounter = el("div", "headers-char-counter");
  charCounter.id = "headersCharCounter";
  container.appendChild(charCounter);

  // Footer with Back / Continue (shared across modes)
  const footer = el("div", "step-footer");

  const backBtn = el("button", "md-btn md-btn--outlined");
  backBtn.type = "button";
  backBtn.appendChild(icon("arrow_back"));
  backBtn.appendChild(document.createTextNode("Back"));
  backBtn.addEventListener("click", () => goToStep(1));
  footer.appendChild(backBtn);

  const continueBtn = el("button", "md-btn md-btn--filled");
  continueBtn.type = "button";
  continueBtn.id = "headersContinueBtn";
  continueBtn.appendChild(document.createTextNode("Continue"));
  continueBtn.appendChild(icon("arrow_forward"));
  continueBtn.addEventListener("click", () => goToStep(3));
  footer.appendChild(continueBtn);

  container.appendChild(footer);

  // Render initial mode content
  function renderModeContent() {
    const area = document.getElementById("selectionContent");
    if (!area) return;
    area.innerHTML = "";
    if (wizardData.selectionMode === "headers") {
      renderHeadersMode(area);
    } else if (wizardData.selectionMode === "pages") {
      renderPagesMode(area);
    } else {
      renderTextMode(area);
    }
  }

  renderModeContent();
}

// ── Headers Mode (existing logic extracted) ──

function renderHeadersMode(contentEl) {
  // Toolbar
  const toolbar = el("div", "headers-toolbar");

  const counter = el("span", "headers-counter");
  counter.id = "headersCounter";
  toolbar.appendChild(counter);

  const actions = el("div", "headers-toolbar__actions");
  const selectAllBtn = el("button", "md-btn md-btn--text", "Select All");
  selectAllBtn.type = "button";
  const deselectAllBtn = el("button", "md-btn md-btn--text", "Deselect All");
  deselectAllBtn.type = "button";
  actions.appendChild(selectAllBtn);
  actions.appendChild(deselectAllBtn);
  toolbar.appendChild(actions);
  contentEl.appendChild(toolbar);

  // Header list
  const list = el("div", "header-list");
  const checkboxes = [];

  for (let i = 0; i < wizardData.sections.length; i++) {
    const sec = wizardData.sections[i];
    const isH1 = sec.level === 1 && !sec.isPage;
    const isPage = sec.isPage;

    const item = document.createElement("label");
    item.className = "header-item" +
      (sec.level === 2 ? " header-item--h2" : "") +
      (isH1 ? " header-item--h1" : "") +
      (wizardData.checkboxStates[i] ? " header-item--selected" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = wizardData.checkboxStates[i];
    cb.dataset.index = i;
    checkboxes.push(cb);
    item.appendChild(cb);

    item.appendChild(icon("tag", "header-item__icon"));

    const label = el("span", "header-item__label", sec.title);
    item.appendChild(label);

    // Badge
    const badgeClass = isPage
      ? "header-badge header-badge--page"
      : isH1
        ? "header-badge header-badge--h1"
        : "header-badge header-badge--h2";
    const badgeText = isPage ? "Page" : isH1 ? "H1" : "H2";
    item.appendChild(el("span", badgeClass, badgeText));

    // Char count
    item.appendChild(
      el("span", "header-item__chars", sec.charCount.toLocaleString() + " chars")
    );

    list.appendChild(item);
  }

  contentEl.appendChild(list);

  // Event handlers
  function update() {
    for (let i = 0; i < checkboxes.length; i++) {
      wizardData.checkboxStates[i] = checkboxes[i].checked;
      const item = checkboxes[i].closest(".header-item");
      if (item) {
        item.classList.toggle("header-item--selected", checkboxes[i].checked);
      }
    }
    updateSelectionCounter();
  }

  for (let i = 0; i < checkboxes.length; i++) {
    checkboxes[i].addEventListener("change", () => {
      // H1 auto-select children
      if (
        wizardData.sections[i].level === 1 &&
        !wizardData.sections[i].isPage
      ) {
        const checked = checkboxes[i].checked;
        const childIndices = getChildH2Indices(i);
        for (const ci of childIndices) {
          checkboxes[ci].checked = checked;
        }
      }
      update();
    });
  }

  selectAllBtn.addEventListener("click", () => {
    checkboxes.forEach((cb) => (cb.checked = true));
    update();
  });

  deselectAllBtn.addEventListener("click", () => {
    checkboxes.forEach((cb) => (cb.checked = false));
    update();
  });

  updateSelectionCounter();
}

// ── Pages Mode ──

function renderPagesMode(contentEl) {
  // Page range selector
  const rangeBar = el("div", "page-range-selector");
  rangeBar.appendChild(el("span", "page-range-selector__label", "From page"));

  const fromInput = document.createElement("input");
  fromInput.type = "number";
  fromInput.className = "page-range-selector__input";
  fromInput.min = 1;
  fromInput.max = wizardData.totalPages;
  fromInput.value = 1;
  rangeBar.appendChild(fromInput);

  rangeBar.appendChild(el("span", "page-range-selector__label", "to"));

  const toInput = document.createElement("input");
  toInput.type = "number";
  toInput.className = "page-range-selector__input";
  toInput.min = 1;
  toInput.max = wizardData.totalPages;
  toInput.value = wizardData.totalPages;
  rangeBar.appendChild(toInput);

  const rangeBtn = el("button", "md-btn md-btn--tonal", "Select Range");
  rangeBtn.type = "button";
  rangeBtn.appendChild(icon("select_all"));
  rangeBar.appendChild(rangeBtn);
  contentEl.appendChild(rangeBar);

  // Toolbar
  const toolbar = el("div", "headers-toolbar");

  const counter = el("span", "headers-counter");
  counter.id = "pagesCounter";
  toolbar.appendChild(counter);

  const actions = el("div", "headers-toolbar__actions");
  const selectAllBtn = el("button", "md-btn md-btn--text", "Select All");
  selectAllBtn.type = "button";
  const deselectAllBtn = el("button", "md-btn md-btn--text", "Deselect All");
  deselectAllBtn.type = "button";
  actions.appendChild(selectAllBtn);
  actions.appendChild(deselectAllBtn);
  toolbar.appendChild(actions);
  contentEl.appendChild(toolbar);

  // Page list
  const list = el("div", "header-list");
  const checkboxes = [];

  for (let i = 0; i < wizardData.pages.length; i++) {
    const pg = wizardData.pages[i];

    const item = document.createElement("label");
    item.className = "header-item" +
      (wizardData.pageCheckboxStates[i] ? " header-item--selected" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = wizardData.pageCheckboxStates[i];
    cb.dataset.index = i;
    checkboxes.push(cb);
    item.appendChild(cb);

    item.appendChild(icon("article", "header-item__icon"));

    const label = el("span", "header-item__label", "Page " + pg.pageNum);
    item.appendChild(label);

    item.appendChild(el("span", "header-badge header-badge--page", "Page"));
    item.appendChild(
      el("span", "header-item__chars", pg.charCount.toLocaleString() + " chars")
    );

    list.appendChild(item);
  }

  contentEl.appendChild(list);

  // Event handlers
  function update() {
    for (let i = 0; i < checkboxes.length; i++) {
      wizardData.pageCheckboxStates[i] = checkboxes[i].checked;
      const item = checkboxes[i].closest(".header-item");
      if (item) {
        item.classList.toggle("header-item--selected", checkboxes[i].checked);
      }
    }
    updateSelectionCounter();
  }

  for (let i = 0; i < checkboxes.length; i++) {
    checkboxes[i].addEventListener("change", () => update());
  }

  rangeBtn.addEventListener("click", () => {
    const from = Math.max(1, Math.min(parseInt(fromInput.value) || 1, wizardData.totalPages));
    const to = Math.max(from, Math.min(parseInt(toInput.value) || wizardData.totalPages, wizardData.totalPages));
    for (let i = 0; i < wizardData.pages.length; i++) {
      const pn = wizardData.pages[i].pageNum;
      if (pn >= from && pn <= to) {
        checkboxes[i].checked = true;
      }
    }
    update();
  });

  selectAllBtn.addEventListener("click", () => {
    checkboxes.forEach((cb) => (cb.checked = true));
    update();
  });

  deselectAllBtn.addEventListener("click", () => {
    checkboxes.forEach((cb) => (cb.checked = false));
    update();
  });

  updateSelectionCounter();
}

// ── Text Selection Mode (Free-Form Highlighting) ──

function renderTextMode(contentEl) {
  // Instruction
  contentEl.appendChild(
    el("p", "step-subtitle", "Highlight text in the document below, then click Add Selection to capture it.")
  );

  // Action bar
  const actionBar = el("div", "text-selection-actions");

  const addBtn = el("button", "md-btn md-btn--tonal text-selection-actions__add");
  addBtn.type = "button";
  addBtn.id = "textAddSelectionBtn";
  addBtn.appendChild(icon("add"));
  addBtn.appendChild(document.createTextNode("Add Selection"));
  addBtn.disabled = true;
  actionBar.appendChild(addBtn);

  const clearBtn = el("button", "md-btn md-btn--text");
  clearBtn.type = "button";
  clearBtn.appendChild(icon("delete_sweep"));
  clearBtn.appendChild(document.createTextNode("Clear All"));
  actionBar.appendChild(clearBtn);

  contentEl.appendChild(actionBar);

  // Text display area
  const displayArea = el("div", "text-display-area");
  displayArea.id = "textDisplayArea";
  renderHighlightedText(displayArea);
  contentEl.appendChild(displayArea);

  // Selections summary
  const summaryArea = el("div", "text-selections-summary");
  summaryArea.id = "textSelectionsSummary";
  renderSelectionsSummary(summaryArea);
  contentEl.appendChild(summaryArea);

  // Listen for text selection in the display area
  function checkForSelection() {
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed &&
      displayArea.contains(sel.anchorNode) &&
      displayArea.contains(sel.focusNode);
    addBtn.disabled = !hasSelection;
  }

  document.addEventListener("selectionchange", checkForSelection);

  // Clean up listener when step is left (next render will overwrite)
  const observer = new MutationObserver(() => {
    if (!document.getElementById("textDisplayArea")) {
      document.removeEventListener("selectionchange", checkForSelection);
      observer.disconnect();
    }
  });
  observer.observe(stepElements[1], { childList: true, subtree: true });

  // Add Selection handler
  addBtn.addEventListener("click", () => {
    const offsets = getSelectionOffsets(displayArea);
    if (!offsets) return;
    wizardData.textSelections.push(offsets);
    wizardData.textSelections = mergeRanges(wizardData.textSelections);
    window.getSelection().removeAllRanges();
    addBtn.disabled = true;
    renderHighlightedText(displayArea);
    renderSelectionsSummary(document.getElementById("textSelectionsSummary"));
    updateSelectionCounter();
  });

  // Clear All handler
  clearBtn.addEventListener("click", () => {
    wizardData.textSelections = [];
    renderHighlightedText(displayArea);
    renderSelectionsSummary(document.getElementById("textSelectionsSummary"));
    updateSelectionCounter();
  });

  updateSelectionCounter();
}

// ── Text Mode Helpers ──

function getSelectionOffsets(displayArea) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);

  function calcOffset(node, offsetInNode) {
    // Walk up to find nearest [data-offset] paragraph
    let current = node;
    while (current && current !== displayArea) {
      if (current.dataset && current.dataset.offset !== undefined) {
        // Found the paragraph — now count characters up to offsetInNode
        const paraOffset = parseInt(current.dataset.offset, 10);
        // If the node is a text node inside the paragraph, walk children to find position
        let charPos = 0;
        const walker = document.createTreeWalker(current, NodeFilter.SHOW_TEXT, null);
        let textNode;
        while ((textNode = walker.nextNode())) {
          if (textNode === node) {
            return paraOffset + charPos + offsetInNode;
          }
          charPos += textNode.textContent.length;
        }
        // Fallback: just use the offset
        return paraOffset + offsetInNode;
      }
      current = current.parentElement;
    }
    return null;
  }

  const start = calcOffset(range.startContainer, range.startOffset);
  const end = calcOffset(range.endContainer, range.endOffset);
  if (start === null || end === null || start === end) return null;

  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function mergeRanges(ranges) {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

function renderHighlightedText(displayArea) {
  displayArea.innerHTML = "";
  const rawText = wizardData.rawText;
  if (!rawText) return;

  const paragraphs = rawText.split(/\n\s*\n/);
  let offset = 0;

  for (const para of paragraphs) {
    // Track the actual position including the delimiter
    const idx = rawText.indexOf(para, offset);
    const paraStart = idx >= 0 ? idx : offset;
    const paraEnd = paraStart + para.length;

    const p = document.createElement("p");
    p.className = "text-display-para";
    p.dataset.offset = paraStart;

    // Check if any selections overlap this paragraph
    const overlapping = wizardData.textSelections.filter(
      (r) => r.start < paraEnd && r.end > paraStart
    );

    if (overlapping.length === 0) {
      p.textContent = para;
    } else {
      // Build segments: unhighlighted + highlighted
      let cursor = paraStart;
      for (const r of overlapping) {
        const hlStart = Math.max(r.start, paraStart) - paraStart;
        const hlEnd = Math.min(r.end, paraEnd) - paraStart;
        const beforeStart = cursor - paraStart;

        if (hlStart > beforeStart) {
          const textSpan = document.createTextNode(para.slice(beforeStart, hlStart));
          p.appendChild(textSpan);
        }

        const mark = document.createElement("mark");
        mark.className = "text-highlight";
        mark.textContent = para.slice(hlStart, hlEnd);
        p.appendChild(mark);

        cursor = paraStart + hlEnd;
      }

      // Remaining text after last highlight
      const remaining = cursor - paraStart;
      if (remaining < para.length) {
        p.appendChild(document.createTextNode(para.slice(remaining)));
      }
    }

    displayArea.appendChild(p);
    offset = paraEnd;
  }
}

function renderSelectionsSummary(summaryEl) {
  if (!summaryEl) return;
  summaryEl.innerHTML = "";

  if (wizardData.textSelections.length === 0) {
    summaryEl.appendChild(
      el("p", "text-selections-empty", "No text selected. Highlight text above and click Add Selection.")
    );
    return;
  }

  const totalChars = wizardData.textSelections.reduce((sum, r) => sum + (r.end - r.start), 0);
  summaryEl.appendChild(
    el("p", "text-selections-count",
      wizardData.textSelections.length + " selection" +
      (wizardData.textSelections.length > 1 ? "s" : "") +
      " (" + totalChars.toLocaleString() + " chars)")
  );

  const chipList = el("div", "text-selection-chips");
  for (let i = 0; i < wizardData.textSelections.length; i++) {
    const r = wizardData.textSelections[i];
    const preview = wizardData.rawText.slice(r.start, Math.min(r.end, r.start + 50));
    const charCount = r.end - r.start;

    const chip = el("div", "text-selection-chip");
    chip.appendChild(el("span", "text-selection-chip__preview",
      preview + (charCount > 50 ? "…" : "")));
    chip.appendChild(el("span", "text-selection-chip__chars",
      charCount.toLocaleString() + " chars"));

    const removeBtn = el("button", "text-selection-chip__remove");
    removeBtn.type = "button";
    removeBtn.title = "Remove selection";
    removeBtn.appendChild(icon("close"));
    removeBtn.addEventListener("click", () => {
      wizardData.textSelections.splice(i, 1);
      const displayArea = document.getElementById("textDisplayArea");
      if (displayArea) renderHighlightedText(displayArea);
      renderSelectionsSummary(summaryEl);
      updateSelectionCounter();
    });
    chip.appendChild(removeBtn);

    chipList.appendChild(chip);
  }
  summaryEl.appendChild(chipList);
}

function getChildH2Indices(h1Index) {
  const indices = [];
  for (let i = h1Index + 1; i < wizardData.sections.length; i++) {
    if (wizardData.sections[i].level === 1) break;
    if (wizardData.sections[i].level === 2) indices.push(i);
  }
  return indices;
}

function updateSelectionCounter() {
  const charCounterEl = document.getElementById("headersCharCounter");
  const continueBtn = document.getElementById("headersContinueBtn");

  let selectedCount = 0;
  let totalChars = 0;
  let total = 0;
  let unitLabel = "items";

  if (wizardData.selectionMode === "headers") {
    total = wizardData.sections.length;
    unitLabel = "headers";
    for (let i = 0; i < wizardData.checkboxStates.length; i++) {
      if (wizardData.checkboxStates[i]) {
        selectedCount++;
        totalChars += wizardData.sections[i].charCount;
      }
    }
    const counterEl = document.getElementById("headersCounter");
    if (counterEl) {
      counterEl.textContent = selectedCount + " of " + total + " headers selected";
    }
  } else if (wizardData.selectionMode === "pages") {
    total = wizardData.pages.length;
    unitLabel = "pages";
    for (let i = 0; i < wizardData.pageCheckboxStates.length; i++) {
      if (wizardData.pageCheckboxStates[i]) {
        selectedCount++;
        totalChars += wizardData.pages[i].charCount;
      }
    }
    const counterEl = document.getElementById("pagesCounter");
    if (counterEl) {
      counterEl.textContent = selectedCount + " of " + total + " pages selected";
    }
  } else if (wizardData.selectionMode === "text") {
    selectedCount = wizardData.textSelections.length;
    totalChars = wizardData.textSelections.reduce((sum, r) => sum + (r.end - r.start), 0);
  }

  const isOver = totalChars > CHAR_LIMIT;
  if (charCounterEl) {
    charCounterEl.textContent =
      "Characters selected: " +
      totalChars.toLocaleString() +
      " / " +
      CHAR_LIMIT.toLocaleString();
    charCounterEl.className =
      "headers-char-counter" + (isOver ? " headers-char-counter--over" : "");
  }

  if (continueBtn) {
    continueBtn.disabled = selectedCount === 0 || isOver;
  }
}

// ============================================================
// STEP 3: EDIT MISSION PROMPT
// ============================================================

function assemblePrompt() {
  let prompt = SYSTEM_PROMPT + "\n\n";
  prompt += "=== DOCUMENT: " + wizardData.fileName + " ===\n\n";

  if (wizardData.selectionMode === "headers") {
    // Section hierarchy listing
    prompt += "DOCUMENT SECTIONS:\n";
    for (let i = 0; i < wizardData.sections.length; i++) {
      if (wizardData.checkboxStates[i]) {
        const sec = wizardData.sections[i];
        const indent = sec.level === 2 ? "  " : "";
        const tag = sec.level === 1 ? "H1" : "H2";
        prompt += indent + "- [" + tag + "] " + sec.title + "\n";
      }
    }
    prompt += "\n";

    // Selected section content
    for (let i = 0; i < wizardData.sections.length; i++) {
      if (wizardData.checkboxStates[i]) {
        const sec = wizardData.sections[i];
        const pageLabel = sec.page ? " (Page " + sec.page + ")" : "";
        prompt += "=== Section: " + sec.title + pageLabel + " ===\n";
        prompt += sec.content + "\n\n";
      }
    }
  } else if (wizardData.selectionMode === "pages") {
    // Page listing
    prompt += "SELECTED PAGES:\n";
    for (let i = 0; i < wizardData.pages.length; i++) {
      if (wizardData.pageCheckboxStates[i]) {
        prompt += "- Page " + wizardData.pages[i].pageNum + "\n";
      }
    }
    prompt += "\n";

    // Selected page content
    for (let i = 0; i < wizardData.pages.length; i++) {
      if (wizardData.pageCheckboxStates[i]) {
        const pg = wizardData.pages[i];
        prompt += "=== Page " + pg.pageNum + " ===\n";
        prompt += pg.content + "\n\n";
      }
    }
  } else if (wizardData.selectionMode === "text") {
    // Free-form text selections
    prompt += "SELECTED TEXT:\n\n";
    const sorted = [...wizardData.textSelections].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      prompt += wizardData.rawText.slice(r.start, r.end) + "\n\n";
    }
  }

  wizardData.assembledPrompt = prompt.trim();
}

function renderStepPrompt() {
  assemblePrompt();

  const container = stepElements[2];
  container.innerHTML = "";

  container.appendChild(el("h2", "step-title", "Edit Mission Prompt"));
  container.appendChild(
    el(
      "p",
      "step-subtitle",
      "Review the prompt that will be sent to the AI pipeline. You can edit it if needed."
    )
  );

  // Toggle group
  const toggle = el("div", "prompt-toggle");

  const editBtn = el("button", "prompt-toggle__btn");
  editBtn.type = "button";
  editBtn.appendChild(icon("edit"));
  editBtn.appendChild(document.createTextNode("Edit"));

  const previewBtn = el("button", "prompt-toggle__btn prompt-toggle__btn--active");
  previewBtn.type = "button";
  previewBtn.appendChild(icon("visibility"));
  previewBtn.appendChild(document.createTextNode("Preview"));

  toggle.appendChild(editBtn);
  toggle.appendChild(previewBtn);
  container.appendChild(toggle);

  // Edit warning (hidden initially)
  const warning = el("div", "edit-warning");
  warning.id = "editWarning";
  warning.style.display = "none";
  warning.appendChild(icon("warning"));
  warning.appendChild(
    el(
      "span",
      null,
      "Caution: Editing the prompt may affect the quality and structure of generated test scripts. Make sure changes align with the expected format."
    )
  );
  container.appendChild(warning);

  // Preview (shown by default)
  const preview = document.createElement("pre");
  preview.className = "prompt-preview";
  preview.id = "promptPreview";
  preview.textContent = wizardData.assembledPrompt;
  container.appendChild(preview);

  // Editor (hidden by default)
  const editor = document.createElement("textarea");
  editor.className = "prompt-editor";
  editor.id = "promptEditor";
  editor.value = wizardData.assembledPrompt;
  editor.style.display = "none";
  container.appendChild(editor);

  // Stats
  const stats = el("div", "prompt-stats");
  stats.id = "promptStats";
  container.appendChild(stats);
  updatePromptStats(wizardData.assembledPrompt);

  // Tips info card
  const tips = el("div", "md-info-card");
  tips.style.marginTop = "16px";
  const tipsIcon = icon("lightbulb");
  tipsIcon.style.color = "var(--md-sys-color-warning)";
  tipsIcon.style.marginRight = "8px";
  tipsIcon.style.verticalAlign = "middle";
  const tipsTitle = el("div", null);
  tipsTitle.style.fontWeight = "500";
  tipsTitle.style.marginBottom = "8px";
  tipsTitle.appendChild(tipsIcon);
  tipsTitle.appendChild(document.createTextNode("Tips for Better Test Scripts"));
  tips.appendChild(tipsTitle);
  const tipsList = document.createElement("ul");
  tipsList.style.paddingLeft = "20px";
  tipsList.style.margin = "0";
  for (const tip of [
    "Be specific about test scope and focus areas",
    "Include relevant context about user roles and permissions",
    "Mention specific field validations or business rules",
  ]) {
    const li = document.createElement("li");
    li.textContent = tip;
    li.style.marginBottom = "4px";
    li.style.fontSize = "13px";
    tipsList.appendChild(li);
  }
  tips.appendChild(tipsList);
  container.appendChild(tips);

  // Footer
  const footer = el("div", "step-footer");

  const backBtn = el("button", "md-btn md-btn--outlined");
  backBtn.type = "button";
  backBtn.appendChild(icon("arrow_back"));
  backBtn.appendChild(document.createTextNode("Back to Selection"));
  backBtn.addEventListener("click", () => goToStep(2));
  footer.appendChild(backBtn);

  const generateBtn = el("button", "md-btn md-btn--filled");
  generateBtn.type = "button";
  generateBtn.appendChild(icon("play_circle"));
  generateBtn.appendChild(document.createTextNode("Generate Tests"));
  generateBtn.addEventListener("click", () => {
    // Save any edits
    const ed = document.getElementById("promptEditor");
    if (ed) wizardData.assembledPrompt = ed.value;
    goToStep(4);
  });
  footer.appendChild(generateBtn);

  container.appendChild(footer);

  // Toggle handlers
  let isEditMode = false;

  editBtn.addEventListener("click", () => {
    isEditMode = true;
    editBtn.classList.add("prompt-toggle__btn--active");
    previewBtn.classList.remove("prompt-toggle__btn--active");
    preview.style.display = "none";
    editor.style.display = "";
    warning.style.display = "";
    editor.value = wizardData.assembledPrompt;
  });

  previewBtn.addEventListener("click", () => {
    isEditMode = false;
    previewBtn.classList.add("prompt-toggle__btn--active");
    editBtn.classList.remove("prompt-toggle__btn--active");
    editor.style.display = "none";
    preview.style.display = "";
    warning.style.display = "none";
    wizardData.assembledPrompt = editor.value;
    preview.textContent = wizardData.assembledPrompt;
    updatePromptStats(wizardData.assembledPrompt);
  });

  editor.addEventListener("input", () => {
    wizardData.assembledPrompt = editor.value;
    updatePromptStats(editor.value);
  });
}

function updatePromptStats(text) {
  const statsEl = document.getElementById("promptStats");
  if (!statsEl) return;
  const lines = text.split("\n").length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  statsEl.textContent =
    lines + " lines  \u00b7  " + words.toLocaleString() + " words  \u00b7  " + chars.toLocaleString() + " chars";
}

// ============================================================
// STEP 4: GENERATE TESTS
// ============================================================

const PIPELINE_INFO_MESSAGES = [
  "Note: The more data and missions in your document, the longer review and validation may take.",
  "Tip: Complex documents with many scenarios will produce more thorough — and detailed — test scripts.",
  "Each mission is validated independently to ensure accuracy and full coverage.",
  "The AI is analysing your document's structure, scenarios, and edge cases in parallel.",
  "Larger documents with rich data models may require extra processing time — this is expected.",
  "Tip: Once generated, review your test scripts carefully; complex business rules may benefit from manual refinement.",
  "The pipeline works through each mission sequentially, building on previous results for consistency.",
  "Documents with multiple roles, permissions, or workflows may extend processing time.",
];

function startRotatingInfo() {
  clearInterval(rotatingInfoInterval);
  const infoEl = document.getElementById("rotatingInfo");
  if (!infoEl) return;

  let index = 0;

  function showMessage() {
    infoEl.classList.remove("rotating-info--visible");
    setTimeout(() => {
      infoEl.textContent = PIPELINE_INFO_MESSAGES[index];
      infoEl.classList.add("rotating-info--visible");
      index = (index + 1) % PIPELINE_INFO_MESSAGES.length;
    }, 400);
  }

  showMessage();
  rotatingInfoInterval = setInterval(showMessage, 7000);
}

function stopRotatingInfo() {
  clearInterval(rotatingInfoInterval);
  rotatingInfoInterval = null;
}

function renderStepGenerate() {
  const container = stepElements[3];
  container.innerHTML = "";

  const wrapper = el("div", "generate-container");

  wrapper.appendChild(icon("progress_activity", "generate-spinner"));
  wrapper.appendChild(el("div", "generate-title", "Generating Test Scripts"));
  wrapper.appendChild(
    el("div", "generate-subtitle", "Processing your document through the AI pipeline...")
  );

  const rotatingInfo = el("div", "rotating-info");
  rotatingInfo.id = "rotatingInfo";
  wrapper.appendChild(rotatingInfo);

  // Progress section
  const progSection = el("div", "progress-section");

  const progHeader = el("div", "progress-header");
  progHeader.appendChild(el("span", null, "Overall Progress"));
  const pctEl = el("span", null, "0%");
  pctEl.id = "progressPct";
  progHeader.appendChild(pctEl);
  progSection.appendChild(progHeader);

  const progBar = el("div", "progress-bar");
  const progFill = el("div", "progress-bar__fill");
  progFill.id = "progressFill";
  progBar.appendChild(progFill);
  progSection.appendChild(progBar);

  // Pipeline steps
  const stepsContainer = el("div", "pipeline-steps");
  stepsContainer.id = "pipelineSteps";

  for (let i = 0; i < MISSION_NAMES.length; i++) {
    const step = el("div", "pipeline-step pipeline-step--pending");
    step.id = "pipelineStep" + (i + 1);

    const stepIcon = icon("radio_button_unchecked", "pipeline-step__icon");
    step.appendChild(stepIcon);

    const info = el("div", "pipeline-step__info");
    info.appendChild(el("div", "pipeline-step__name", "Step " + (i + 1) + ": " + MISSION_NAMES[i]));
    info.appendChild(el("div", "pipeline-step__desc", MISSION_DESCRIPTIONS[i]));
    step.appendChild(info);

    const status = el("span", "pipeline-step__status");
    step.appendChild(status);

    stepsContainer.appendChild(step);
  }

  progSection.appendChild(stepsContainer);
  wrapper.appendChild(progSection);

  wrapper.appendChild(
    el("div", "generate-hint", "This process typically takes 2\u20135 minutes depending on document size.")
  );

  container.appendChild(wrapper);

  // Start rotating informational messages and pipeline
  startRotatingInfo();
  runPipeline();
}

async function runPipeline() {
  try {
    const token = await window.auth.getToken();
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": "Bearer " + token } : {}),
      },
      body: JSON.stringify({ input: wizardData.assembledPrompt }),
    });

    if (res.status === 401) {
      showGenerateError(
        "Your session has expired. Please refresh the page and sign in again to continue."
      );
      return;
    }

    if (!res.ok) {
      throw new Error("HTTP error! status: " + res.status);
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      await consumeSSEStream(res);
    } else {
      // Plain JSON fallback (Lambda)
      const data = await res.json();
      const result = data.result || data.output || data.outputText;
      for (let s = 1; s <= 4; s++) {
        updatePipelineStep(s, "completed");
      }
      updateProgressBar(4, "completed");
      if (result) {
        wizardData.pipelineResult = result;
        wizardData.pipelineRaw =
          typeof result === "object" ? JSON.stringify(result, null, 2) : result;
        goToStep(5);
      } else {
        showGenerateError("No response received from pipeline.");
      }
    }
  } catch (err) {
    console.error("Pipeline error:", err);
    showGenerateError("Could not connect to the server. " + err.message);
  }
}

async function consumeSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const dataStr = line.slice(6);
        try {
          const data = JSON.parse(dataStr);
          handleSSEEvent(eventName, data);
        } catch (e) {
          console.error("Failed to parse SSE data:", dataStr);
        }
        eventName = null;
      }
    }
  }
}

function handleSSEEvent(eventName, data) {
  if (eventName === "progress") {
    updatePipelineStep(data.step, data.status);
    updateProgressBar(data.step, data.status);
  } else if (eventName === "complete") {
    stopRotatingInfo();
    let result = data.result;
    if (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch {
        result = extractJSON(result) || result;
      }
    }
    wizardData.pipelineResult = result;
    wizardData.pipelineRaw =
      typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
    goToStep(5);
  } else if (eventName === "error") {
    stopRotatingInfo();
    showGenerateError(data.error);
  }
}

function updatePipelineStep(step, status) {
  const stepEl = document.getElementById("pipelineStep" + step);
  if (!stepEl) return;

  const iconEl = stepEl.querySelector(".pipeline-step__icon");
  const statusEl = stepEl.querySelector(".pipeline-step__status");

  stepEl.className = "pipeline-step pipeline-step--" + status;

  if (status === "running") {
    iconEl.textContent = "progress_activity";
    statusEl.textContent = "Processing...";
  } else if (status === "completed") {
    iconEl.textContent = "check_circle";
    statusEl.textContent = "Completed";
  }
}

function updateProgressBar(step, status) {
  // Map step + status to percentage
  const progressMap = {
    "1-running": 12,
    "1-completed": 25,
    "2-running": 37,
    "2-completed": 50,
    "3-running": 62,
    "3-completed": 75,
    "4-running": 87,
    "4-completed": 100,
  };

  const pct = progressMap[step + "-" + status] || 0;
  const fill = document.getElementById("progressFill");
  const pctEl = document.getElementById("progressPct");

  if (fill) fill.style.width = pct + "%";
  if (pctEl) pctEl.textContent = pct + "%";
}

function showGenerateError(message) {
  const container = stepElements[3];
  // Hide spinner
  const spinner = container.querySelector(".generate-spinner");
  if (spinner) spinner.style.display = "none";

  const errorCard = el("div", "generate-error");

  const title = el("div", "generate-error__title");
  title.appendChild(icon("error"));
  title.appendChild(document.createTextNode("Generation Failed"));
  errorCard.appendChild(title);

  errorCard.appendChild(el("div", "generate-error__message", message));

  const actions = el("div", "generate-error__actions");

  const retryBtn = el("button", "md-btn md-btn--filled");
  retryBtn.type = "button";
  retryBtn.appendChild(icon("refresh"));
  retryBtn.appendChild(document.createTextNode("Retry"));
  retryBtn.addEventListener("click", () => renderStepGenerate());
  actions.appendChild(retryBtn);

  const backBtn = el("button", "md-btn md-btn--outlined");
  backBtn.type = "button";
  backBtn.appendChild(icon("arrow_back"));
  backBtn.appendChild(document.createTextNode("Back to Prompt"));
  backBtn.addEventListener("click", () => goToStep(3));
  actions.appendChild(backBtn);

  errorCard.appendChild(actions);
  container.appendChild(errorCard);
}

// ============================================================
// STEP 5: VIEW RESULTS
// ============================================================

function renderStepResults() {
  const container = stepElements[4];
  container.innerHTML = "";

  let data = wizardData.pipelineResult;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = extractJSON(data) || data;
    }
  }

  // If data doesn't have the expected shape, fall back
  if (!data || !data.scenarios || !Array.isArray(data.scenarios)) {
    renderResultsFallback(container);
    return;
  }

  // Add generatedAt if not present
  if (!data.generatedAt) {
    data.generatedAt = new Date().toISOString();
  }

  // Toolbar
  const toolbar = el("div", "results-toolbar");

  const titleDiv = el("div");
  const titleMain = el("div", "results-toolbar__title");
  titleMain.appendChild(icon("task_alt"));
  titleMain.appendChild(document.createTextNode("Test Cases Generated"));
  titleDiv.appendChild(titleMain);
  const subtitle = el("small", null, data.scenarios.length + " test cases ready for review");
  titleDiv.appendChild(subtitle);
  toolbar.appendChild(titleDiv);

  const actions = el("div", "results-toolbar__actions");

  const excelBtn = el("button", "md-btn md-btn--tonal");
  excelBtn.type = "button";
  excelBtn.appendChild(icon("download"));
  excelBtn.appendChild(document.createTextNode("Export Excel"));
  excelBtn.addEventListener("click", () => generateExcelDownload(data));
  actions.appendChild(excelBtn);

  const azdoBtn = el("button", "md-btn md-btn--tonal");
  azdoBtn.type = "button";
  azdoBtn.appendChild(icon("integration_instructions"));
  azdoBtn.appendChild(document.createTextNode("Export AZDO"));
  azdoBtn.addEventListener("click", () => generateAzdoExport(data));
  actions.appendChild(azdoBtn);

  const regenBtn = el("button", "md-btn md-btn--outlined");
  regenBtn.type = "button";
  regenBtn.appendChild(icon("refresh"));
  regenBtn.appendChild(document.createTextNode("Regenerate"));
  regenBtn.addEventListener("click", regenerate);
  actions.appendChild(regenBtn);

  const startOverBtnResult = el("button", "md-btn md-btn--text");
  startOverBtnResult.type = "button";
  startOverBtnResult.appendChild(icon("restart_alt"));
  startOverBtnResult.appendChild(document.createTextNode("Start Over"));
  startOverBtnResult.addEventListener("click", startOver);
  actions.appendChild(startOverBtnResult);

  toolbar.appendChild(actions);
  container.appendChild(toolbar);

  // Results header
  const header = el("div", "results-header");
  header.appendChild(el("div", "results-header__suite", data.testSuite || "Test Suite"));
  if (data.generatedAt) {
    header.appendChild(
      el(
        "div",
        "results-header__date",
        "Generated: " + new Date(data.generatedAt).toLocaleString()
      )
    );
  }
  container.appendChild(header);

  // Scenario cards
  for (const scenario of data.scenarios) {
    container.appendChild(buildScenarioCard(scenario));
  }

  // Raw JSON toggle
  const toggleBtn = el("button", "raw-json-toggle");
  const toggleText = document.createTextNode("Show raw JSON ");
  const toggleArrow = el("span", "raw-json-toggle__arrow", "\u25BC");
  toggleBtn.appendChild(toggleText);
  toggleBtn.appendChild(toggleArrow);

  const collapsible = el("div", "json-result-collapsible");
  const jsonPre = el("pre", "json-result", wizardData.pipelineRaw);
  collapsible.appendChild(jsonPre);

  toggleBtn.addEventListener("click", () => {
    const isOpen = collapsible.classList.toggle("json-result-collapsible--open");
    toggleBtn.classList.toggle("raw-json-toggle--open", isOpen);
    toggleText.textContent = isOpen ? "Hide raw JSON " : "Show raw JSON ";
  });

  container.appendChild(toggleBtn);
  container.appendChild(collapsible);

  // Info card
  const infoCard = el("div", "md-info-card results-info");
  const infoTitle = el("div", null);
  infoTitle.style.fontWeight = "500";
  infoTitle.style.marginBottom = "8px";
  infoTitle.textContent = "How to use this table";
  infoCard.appendChild(infoTitle);
  const infoText = el("p", null);
  infoText.style.fontSize = "13px";
  infoText.style.margin = "0";
  infoText.textContent =
    "Each scenario card contains a test table. The 'Document Reference' badge in each scenario header shows which section or page of the source document the test was derived from. The 'Scenario (GUIDE ONLY)' column provides preconditions and context — it is not a test step. Use the Notes column to add manual annotations. Export to Excel for a formatted spreadsheet, or AZDO for Azure DevOps import.";
  infoCard.appendChild(infoText);
  container.appendChild(infoCard);
}

function buildScenarioCard(scenario) {
  const card = el("div", "scenario-card");

  // Tag badges
  if (Array.isArray(scenario.tags) && scenario.tags.length > 0) {
    const tagBar = el("div", "scenario-card__header");
    for (const tag of scenario.tags) {
      tagBar.appendChild(el("span", "badge badge--tag", tag));
    }
    card.appendChild(tagBar);
  }

  // Steps table
  if (Array.isArray(scenario.steps) && scenario.steps.length > 0) {
    const tableWrap = el("div", "scenario-card__table-wrap");
    const table = document.createElement("table");
    table.className = "scenario-card__table";

    const thead = document.createElement("thead");

    // Group header row
    const groupRow = document.createElement("tr");
    groupRow.className = "scenario-group-header-row";
    const groupCell = document.createElement("td");
    groupCell.colSpan = 7;
    groupCell.className = "scenario-group-header-cell";

    let headerText =
      (scenario.id || "TC") + ": " + (scenario.title || "Untitled");
    if (scenario.priority) {
      headerText += "  ";
      const priorityBadge = el(
        "span",
        "badge badge--priority-" + scenario.priority.toLowerCase(),
        scenario.priority
      );
      groupCell.textContent = headerText;
      groupCell.appendChild(document.createTextNode(" "));
      groupCell.appendChild(priorityBadge);
    } else {
      groupCell.textContent = headerText;
    }
    if (scenario.documentReference) {
      const refBadge = el("span", "badge badge--doc-ref", "📄 " + scenario.documentReference);
      groupCell.appendChild(document.createTextNode(" "));
      groupCell.appendChild(refBadge);
    }
    groupRow.appendChild(groupCell);
    thead.appendChild(groupRow);

    // Column headers
    const headerRow = document.createElement("tr");
    for (const colName of [
      "Overview of Step/Tab",
      "Step Details/Tab",
      "Outcome",
      "Scenario (GUIDE ONLY)",
      "Notes",
      "Pass",
      "Fail",
    ]) {
      const th = document.createElement("th");
      th.textContent = colName;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let i = 0; i < scenario.steps.length; i++) {
      const s = scenario.steps[i];
      const tr = document.createElement("tr");

      // Col 1: Overview
      tr.appendChild(el("td", null, s.action || ""));
      // Col 2: Details
      tr.appendChild(el("td", null, s.detail || s.input || ""));
      // Col 3: Outcome
      tr.appendChild(el("td", null, s.expected || ""));

      // Col 4: Scenario Guide
      const tdGuide = el("td", "scenario-guide-cell");
      let guideContent = s.scenarioGuide || s.input || "";
      if (
        i === 0 &&
        Array.isArray(scenario.preconditions) &&
        scenario.preconditions.length > 0
      ) {
        const preText = scenario.preconditions.map((p) => "- " + p).join("\n");
        guideContent = guideContent
          ? preText + "\n" + guideContent
          : preText;
      }
      tdGuide.textContent = guideContent;
      tr.appendChild(tdGuide);

      // Col 5: Notes (editable)
      const tdNotes = el("td", "notes-cell");
      tdNotes.contentEditable = "true";
      tr.appendChild(tdNotes);

      // Col 6: Pass
      tr.appendChild(el("td", "pass-fail-cell", "\u2610"));
      // Col 7: Fail
      tr.appendChild(el("td", "pass-fail-cell", "\u2610"));

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    card.appendChild(tableWrap);
  }

  return card;
}

function renderResultsFallback(container) {
  container.appendChild(el("h2", "step-title", "Results"));
  container.appendChild(
    el("p", "step-subtitle", "The pipeline returned data in an unexpected format.")
  );

  const jsonPre = el("pre", "json-result", wizardData.pipelineRaw);
  container.appendChild(jsonPre);

  const actions = el("div", "step-footer");
  actions.style.justifyContent = "center";

  const dlBtn = el("button", "md-btn md-btn--tonal");
  dlBtn.type = "button";
  dlBtn.appendChild(icon("download"));
  dlBtn.appendChild(document.createTextNode("Download JSON"));
  dlBtn.addEventListener("click", () => {
    const blob = new Blob([wizardData.pipelineRaw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "test-script.json";
    a.click();
    URL.revokeObjectURL(url);
  });
  actions.appendChild(dlBtn);

  const startOverBtnFallback = el("button", "md-btn md-btn--outlined");
  startOverBtnFallback.type = "button";
  startOverBtnFallback.appendChild(icon("restart_alt"));
  startOverBtnFallback.appendChild(document.createTextNode("Start Over"));
  startOverBtnFallback.addEventListener("click", startOver);
  actions.appendChild(startOverBtnFallback);

  container.appendChild(actions);
}

// ============================================================
// EXCEL EXPORT — STANDARD
// ============================================================

function generateExcelDownload(data) {
  const thinBorder = {
    top: { style: "thin", color: { rgb: "D0D0D0" } },
    bottom: { style: "thin", color: { rgb: "D0D0D0" } },
    left: { style: "thin", color: { rgb: "D0D0D0" } },
    right: { style: "thin", color: { rgb: "D0D0D0" } },
  };

  const suiteHeaderStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14, name: "Calibri" },
    fill: { fgColor: { rgb: "1F4E79" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: thinBorder,
  };

  const colHeaderStyle = {
    font: { bold: true, color: { rgb: "000000" }, sz: 10, name: "Calibri" },
    fill: { fgColor: { rgb: "D6E4F0" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: thinBorder,
  };

  const scenarioHeaderStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
    fill: { fgColor: { rgb: "4472C4" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: thinBorder,
  };

  const cellStyle = {
    font: { sz: 11, name: "Calibri" },
    alignment: { vertical: "top", wrapText: true },
    border: thinBorder,
  };

  const guideCellStyle = {
    font: { sz: 11, name: "Calibri", color: { rgb: "C00000" } },
    alignment: { vertical: "top", wrapText: true },
    border: thinBorder,
  };

  const emptyStyle = {
    font: { sz: 11, name: "Calibri" },
    fill: { fgColor: { rgb: "FAFBFC" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: thinBorder,
  };

  const docRefStyle = {
    font: { sz: 11, name: "Calibri", italic: true, color: { rgb: "3D5A99" } },
    alignment: { vertical: "top", wrapText: true },
    border: thinBorder,
  };

  function mergedHeaderRow(text, style) {
    const row = [{ v: text, t: "s", s: style }];
    for (let i = 1; i < 8; i++) row.push({ v: "", t: "s", s: style });
    return row;
  }

  const rows = [];
  const merges = [];

  // Row 0: Suite header
  const suiteTitle =
    (data.testSuite || "Test Suite") +
    (data.generatedAt
      ? " - Generated: " + new Date(data.generatedAt).toLocaleString()
      : "");
  rows.push(mergedHeaderRow(suiteTitle, suiteHeaderStyle));
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });

  // Row 1: Column headers
  const columns = [
    "Overview of Step/Tab",
    "Step Details/Tab",
    "Outcome",
    "Scenario (GUIDE ONLY)",
    "Doc Reference",
    "Notes",
    "Pass",
    "Fail",
  ];
  rows.push(columns.map((col) => ({ v: col, t: "s", s: colHeaderStyle })));

  // Scenario sections
  for (const scenario of data.scenarios) {
    const label =
      (scenario.id || "TC") +
      ": " +
      (scenario.title || "Untitled") +
      (scenario.priority ? "  [" + scenario.priority + "]" : "");

    const rowIdx = rows.length;
    rows.push(mergedHeaderRow(label, scenarioHeaderStyle));
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 7 } });

    const steps = scenario.steps || [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      let guideText = s.scenarioGuide || s.input || "";
      if (
        i === 0 &&
        Array.isArray(scenario.preconditions) &&
        scenario.preconditions.length > 0
      ) {
        const preText = scenario.preconditions.map((p) => "- " + p).join("\n");
        guideText = guideText ? preText + "\n" + guideText : preText;
      }

      rows.push([
        { v: s.action || "", t: "s", s: cellStyle },
        { v: s.detail || s.input || "", t: "s", s: cellStyle },
        { v: s.expected || "", t: "s", s: cellStyle },
        { v: guideText, t: "s", s: guideCellStyle },
        { v: i === 0 ? (scenario.documentReference || "") : "", t: "s", s: docRefStyle },
        { v: "", t: "s", s: emptyStyle },
        { v: "", t: "s", s: emptyStyle },
        { v: "", t: "s", s: emptyStyle },
      ]);
    }

    rows.push([{ v: "", t: "s" }]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 22 },
    { wch: 25 },
    { wch: 22 },
    { wch: 16 },
    { wch: 8 },
    { wch: 8 },
  ];
  ws["!merges"] = merges;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Test Scripts");

  const fileName = (data.testSuite || "test-scripts")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
  XLSX.writeFile(wb, fileName + ".xlsx");
}

// ============================================================
// EXCEL EXPORT — AZDO
// ============================================================

function sanitizeSheetName(name, usedNames) {
  let clean = name.replace(/[\\/?*[\]]/g, "").trim();
  if (clean.length > 28) clean = clean.substring(0, 28);
  let finalName = clean;
  let counter = 2;
  while (usedNames.has(finalName)) {
    const suffix = " (" + counter + ")";
    finalName = clean.substring(0, 31 - suffix.length) + suffix;
    counter++;
  }
  usedNames.add(finalName);
  return finalName || "Sheet";
}

async function generateAzdoExport(data) {
  const areaPath = await inputDialog({
    title: "Azure DevOps Export",
    message: "Enter the Area Path for the test cases:",
    placeholder: "e.g. Project\\Area\\SubArea",
    okText: "Export",
  });

  if (areaPath === null) return;

  const thinBorder = {
    top: { style: "thin", color: { rgb: "D0D0D0" } },
    bottom: { style: "thin", color: { rgb: "D0D0D0" } },
    left: { style: "thin", color: { rgb: "D0D0D0" } },
    right: { style: "thin", color: { rgb: "D0D0D0" } },
  };

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
    fill: { fgColor: { rgb: "1F4E79" } },
    alignment: { vertical: "center", wrapText: true },
    border: thinBorder,
  };

  const cellStyle = {
    font: { sz: 11, name: "Calibri" },
    alignment: { vertical: "top", wrapText: true },
    border: thinBorder,
  };

  const wb = XLSX.utils.book_new();
  const usedNames = new Set();

  for (const scenario of data.scenarios) {
    const sheetName = sanitizeSheetName(scenario.title || "Test Case", usedNames);
    const rows = [];

    // Row 1: Column headers
    const headers = [
      "ID", "Work Item Type", "Title", "Test Step",
      "Step Action", "Step Expected", "Area Path", "Assigned To", "State",
    ];
    rows.push(headers.map((h) => ({ v: h, t: "s", s: headerStyle })));

    // Row 2: Metadata
    const title =
      (scenario.id || "TC") +
      ": " +
      (scenario.title || "Untitled") +
      (scenario.priority ? " [" + scenario.priority + "]" : "") +
      (scenario.documentReference ? " | Ref: " + scenario.documentReference.substring(0, 60) : "");

    rows.push([
      { v: "", t: "s", s: cellStyle },
      { v: "Test Case", t: "s", s: cellStyle },
      { v: title, t: "s", s: cellStyle },
      { v: "", t: "s", s: cellStyle },
      { v: "", t: "s", s: cellStyle },
      { v: "", t: "s", s: cellStyle },
      { v: areaPath, t: "s", s: cellStyle },
      { v: "", t: "s", s: cellStyle },
      { v: "Design", t: "s", s: cellStyle },
    ]);

    // Step rows
    const steps = scenario.steps || [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      let actionText = s.action ? s.action + ": " : "";
      actionText += s.detail || s.input || "";

      if (
        i === 0 &&
        Array.isArray(scenario.preconditions) &&
        scenario.preconditions.length > 0
      ) {
        const preText = scenario.preconditions.map((p) => "- " + p).join("\n");
        actionText = preText + "\n" + actionText;
      }

      rows.push([
        { v: "", t: "s", s: cellStyle },
        { v: "", t: "s", s: cellStyle },
        { v: "", t: "s", s: cellStyle },
        { v: i + 1, t: "n", s: cellStyle },
        { v: actionText, t: "s", s: cellStyle },
        { v: s.expected || "", t: "s", s: cellStyle },
        { v: "", t: "s", s: cellStyle },
        { v: "", t: "s", s: cellStyle },
        { v: "", t: "s", s: cellStyle },
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 8 },
      { wch: 16 },
      { wch: 40 },
      { wch: 10 },
      { wch: 50 },
      { wch: 40 },
      { wch: 20 },
      { wch: 20 },
      { wch: 10 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const fileName = (data.testSuite || "test-scripts")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
  XLSX.writeFile(wb, fileName + "_azdo.xlsx");
}

// ============================================================
// DIALOGS
// ============================================================

function confirmDialog({ title, message, okText = "OK", cancelText = "Cancel" }) {
  return new Promise((resolve) => {
    const overlay = el("div", "confirm-overlay");

    const dialog = el("div", "confirm-dialog");
    dialog.appendChild(el("div", "confirm-dialog__title", title));
    dialog.appendChild(el("div", "confirm-dialog__message", message));

    const actions = el("div", "confirm-dialog__actions");

    const cancelBtn = el("button", "md-btn md-btn--text", cancelText);
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });
    actions.appendChild(cancelBtn);

    const okBtn = el("button", "md-btn md-btn--filled", okText);
    okBtn.type = "button";
    okBtn.addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });
    actions.appendChild(okBtn);

    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Backdrop click cancels
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });

    // Escape key cancels
    function onKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        resolve(false);
      }
    }
    document.addEventListener("keydown", onKey);

    okBtn.focus();
  });
}

function inputDialog({
  title,
  message,
  placeholder = "",
  okText = "OK",
  cancelText = "Cancel",
}) {
  return new Promise((resolve) => {
    const overlay = el("div", "confirm-overlay");

    const dialog = el("div", "confirm-dialog");
    dialog.appendChild(el("div", "confirm-dialog__title", title));
    dialog.appendChild(el("div", "confirm-dialog__message", message));

    const input = document.createElement("input");
    input.type = "text";
    input.className = "confirm-dialog__input";
    input.placeholder = placeholder;
    dialog.appendChild(input);

    const actions = el("div", "confirm-dialog__actions");

    const cancelBtn = el("button", "md-btn md-btn--text", cancelText);
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", () => {
      overlay.remove();
      resolve(null);
    });
    actions.appendChild(cancelBtn);

    const okBtn = el("button", "md-btn md-btn--filled", okText);
    okBtn.type = "button";
    okBtn.addEventListener("click", () => {
      overlay.remove();
      resolve(input.value);
    });
    actions.appendChild(okBtn);

    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Enter submits, Escape cancels
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        overlay.remove();
        resolve(input.value);
      }
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    });

    function onKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        resolve(null);
      }
    }
    document.addEventListener("keydown", onKey);

    input.focus();
  });
}

// ============================================================
// START OVER & REGENERATE
// ============================================================

async function startOver() {
  if (currentStep > 1) {
    const confirmed = await confirmDialog({
      title: "Start Over?",
      message:
        "This will clear all progress and return to the upload step. Are you sure?",
      okText: "Start Over",
    });
    if (!confirmed) return;
  }

  wizardData.file = null;
  wizardData.fileName = "";
  wizardData.sections = [];
  wizardData.checkboxStates = [];
  wizardData.pages = [];
  wizardData.pageCheckboxStates = [];
  wizardData.rawText = "";
  wizardData.textSelections = [];
  wizardData.selectionMode = "headers";
  wizardData.hasHeadings = false;
  wizardData.hasPages = false;
  wizardData.totalPages = 0;
  wizardData.assembledPrompt = "";
  wizardData.pipelineResult = null;
  wizardData.pipelineRaw = "";

  goToStep(1);
}

async function regenerate() {
  const confirmed = await confirmDialog({
    title: "Regenerate Test Scripts?",
    message:
      "This will re-run the AI pipeline with the current prompt. The previous results will be replaced.",
    okText: "Regenerate",
  });
  if (!confirmed) return;
  goToStep(4);
}

// ============================================================
// EVENT LISTENERS & INITIALIZATION
// ============================================================

startOverBtn.addEventListener("click", startOver);
helpBtn.addEventListener("click", () => {
  const overlay = document.getElementById("helpOverlay");
  const iframe = document.getElementById("helpIframe");
  iframe.src = "help.html";
  overlay.style.display = "flex";
});
document.getElementById("helpCloseBtn").addEventListener("click", () => {
  const overlay = document.getElementById("helpOverlay");
  overlay.style.display = "none";
  document.getElementById("helpIframe").src = "about:blank";
});
document.getElementById("helpOverlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.style.display = "none";
    document.getElementById("helpIframe").src = "about:blank";
  }
});

// Auth guard — initialize MSAL, redirect to login if unauthenticated
(async () => {
  try {
    const account = await auth.init();
    if (!account) {
      window.location.replace("login.html");
      return;
    }

    // Show user info and logout button in header
    const user = auth.getUser();
    const userDisplay = document.getElementById("userDisplay");
    const logoutBtn = document.getElementById("logoutBtn");
    if (user && userDisplay) {
      userDisplay.textContent = user.name || user.username;
    }
    if (logoutBtn) {
      logoutBtn.style.display = "";
      logoutBtn.addEventListener("click", () => auth.logout());
    }

    goToStep(1);
  } catch (err) {
    console.error("Auth initialization failed:", err);
    window.location.replace("login.html");
  }
})();
