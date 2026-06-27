# mini-zynx Test Report

**Date:** 2026-06-27  
**Environment:** Windows, Node.js, `http://localhost:3847`

---

## Summary

All core flows were tested via API calls against a running server. The app meets the stated requirements.

| Area | Result |
|------|--------|
| Server startup | Pass |
| Load memory | Pass |
| Send chat message | Pass |
| Three modes (normal, silly, serious) | Pass |
| Save settings | Pass |
| Clear chat | Pass |
| Empty message validation | Pass |
| Invalid mode validation | Pass |
| JSON persistence | Pass |

---

## Test Cases

### 1. Server starts

- **Action:** `npm start` / `node server.js`
- **Expected:** Server listens on port 3847
- **Result:** Pass — console shows `mini-zynx running at http://localhost:3847`

### 2. GET /api/memory (initial load)

- **Action:** Fetch memory on first run
- **Expected:** Default settings `{ mode: "normal", displayName: "User" }`, empty messages
- **Result:** Pass

### 3. POST /api/chat — normal mode

- **Action:** Send `"hello"`
- **Expected:** User + assistant messages returned and saved
- **Result:** Pass — reply: `"Hi! Ready when you are."`

### 4. PUT /api/settings — silly mode

- **Action:** Set `mode: "silly"`, `displayName: "Jack"`
- **Expected:** Settings updated in memory file
- **Result:** Pass — `data/memory.json` reflects changes

### 5. POST /api/chat — silly mode

- **Action:** Send message after switching to silly
- **Expected:** Reply uses silly prefix/suffix and uppercase style
- **Result:** Pass — responses include emoji prefix and playful formatting

### 6. PUT /api/settings — serious mode

- **Action:** Set `mode: "serious"`, send `"help me"`
- **Expected:** Formal prefix/suffix, no exclamation marks
- **Result:** Pass — `"Acknowledged. ... End of response."`

### 7. DELETE /api/messages — clear chat

- **Action:** Clear all messages
- **Expected:** Messages array empty, settings preserved
- **Result:** Pass — settings kept, messages cleared in file and API

### 8. POST /api/chat — empty message

- **Action:** Send `{ "content": "" }`
- **Expected:** 400 error with message
- **Result:** Pass — `{ "error": "Message cannot be empty." }`

### 9. PUT /api/settings — invalid mode

- **Action:** Send `{ "mode": "angry" }`
- **Expected:** 400 error
- **Result:** Pass — `{ "error": "Mode must be normal, silly, or serious." }`

### 10. JSON file persistence

- **Action:** Inspect `data/memory.json` after operations
- **Expected:** Valid JSON with settings + messages
- **Result:** Pass — file created automatically, readable structure

---

## UI (manual checklist)

These were verified by code review; browser automation was not run in this session.

| UI element | Expected | Status |
|------------|----------|--------|
| Chat page loads at `/` | Messages list + input + send | Code complete |
| Settings page at `/settings.html` | Name + mode dropdown + save | Code complete |
| Clear chat button | Confirm dialog, clears list | Code complete |
| Error banner | Shows on failed API call | Code complete |
| Mode badge in header | Shows current mode | Code complete |

---

## Known Limitations (by design)

- Replies are mock/template-based, not a real LLM
- No message streaming
- No auth or multi-user support
- Memory file is plain JSON on disk (not encrypted)

---

## How to re-run tests

```powershell
cd C:\Users\jackc\Projects\mini-zynx
npm install
npm start
```

Then open `http://localhost:3847` or hit the API endpoints documented in `PLAN.md`.
