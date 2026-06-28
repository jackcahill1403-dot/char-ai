# Atlas

Node.js + Express AI chat on port **3848**. OpenRouter models with per-model keys and usage limits.

## Quick start

```bash
cd zynx-classic
npm install
cp .env.example .env
# Add OPENROUTER_KEY_OR_* per model (see .env.example)
npm start
```

Open http://localhost:3848

## OpenRouter keys

One key per model in `.env`:

| Model | Env var |
|-------|---------|
| Kimi K2.6 | `OPENROUTER_KEY_OR_KIMI` |
| Kimi K2.7 Code | `OPENROUTER_KEY_OR_KIMI_CODE` |
| Qwen 3.6 | `OPENROUTER_KEY_OR_QWEN36` |
| GLM 5.2 | `OPENROUTER_KEY_OR_GLM` |
| GPT-OSS | `OPENROUTER_KEY_OR_GPT_OSS` |
| DeepSeek V4 | `OPENROUTER_KEY_OR_DEEPSEEK_V4` |
| Gemini Flash (OR) | `OPENROUTER_KEY_OR_FLASH` |

Multiple keys per model: `OPENROUTER_KEYS_OR_KIMI=key1,key2` (auto-failover).

Global fallback: `OPENROUTER_API_KEYS` for models without a dedicated key.

## Limits

Each model: **20/hour · 50/day** per person (clock-aligned). Share with friends via `?user=name`.

## Commands

Type `!` in chat for the command palette (`!help`, `!remember`, `!read`, etc.).
