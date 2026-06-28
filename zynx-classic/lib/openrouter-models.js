// OpenRouter catalog — per-model keys in .env (OPENROUTER_KEY_OR_*). Each model: 20/hr · 50/day per person.
module.exports = [
  {
    id: "or-kimi",
    label: "Kimi K2.6",
    model: "moonshotai/kimi-k2.6",
    hint: "Testing / general",
    tier: 1,
  },
  {
    id: "or-kimi-code",
    label: "Kimi K2.7 Code",
    model: "moonshotai/kimi-k2.7-code",
    hint: "Coding",
    tier: 1,
  },
  {
    id: "or-qwen36",
    label: "Qwen 3.6 35B",
    model: "qwen/qwen3.6-35b-a3b",
    hint: "Planning",
    tier: 1,
  },
  {
    id: "or-glm",
    label: "GLM 5.2",
    model: "z-ai/glm-5.2",
    hint: "Coding",
    tier: 2,
  },
  {
    id: "or-gpt-oss",
    label: "GPT-OSS 120B",
    model: "openai/gpt-oss-120b",
    hint: "Testing / deep review",
    tier: 2,
  },
  {
    id: "or-deepseek-v4",
    label: "DeepSeek V4 Pro",
    model: "deepseek/deepseek-v4-pro",
    hint: "Optional — long context",
    tier: 2,
  },
  {
    id: "or-flash",
    label: "DeepSeek V4 Flash",
    model: "deepseek/deepseek-v4-flash",
    hint: "Fast fallback",
    tier: 3,
  },
];

module.exports.DEFAULT_OR_MODEL = "or-kimi";
