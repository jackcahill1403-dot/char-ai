# Nexa

AI copilot for **organisation and workflow**. Drop in a goal, a mess of notes, or a task — Nexa turns it into ordered plans, checklists, and tables.

Same UI shell as Atlas (Inter + JetBrains Mono, grid canvas, approval-grade polish), recoloured around an emerald signal.

## The four models

Nexa routes through OpenRouter. The four picked for organisation/workflow:

| Model | Slug | Role |
|-------|------|------|
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` | Planning, task breakdown, clear summaries — the workflow brain |
| Gemini 2.0 Flash | `google/gemini-2.0-flash-001` | Huge context + fast — organise big note/doc dumps |
| DeepSeek R1 | `deepseek/deepseek-r1` | Step-by-step reasoning for multi-stage workflows |
| GPT-4o | `openai/gpt-4o` | Reliable drafting, restructuring, formatting |

## Run locally

```bash
cd nexa
npm install
cp .env.example .env   # add OPENROUTER_API_KEY (one shared key covers all four)
npm start              # http://localhost:3849
```

## Deploy

Render: root dir `nexa`, build `npm install`, start `node server.js`, health check `/api/health`. Set `OPENROUTER_API_KEY` (or the per-model keys) in the dashboard.

## Stack

Node + Express, vanilla JS frontend. Per-user data in `data/users/{id}.json` (gitignored). No build step.
