# AI Project Analyst (WBS app)

> The in-app AI assistant in `sm-wbs-app` that analyses a project and gives
> PMP/PRINCE2-grounded recommendations, scoped to the user's WBS data.

- **Status:** Current
- **Last updated:** 2026-05-29
- **Applies to:** `sm-wbs-app` (`project.html`)

## Context

WBS data (task hierarchy, resource hours, dependencies, schedule, costing) was
previously only consumed by humans. The AI Project Analyst lets a user ask
questions or request a structured assessment of the open project, grounded in
project-management methodology, using the internal **Matcha** LLM already in
production for the Test Script Builder (no new vendor).

Guardrails: answers are restricted to the user's WBS data, comparable projects
in the portfolio, and PMP/PRINCE2 methodology — not the open web.

## How it works

```
Browser ──► /api/projects/:id/ai/* (sm-wbs-app)
                 ├── assembles context: current project + peers + portfolio + recent chat
                 ├── calls the Matcha "WBS Project Analyst" mission
                 └── persists user + assistant messages, returns the reply
```

### Data scope (sent to the model)
Built by `sm-wbs-app/lib/ai/contextBuilder.js` → `buildContextPayload()`:
- **currentProject** — metadata + full task list with per-resource hours,
  dependencies (as row numbers), and `durationDays`. Durations are computed
  from the schedule engine (`lib/scheduleEngine.js`) when not explicitly stored,
  so the AI sees the same day counts as the WBS "DAYS" column. The builder also
  passes `dependsOnTaskIds` so the engine's dependency pass runs (matching the
  UI's schedule).
- **comparablePeers** — up to 5 anonymised peers sharing the same
  product/solution/module (totals, task count, status, top roles).
- **portfolioSummary** — project counts by status + top roles by demand.
- **history** — last 8 messages of the current conversation.

### Matcha mission
- Configured on the Matcha platform (persona + PMP/PRINCE2 + scope guardrails
  live there, not in our codebase).
- Referenced by `MISSION_ID_WBS` (currently `40847`).
- Called via `sm-wbs-app/lib/matcha/matchaApiService.js` → `callMission()`.
- The server also wraps the payload in a defensive prompt envelope (defence in
  depth) instructing the model to answer only from the payload + methodology.

## Configuration

In `sm-wbs-app/.env` (and `config.js` `matcha` block):

```
MATCHA_API_KEY            # shared Matcha workspace key
WORKSPACE_ID              # 11797
BASE_URL                  # https://matcha.harriscomputer.com/rest/api/v1
MISSION_ID_WBS            # the WBS Project Analyst mission id
MATCHA_TIMEOUT_SECONDS    # request budget (default 120)
```

If `MATCHA_API_KEY` or `MISSION_ID_WBS` is unset, the AI endpoints return `503`
and the UI hides the feature.

## API (`sm-wbs-app/server.js`)

All gated by `requireAI` (non-read-only users **and** Matcha configured):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects/:id/ai/conversations` | List this user's conversations for the project |
| POST | `/api/projects/:id/ai/conversations` | Create an empty conversation |
| GET | `/api/projects/:id/ai/conversations/:cid` | Full message thread |
| DELETE | `/api/projects/:id/ai/conversations/:cid` | Delete a conversation (owner only) |
| POST | `/api/projects/:id/ai/conversations/:cid/messages` | Send a message; body `{ content, mode: 'chat' \| 'analysis' }` |
| PATCH | `/api/projects/:id/ai/messages/:mid/feedback` | Thumbs up/down; body `{ feedback: -1 \| 0 \| 1 }` |

## Storage

Migration `sm-wbs-app/db/009_add_ai_conversations.sql`:
- **AIConversations** — `ConversationId, ProjectId, UserEmail, Title, timestamps`.
- **AIMessages** — `MessageId, ConversationId, Role ('user'|'assistant'|'system'),
  Content, Mode, Feedback (NULL|-1|1), FeedbackNote, TokensUsed, CreatedAtUtc`.

Conversations are private to the user that created them. The user message is
persisted *before* the LLM call, so a failed call still leaves an honest
transcript (plus a `system` message recording the error).

## UI (`project.html`)

- **Tab + drawer:** a 5th "AI Assistant" tab and a floating action button that
  opens a right-side drawer. Both render from one shared `aiState`.
- **Pin to side:** the drawer can be pinned (push-pin icon) — the page shifts
  left so the chat sits beside the WBS; both scroll independently. Pin state
  persists in `localStorage`. Unpinned, clicking outside closes it.
- **Conversation history:** a list rail in the tab and a dropdown picker in the
  drawer; each item has a delete button (confirm modal).
- **Quick-prompt pills:** 6 one-click prompts — Risks, Resource balance,
  Schedule, Scope coverage, Stage gates, Governance & comms — each sends a
  predefined PMP/PRINCE2 question in chat mode. Defined in `AI_QUICK_PROMPTS`.
- **Analyse this project:** one-shot structured assessment (analysis mode).
- **Rendering:** assistant replies render Markdown (headings, lists, bold,
  italic, code, blockquotes) and auto-chip PM jargon leads (Why/Action/Risk/…)
  with colour. Each reply has thumbs up/down feedback.
- **Permission-gated:** the tab + FAB are hidden for read-only accounts (the
  backend enforces it too).

## Verification

1. Open a project → AI Assistant tab (or FAB). Ask "How many tasks does this
   project have?" → a grounded numeric answer.
2. Click **Schedule** quick prompt → reasons about real per-phase day counts.
3. Click **Analyse this project** → structured PMP/PRINCE2 report.
4. Give a thumbs-up → `Feedback = 1` on that `AIMessages` row.
5. Refresh → past conversations reload from the list rail / picker.
6. Sign in read-only → tab + FAB hidden; `/api/projects/:id/ai/*` returns 403.

## Future considerations

- Curate high-feedback Q&A into few-shot examples (the feedback column is
  collected for this; retrieval layer is not built yet).
- Streaming responses (SSE) if latency becomes a UX issue.
- Surface token usage in the UI.

## Related

- `sm-wbs-app/lib/ai/contextBuilder.js`, `sm-wbs-app/lib/matcha/matchaApiService.js`
- `sm-wbs-app/db/009_add_ai_conversations.sql`
- `sm-wbs-app/public/project.html` (AI tab/drawer + `aiState` logic), `public/styles.css` (`.ai-*`)
