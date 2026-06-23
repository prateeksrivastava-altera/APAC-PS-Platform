# Test Script Builder

AI-powered tool that transforms requirements documentation into structured, comprehensive test scripts. Upload a document, select the content you want tested, and let a four-stage Matcha AI pipeline generate ready-to-use test scenarios with Excel and Azure DevOps export.

## Features

- **5-step wizard** — Upload > Select Content > Edit Prompt > Generate > Results
- **3 content selection modes** — Headers (H1/H2 checkboxes), Pages (range picker), Text (free-form highlighting)
- **4-stage AI pipeline** — Identifying Test Areas > Defining Expected Outcomes > Creating Test Flows > Compiling Test Report
- **Real-time progress** — Server-Sent Events stream pipeline status to the browser
- **Document reference tracking** — each scenario is tagged with the source section or page number it was derived from, surfaced as a badge in the results view, a dedicated column in the Excel export, and appended to the title in Azure DevOps export
- **Excel export** — Styled `.xlsx` with one worksheet per scenario, auto-fitted columns, includes a **Doc Reference** column mapping each test case back to its source section or page
- **Azure DevOps export** — AZDO-formatted Excel ready for Test Plans import; document reference appended to each test case title as `| Ref: <section>`
- **Azure SSO authentication** — MSAL.js 2.x login with Azure AD, JWT-validated backend
- **Built-in help page** — Comprehensive documentation at `/help.html`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express 5.1, ES Modules |
| Auth | Azure AD SSO via MSAL.js 2.x, JWT validation with jwks-rsa |
| Frontend | Vanilla JS, Material Design 3, no build step |
| AI | Matcha AI API (4 chained missions) |
| Document parsing | mammoth.js (DOCX), PDF.js (PDF) |
| Excel generation | xlsx-js-style |
| Deployment | Local dev server; AWS Lambda handler included (`handler.js`) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later

### Installation

```bash
git clone <repo-url>
cd test-script-builder
npm install
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your Matcha AI credentials (see [Environment Variables](#environment-variables) below).

### Running

```bash
npm start          # production
npm run dev        # development (auto-restart on file changes)
```

The app will be available at **http://localhost:3000**.

## Environment Variables

| Variable | Description |
|----------|------------|
| `MATCHA_API_KEY` | Your Matcha AI API key |
| `BASE_URL` | Matcha API base URL |
| `WORKSPACE_ID` | Matcha workspace ID |
| `MATCHA_TIMEOUT_SECONDS` | API request timeout (default 300) |
| `MISSION_ID_DECOMPOSER` | Mission ID for stage 1 — Identifying Test Areas |
| `MISSION_ID_NORMALISER` | Mission ID for stage 2 — Defining Expected Outcomes |
| `MISSION_ID_SCENARIO_BUILDER` | Mission ID for stage 3 — Creating Test Flows |
| `MISSION_ID_MATERIALISER` | Mission ID for stage 4 — Compiling Test Report |
| `PORT` | Server port (default 3000) |
| `AZURE_CLIENT_ID` | Azure AD app registration client ID (SSO) |
| `AZURE_TENANT_ID` | Azure AD tenant ID (SSO) |

## Project Structure

```
test-script-builder/
├── server.js                  # Express entry point (/chat, /pipeline SSE)
├── config.js                  # Centralised env config
├── handler.js                 # AWS Lambda handler (non-streaming)
├── services/
│   ├── matchaApiService.js    # Matcha API HTTP client
│   ├── missionDirectives.js   # System prompts for each mission
│   ├── pipelineOrchestrator.js# 4-stage pipeline runner
│   ├── jsonExtractor.js       # Robust JSON extraction from AI output
│   ├── authMiddleware.js      # Express middleware — JWT Bearer token validation
│   └── tokenService.js        # Azure AD JWKS key fetching & JWT verification
├── public/
│   ├── index.html             # App shell (5-step wizard)
│   ├── index.js               # Frontend logic (parsers, UI, SSE consumer)
│   ├── styles.css             # Material Design 3 styles
│   ├── login.html             # SSO login page (Altera branding)
│   ├── auth.js                # MSAL.js 2.x wrapper (init, login, logout, token)
│   ├── images/                # Static assets (logos)
│   └── help.html              # Built-in help documentation
├── .env.example               # Environment template
├── package.json
└── README.md
```

## Azure SSO Authentication

The app uses Azure AD Single Sign-On to protect access. Authentication is implemented across two layers:

### Frontend (MSAL.js 2.x)

- **`public/login.html`** — Branded login page with a "Sign in with SSO" button
- **`public/auth.js`** — MSAL wrapper that handles the full auth lifecycle:
  - Fetches Azure AD config from `GET /auth-config` (no secrets in static files)
  - Creates an MSAL `PublicClientApplication` instance
  - Handles redirect responses after Azure AD login
  - Provides `getToken()` for silent token acquisition with automatic redirect fallback
  - Caches tokens in `localStorage` via MSAL's built-in cache
- **`public/index.js`** — Auth guard redirects unauthenticated users to the login page; injects `Authorization: Bearer <token>` on API calls; redirects to login on 401 responses

### Backend (JWT validation)

- **`services/authMiddleware.js`** — Express middleware applied to `/chat` and `/pipeline` endpoints. Extracts the Bearer token, validates it, and attaches `req.user` to the request. Skips validation in dev mode when Azure AD is not configured.
- **`services/tokenService.js`** — Fetches Azure AD's public signing keys from the JWKS endpoint with 10-minute caching. Verifies JWT signature (RS256), audience (client ID), and issuer (supports both v1.0 and v2.0 token formats).
- **`GET /auth-config`** — Public endpoint returning `{ clientId, tenantId }` for MSAL initialization.

### Azure AD App Registration Setup

1. Register an app in [Azure Portal > App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Under **Authentication**, add a redirect URI: `https://<your-domain>/index.html` (or `http://localhost:3000/index.html` for local dev)
3. Under **Expose an API**, add a scope: `api://<client-id>/access_as_user`
4. Copy the **Application (client) ID** and **Directory (tenant) ID** into `.env`:
   ```
   AZURE_CLIENT_ID=<your-client-id>
   AZURE_TENANT_ID=<your-tenant-id>
   ```

