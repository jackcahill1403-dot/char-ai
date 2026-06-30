const { get } = require("./env");

// The 4 OpenRouter models chosen for organisation & workflow.
// Each: a dedicated key (OPENROUTER_KEY_<ID>) or the shared OPENROUTER_API_KEY.
const MODELS = [
  {
    id: "claude",
    label: "Claude 3.5 Sonnet",
    model: "anthropic/claude-3.5-sonnet",
    keyEnv: "OPENROUTER_KEY_CLAUDE",
    hint: "Planning, task breakdown, clear summaries",
    role: "The workflow brain — structures plans and priorities.",
  },
  {
    id: "gemini",
    label: "Gemini 2.0 Flash",
    model: "google/gemini-2.0-flash-001",
    keyEnv: "OPENROUTER_KEY_GEMINI",
    hint: "Huge context, fast — organise big note/doc dumps",
    role: "Ingests and tidies large amounts of messy input.",
  },
  {
    id: "deepseek",
    label: "DeepSeek R1",
    model: "deepseek/deepseek-r1",
    keyEnv: "OPENROUTER_KEY_DEEPSEEK",
    hint: "Step-by-step reasoning for multi-stage workflows",
    role: "Reasons through dependencies and sequencing.",
  },
  {
    id: "gpt4o",
    label: "GPT-4o",
    model: "openai/gpt-4o",
    keyEnv: "OPENROUTER_KEY_GPT4O",
    hint: "Reliable drafting, restructuring, formatting",
    role: "General-purpose drafting and clean formatting.",
  },
];

const DEFAULT_MODEL = "claude";

function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS.find((m) => m.id === DEFAULT_MODEL);
}

// Per-model key, falling back to a shared key.
function keyForModel(id) {
  const m = getModel(id);
  return get(m.keyEnv) || get("OPENROUTER_API_KEY") || "";
}

function isConfigured(id) {
  return Boolean(keyForModel(id));
}

function listModels() {
  return MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    model: m.model,
    hint: m.hint,
    role: m.role,
    configured: isConfigured(m.id),
  }));
}

function validModelIds() {
  return MODELS.map((m) => m.id);
}

module.exports = { MODELS, DEFAULT_MODEL, getModel, keyForModel, isConfigured, listModels, validModelIds };
