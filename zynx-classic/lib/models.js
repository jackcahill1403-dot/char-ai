const fs = require("fs");
const path = require("path");
const { get } = require("./env");
const HF_CATALOG = require("./hf-models");
const OR_CATALOG = require("./openrouter-models");
const { openrouterKey, openrouterConfigured } = require("./openrouter-keys");

const HF_URL = "https://router.huggingface.co/v1/chat/completions";
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const LIMIT_HINT = "20/hr (resets :00) · 50/day";

function hfKey() {
  return get("HF_TOKEN") || get("GLM_API_KEY") || get("HUGGINGFACE_API_KEY");
}

function hfUrl() {
  return get("HF_API_URL") || get("GLM_API_URL") || HF_URL;
}

function customHfModel() {
  const fromEnv = get("HF_CUSTOM_MODEL");
  if (fromEnv) return fromEnv;
  try {
    const file = path.join(__dirname, "..", "data", "memory.json");
    if (!fs.existsSync(file)) return "";
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data.settings?.hfCustomModel || "";
  } catch {
    return "";
  }
}

function buildHfProvider(entry) {
  const isCustom = entry.id === "hf-custom";
  return {
    id: entry.id,
    label: `${entry.label} (HF)`,
    hf: true,
    tier: entry.tier || 5,
    apiKey: hfKey,
    url: hfUrl,
    model: () => {
      if (isCustom) {
        return customHfModel() || "moonshotai/Kimi-K2.6";
      }
      const envKey = `HF_MODEL_${entry.id.replace(/^hf-/, "").toUpperCase().replace(/-/g, "_")}`;
      return get(envKey) || entry.model;
    },
    hint: `${entry.hint} · 20/hr (resets :00) · 50/day`,
  };
}

function buildOpenRouterProvider(entry) {
  return {
    id: entry.id,
    label: entry.label,
    hf: false,
    free: true,
    openrouter: true,
    tier: entry.tier || 1,
    apiKey: openrouterKey,
    url: () => get("OPENROUTER_API_URL") || OR_URL,
    model: () => {
      const envKey = `OR_MODEL_${entry.id.replace(/^or-/, "").toUpperCase().replace(/-/g, "_")}`;
      return get(envKey) || entry.model;
    },
    hint: `${entry.hint} · 20/hr (resets :00) · 50/day`,
  };
}

const HF_PROVIDERS = HF_CATALOG.map(buildHfProvider);
const OR_PROVIDERS = OR_CATALOG.map(buildOpenRouterProvider);

const OTHER_FREE_PROVIDERS = [
  {
    id: "gemini",
    label: "Gemini (free · Google account)",
    hf: false,
    free: true,
    tier: 0,
    apiKey: () => get("GEMINI_API_KEY") || get("GOOGLE_API_KEY"),
    model: () => get("GEMINI_MODEL", "gemini-2.0-flash"),
    url: () =>
      get("GEMINI_API_URL", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
    hint: `aistudio.google.com/apikey · ${LIMIT_HINT}`,
  },
  {
    id: "ollama",
    label: "Ollama (local · free)",
    hf: false,
    free: true,
    noAuth: true,
    tier: 0,
    apiKey: () => "local",
    model: () => get("OLLAMA_MODEL", "llama3.2"),
    url: () => get("OLLAMA_URL", "http://127.0.0.1:11434/v1/chat/completions"),
    hint: `ollama.com — local only · ${LIMIT_HINT}`,
  },
  {
    id: "groq",
    label: "Groq (free tier)",
    hf: false,
    free: true,
    tier: 0,
    apiKey: () => get("GROQ_API_KEY"),
    model: () => get("GROQ_MODEL", "llama-3.3-70b-versatile"),
    url: () => get("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions"),
    hint: `console.groq.com · ${LIMIT_HINT}`,
  },
];

const OTHER_PROVIDERS = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    hf: false,
    tier: 10,
    apiKey: () => get("CHATGPT_API_KEY") || get("OPENAI_API_KEY"),
    model: () => get("CHATGPT_MODEL", "gpt-4o-mini"),
    url: () => get("CHATGPT_API_URL", "https://api.openai.com/v1/chat/completions"),
    hint: "OpenAI — needs billing",
  },
  {
    id: "deepseek",
    label: "DeepSeek API",
    hf: false,
    tier: 10,
    apiKey: () => get("DEEPSEEK_API_KEY"),
    model: () => get("DEEPSEEK_MODEL", "deepseek-chat"),
    url: () => get("DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions"),
    hint: "DeepSeek direct — needs balance",
  },
];

const PROVIDERS = [...OR_PROVIDERS, ...OTHER_FREE_PROVIDERS, ...HF_PROVIDERS, ...OTHER_PROVIDERS];

function listModels() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    model: p.model(),
    configured: p.noAuth
      ? true
      : p.hf
        ? Boolean(hfKey())
        : p.openrouter
          ? openrouterConfigured()
          : Boolean(p.apiKey()),
    hf: Boolean(p.hf),
    free: Boolean(p.free),
    openrouter: Boolean(p.openrouter),
    hint: p.hint || "",
    tier: p.tier || 5,
  }));
}

function getProvider(id) {
  const found = PROVIDERS.find((p) => p.id === id);
  if (found) return found;
  if (openrouterConfigured()) return OR_PROVIDERS[0];
  return HF_PROVIDERS[0];
}

function hfFallbackOrder() {
  return [...PROVIDERS]
    .filter((p) => p.hf)
    .sort((a, b) => (a.tier || 5) - (b.tier || 5))
    .map((p) => p.id);
}

function freeFallbackOrder() {
  const orIds = OR_PROVIDERS.filter(() => openrouterConfigured()).map((p) => p.id);
  const rest = OTHER_FREE_PROVIDERS.filter((p) => p.noAuth || p.apiKey()).map((p) => p.id);
  return [...orIds, ...rest];
}

function hfConfigured() {
  return Boolean(hfKey());
}

function openrouterConfiguredFlag() {
  return openrouterConfigured();
}

module.exports = {
  listModels,
  getProvider,
  PROVIDERS,
  HF_CATALOG,
  OR_CATALOG,
  hfKey,
  openrouterKey,
  hfFallbackOrder,
  freeFallbackOrder,
  hfConfigured,
  openrouterConfigured: openrouterConfiguredFlag,
  validModelIds: () => PROVIDERS.map((p) => p.id),
};