### Dev Mode

When `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` are empty in `.env`, the app runs in dev mode:
- The login page is still shown (with the SSO button)
- Clicking "Sign in with SSO" bypasses Azure AD and enters the app as "Developer"
- API endpoints skip token validation and attach a stub user to requests

## API Endpoints

### `GET /auth-config`

Returns Azure AD configuration for MSAL client initialization (public, no auth required).

- **Response:** `{ "clientId": "...", "tenantId": "..." }`

### `POST /pipeline`

Runs the full 4-stage AI pipeline via Server-Sent Events.

- **Content-Type:** `application/json`
- **Body:** `{ "input": "<assembled prompt>" }`
- **Response:** SSE stream with `stage_start`, `stage_complete`, `pipeline_complete`, and `error` events.

### `POST /chat`

Runs a single Matcha AI mission.

- **Content-Type:** `application/json`
- **Body:** `{ "mission_id": "<id>", "input": "<text>" }`
- **Response:** `{ "output": "<AI response text>" }`

## Document Reference Tracking

Every generated test scenario includes a `documentReference` field that records which section or page of the source document the scenario was derived from. This makes it easy to trace a test case back to its requirement.

### How it works

The assembled prompt sent to the AI pipeline includes structural markers around each block of content:

| Content mode | Marker format |
|---|---|
| Headers mode (DOCX/PDF with headings) | `=== Section: {heading title} (Page N) ===` |
| Pages mode | `=== Page {N} ===` |
| Text selection | *(no marker — `documentReference` left blank)* |

The AI pipeline carries this reference through all four stages. The Materialiser (stage 4) outputs a `documentReference` field on every scenario in the final JSON.

### Where it appears

| Surface | How it's shown |
|---|---|
| **Results view** | Grey italic badge on each scenario card header |
| **Excel export** | **Doc Reference** column (column E), between Priority and Tags |
| **Azure DevOps export** | Appended to the test case title: `Test Case Title \| Ref: Section Name` (truncated to 60 chars) |

### Excel column layout

| Column | Field |
|---|---|
| A | Test Case ID |
| B | Title |
| C | Priority |
| D | Tags |
| **E** | **Doc Reference** |
| F | Preconditions |
| G | Step Action |
| H | Step Detail |
| I | Input |
| J | Expected Result |
| K | Scenario Guide |

### Notes

- For PDF and DOCX files with detected headings, the reference includes the page number where the heading appears (e.g. `Introduction (Page 2)`).
- For plain text or CSV files, or when the user selects free-form text, the reference will be blank.
- If the same test scenario spans multiple source sections, the AI uses the primary section as the reference.

## License

This project is licensed under the [MIT License](LICENSE).
