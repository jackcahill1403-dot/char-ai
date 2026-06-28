# Deploy Atlas (zynx-classic) on Render

Atlas is a Node/Express chat app. Default port locally is **3848**; Render sets `PORT` automatically.

## Quick deploy (Web Service)

1. Repo: [jackcahill1403-dot/char-ai](https://github.com/jackcahill1403-dot/char-ai) — use branch **`atlas`** (root `render.yaml` deploys Atlas, not char.ai).
2. In [Render](https://render.com) → **New** → **Web Service** → **Connect GitHub** → select `char-ai`, branch **`atlas`**.
3. If not using the Blueprint file, set **Root Directory** to `zynx-classic` (required when Render runs from repo root).
4. Render reads `zynx-classic/render.yaml` if present, or use these settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/api/health`
5. Add environment variables (see below), then deploy.

### Seeing char.ai instead of Atlas?

Render was using the **repo root** (`char-ai`’s `server.js`). Fix:

- **Branch:** `atlas` (not `main`)
- **Root Directory:** `zynx-classic` if you create the service manually
- Or use Blueprint: root `render.yaml` on branch `atlas` already sets `rootDir: zynx-classic` and service name `atlas`

Redeploy after changing settings. Health check should return `{ "app": "Atlas" }`.

### Monorepo Blueprint

On branch **`atlas`**, root `render.yaml` deploys Atlas. char.ai is in `render-char-ai.yaml` if you need it separately.

## Environment variables

Set these in Render → **Environment**. Keys marked optional can be omitted.

| Variable | Required | Notes |
|----------|----------|-------|
| `OPENROUTER_KEY_OR_KIMI` | Per model | One OpenRouter key per model you want enabled |
| `OPENROUTER_KEY_OR_KIMI_CODE` | Per model | |
| `OPENROUTER_KEY_OR_QWEN36` | Per model | |
| `OPENROUTER_KEY_OR_GLM` | Per model | |
| `OPENROUTER_KEY_OR_GPT_OSS` | Per model | |
| `OPENROUTER_KEY_OR_DEEPSEEK_V4` | Per model | |
| `OPENROUTER_KEY_OR_FLASH` | Per model | |
| `OPENROUTER_API_KEYS` | Fallback | Comma-separated keys for models without a dedicated key |
| `OPENROUTER_APP_TITLE` | Auto | Set to `Atlas` in `render.yaml` |
| `TAVILY_API_KEY` | Optional | Richer `!search` and auto web context |
| `GEMINI_API_KEY` | Optional | Use Gemini models instead of / alongside OpenRouter |

Get OpenRouter keys at [openrouter.ai](https://openrouter.ai) (free signup, no credit card). Each key starts with `sk-or-`.

**Limits:** 20 messages/hour and 50/day per person per model (also set in `render.yaml` as `RATE_LIMIT_*`).

## Share with friends

After deploy, share your Render URL with a `user` query param so each person gets separate chat history:

- You: `https://your-app.onrender.com/?user=jack`
- Friend: `https://your-app.onrender.com/?user=sam`

Everyone uses the same server keys; limits are per `user` name.

## Health check

Render should probe:

```http
GET /api/health
```

Expected response:

```json
{ "ok": true, "app": "Atlas" }
```

Public URL: `https://your-app.onrender.com/api/health`

## Free tier: ephemeral disk

On Render’s **free** plan, the filesystem is **ephemeral**. Chat history and local data reset when the service redeploys or restarts.

To keep data across deploys (paid plans):

1. Add a **Persistent Disk** in Render (paid feature).
2. Mount at `data/` (Atlas stores chats under `data/`).
3. Redeploy.

Without a disk, treat the hosted app as shared live chat — not long-term storage.

## Run locally

```bash
cd zynx-classic
cp .env.example .env   # add your keys
npm install
npm start
```

Open `http://localhost:3848`. Health: `http://localhost:3848/api/health`.
