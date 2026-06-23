# World Clocks widget (APAC landing page)

> A self-contained, zero-dependency row of world-clock cards on the APAC
> landing page. Click a card to pick a reference city; a date picker + minute-precision
> slider lets the user translate a time in that city across the others.

- **Status:** Current
- **Last updated:** 2026-06-01
- **Owner:** APAC Services
- **Applies to:** the suite landing page (`sm-apac-landing`), via a sibling
  folder `world-clocks/` at the repo root.

## Context

The landing page had an empty band above the two tool cards. The team is
spread across multiple time zones; rather than leave that space blank, the
widget gives a quick "what's the time in X, given Y" lookup right at sign-in.
Designed to feel native to the landing chrome (MD3 tokens) but live in its
own folder so it can be reused elsewhere or evolved independently.

## How it works

### Interaction model

- **Initial state (no selection)** — every card displays its current local
  wall time and ticks live every 30 s. Controls are hidden. A heading reads:
  *"Select a city to find the time across the others."*
- **A card is clicked** — that card is the reference. Its outline turns
  primary; the heading is replaced by a readout naming the reference city,
  the chosen wall-clock time, and the DST-correct zone abbreviation. The
  date picker + 24-h slider + Now button appear, pre-seeded to "now in the
  reference city".
- **Moving the slider or date** — the reference's wall-clock time changes;
  every other card displays the equivalent instant in its own zone. A small
  `†` appears next to the date on any card whose calendar day differs from
  the reference's.
- **Clicking the selected card again** — clears selection; controls
  disappear; live ticking resumes.
- **Clicking another card** — switches the reference; inputs re-seed to
  "now in the new reference city".
- **Now button** — snaps the slider back to "now in the selected city"
  without changing selection.

Selection state is **fully transient**: refreshing, leaving the landing, or
returning from `/apps/wbs/` etc. all reset to the no-selection live view.

### City list (DOM order, left → right = west → east)

| # | Label                | IANA               |
|---|----------------------|--------------------|
| 1 | Vancouver (PST)      | America/Vancouver  |
| 2 | Ottawa (EST)         | America/Toronto    |
| 3 | London (UK)          | Europe/London      |
| 4 | Mumbai / Delhi       | Asia/Kolkata       |
| 5 | Singapore / Manila   | Asia/Singapore     |
| 6 | Perth                | Australia/Perth    |
| 7 | Adelaide             | Australia/Adelaide |
| 8 | Melbourne            | Australia/Melbourne|
| 9 | Sydney               | Australia/Sydney   |
| 10| Auckland             | Pacific/Auckland   |

The order in the `CITIES` array at the top of `world-clocks/index.js` is the
visual order. Customise by editing that array.

### Day / night animation

Each card has a phase class chosen by the local hour in its own zone:

| Phase | Local hour | Background gradient (135°)    | Text       |
|-------|------------|-------------------------------|------------|
| Dawn  | 05–07      | `#ffb37a → #ffd6a5 → #fff4d6` | near-black |
| Day   | 07–17      | `#7ec8f5 → #c7e5ff`           | near-black |
| Dusk  | 17–19      | `#6b4a8a → #d77a6a → #ffb37a` | near-black |
| Night | 19–05      | `#0f1a3a → #1d2b5c`           | near-white |

Phase changes only toggle a class, so CSS `transition` smooths the gradient
crossfade over 800 ms.

### Time conversion (the precise bit)

The slider is interpreted as **wall-clock time in the selected city's zone**,
not the browser's. `new Date('YYYY-MM-DDTHH:MM')` parses in the browser zone
and so isn't enough. The widget uses a two-pass offset correction against
`Intl.DateTimeFormat.formatToParts()` — see `wallTimeToInstant()` in
`world-clocks/index.js`. Two passes suffice for all IANA zones, including
DST transitions.

Zone abbreviations (BST/GMT, AEDT/AEST, EDT/EST, IST, NZDT/NZST…) come from
`formatToParts` with `timeZoneName: 'short'`, so they follow DST automatically.

## Configuration

No environment variables. All state is in-memory in the browser; no
`localStorage`, no server roundtrip.

## Integration points

| File | Change |
|---|---|
| `world-clocks/index.css`, `index.js`, `index.html`, `README.md` | The self-contained widget. |
| `sm-apac-landing/server.js` | `app.use("/world-clocks", express.static(path.join(__dirname, "..", "world-clocks")))` (added after the existing `public/` mount). |
| `sm-apac-landing/public/index.html` | `<link>` to the widget CSS in `<head>`, `<div id="world-clocks-mount"></div>` inside `<main class="landing-main">` above the tool cards, and `<script type="module" src="/world-clocks/index.js"></script>` near `</body>`. |

The widget auto-mounts on `DOMContentLoaded` if it finds
`#world-clocks-mount`. To embed elsewhere, drop the link + mount-div +
script onto any page; the only contract is that element id.

## Accessibility

- Each card is a `<button>` with `aria-pressed` reflecting selection state.
- The reference-readout strip is `aria-live="polite"` so SR users hear
  updates when the slider/date is moved.
- Card `aria-label` updates on render to include city + wall-time + day +
  zone abbreviation, so a focused card announces fully.
- The slider has an `aria-label`; tick marks are `aria-hidden`.

## DST behaviour

IANA zones handle DST; abbreviations switch automatically. On a transition
day the formatted local time naturally skips an hour (spring forward) or
repeats one (fall back) as the slider crosses the boundary. That's correct,
not a bug.

## Browser support

Modern Chromium / Firefox / Safari with `Intl.DateTimeFormat` IANA support.
The widget feature-detects on mount and shows an inline notice instead of
crashing on engines that lack it.

## Future considerations

- Optional persistent reference city via `localStorage` (currently transient
  by design — adding it is trivial).
- Drag-to-reorder or user-customisable city list.
- Embed in other apps (the contract is one element id + two files —
  documented in `world-clocks/README.md`).

## Related

- `world-clocks/index.js`, `world-clocks/index.css`, `world-clocks/README.md`
- `sm-apac-landing/server.js`, `sm-apac-landing/public/index.html`
- [`database-architecture.md`](./database-architecture.md),
  [`ai-project-analyst.md`](./ai-project-analyst.md) — sibling docs.
