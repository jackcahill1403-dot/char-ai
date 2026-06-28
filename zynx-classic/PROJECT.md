# Atlas

AI chat app (zynx-classic codebase) on port **3848**.

## Stack
- OpenRouter for LLM (Kimi, GLM, Qwen, GPT-OSS, DeepSeek)
- Per-user data in `data/users/{userId}/`
- Caveman ultra mode always on — compress prose, never alter code blocks

## Conventions
- Prefer OpenRouter models (`or-*`) over Hugging Face
- Dev team: Planner (Qwen) → Coders (Kimi + GLM) → Merger → Testers
- Scripts: `!save`, `!run` (free replay), `!publish`
- App limits: 20/hr · 50/day per model per person (clock reset)

## Code style
- Match existing patterns in `lib/` and `public/js/`
- Minimal diffs; no over-engineering
- Complete working code in fenced blocks when coding
