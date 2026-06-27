# mini-zynx Implementation Plan

> **Goal:** A small, deliberately simple AI chat test app with local JSON memory, three personality modes, settings, and clear chat.

**Architecture:** Single Node.js server (`server.js`) serves static files and exposes a tiny REST API. Chat logic lives in one module (`lib/responder.js`) with mode-based mock replies—no external AI required for the test build. All state persists in `data/memory.json`.

**Tech Stack:** Node.js, Express, vanilla HTML/CSS/JS

---

## File Structure

```
mini-zynx/
├── PLAN.md
├── TEST_REPORT.md
├── REVIEW.md
├── package.json
├── server.js              # HTTP server + API routes
├── lib/
│   └── responder.js       # Mode-based reply generation
├── data/
│   └── memory.json        # Persisted messages + settings (created at runtime)
└── public/
    ├── index.html         # Chat page
    ├── settings.html      # Settings page
    ├── css/
    │   └── style.css      # Shared styles
    └── js/
        ├── api.js         # Fetch helpers + error handling
        ├── chat.js        # Chat UI logic
        └── settings.js    # Settings UI logic
```

---

## Data Model (`data/memory.json`)

```json
{
  "settings": {
    "mode": "normal",
    "displayName": "User"
  },
  "messages": [
    { "role": "user", "content": "hello", "timestamp": "2026-06-27T12:00:00.000Z" },
    { "role": "assistant", "content": "Hi!", "timestamp": "2026-06-27T12:00:01.000Z" }
  ]
}
```

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/memory` | Load full memory |
| POST | `/api/chat` | Send user message, get assistant reply, save both |
| PUT | `/api/settings` | Update settings |
| DELETE | `/api/messages` | Clear chat history |

---

## Modes

| Mode | Behavior |
|------|----------|
| **normal** | Friendly, plain answers |
| **silly** | Exaggerated, random emojis, playful tone |
| **serious** | Formal, concise, no fluff |

---

## Tasks

- [x] Write PLAN.md
- [x] Create `package.json` and install express
- [x] Implement `lib/responder.js` with 3 modes
- [x] Implement `server.js` with routes + JSON persistence
- [x] Build chat UI (`index.html`, `chat.js`)
- [x] Build settings UI (`settings.html`, `settings.js`)
- [x] Add shared `api.js` and `style.css`
- [x] Manual test all flows
- [x] Write TEST_REPORT.md and REVIEW.md

---

## Error Handling

- Server: try/catch on file I/O, return `{ error: "message" }` with 4xx/5xx
- Client: show inline error banner when API calls fail
- Validate mode is one of `normal`, `silly`, `serious`
- Reject empty chat messages

---

## Out of Scope (keep it simple)

- No auth, no database, no streaming, no real LLM integration
- No build step, no framework, no tests suite
