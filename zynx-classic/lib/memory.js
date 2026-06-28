const fs = require("fs");
const { validModelIds, ollamaAvailable } = require("./models");
const { defaultAgents } = require("./agents");
const { normalizeInstalled } = require("./plugins");
const { normalizeLocalScripts } = require("./scripts");
const { DEFAULT_OR_MODEL } = require("./openrouter-models");
const { openrouterConfigured } = require("./openrouter-keys");
const { get } = require("./env");
const { memoryFile, ensureUserDir, sanitizeUserId } = require("./users");
const { migrateToConversations, memoryWithLegacyMessages } = require("./conversations");

const VALID_MODELS = validModelIds();

const FORCED_MODE = "normal";
const AGENTS_TIER_HF = "qwen-kimi-glm-team-v1";
const AGENTS_TIER_OR = "or-kimi-glm-team-v1";

function activeAgentsTier() {
  if (openrouterConfigured()) return AGENTS_TIER_OR;
  return AGENTS_TIER_HF;
}

function defaultModelForNewUser() {
  if (openrouterConfigured()) return DEFAULT_OR_MODEL;
  if (get("GEMINI_API_KEY") || get("GOOGLE_API_KEY")) return "gemini";
  if (get("GROQ_API_KEY")) return "groq";
  if (ollamaAvailable()) return "ollama";
  return DEFAULT_OR_MODEL;
}

function normalizeModelId(model) {
  if (model === "openrouter") return DEFAULT_OR_MODEL;
  if (model === "or-llama") return DEFAULT_OR_MODEL;
  return model;
}

const DEFAULT = {
  settings: {
    mode: FORCED_MODE,
    displayName: "User",
    model: defaultModelForNewUser(),
    useResponseCache: true,
    theme: "dark",
    hfCustomModel: "",
    agentsTier: activeAgentsTier(),
    autoRoute: true,
    customSystemPrompt: "",
  },
  agentsEnabled: false,
  agents: null,
  plugins: [],
  savedScripts: [],
  conversations: [],
  activeConversationId: null,
};

function applyDevTeam() {
  return defaultAgents();
}

const HF_TO_OR = {
  "hf-kimi": "or-kimi",
  "hf-kimi-code": "or-kimi-code",
  "hf-qwen36": "or-qwen36",
  glm: "or-glm",
  "hf-gpt-oss": "or-gpt-oss",
  "hf-deepseek-v4": "or-deepseek-v4",
  "hf-flash": "or-flash",
};

function preferOpenRouterModel(model) {
  model = normalizeModelId(model);
  if (openrouterConfigured() && HF_TO_OR[model]) return HF_TO_OR[model];
  return model;
}

function pickBestSingleModel(model) {
  model = preferOpenRouterModel(model);
  if (model === "ollama" && !ollamaAvailable()) {
    return defaultModelForNewUser();
  }
  if (!model || !VALID_MODELS.includes(model)) {
    return defaultModelForNewUser();
  }
  return model;
}

function migrateTier(data) {
  const tier = activeAgentsTier();
  if (data.settings?.agentsTier === tier) return null;
  data.settings = { ...DEFAULT.settings, ...(data.settings || {}) };
  data.settings.agentsTier = tier;
  data.settings.model = pickBestSingleModel(data.settings.model);
  data.agents = applyDevTeam();
  data.settings.mode = FORCED_MODE;
  return data;
}

function normalizeMemoryData(data, userId) {
  const migrated = migrateTier(data);
  if (migrated) {
    writeMemory(userId, migrated);
    data = migrated;
  }

  const settings = { ...DEFAULT.settings, ...(data.settings || {}) };
  settings.mode = FORCED_MODE;
  settings.model = pickBestSingleModel(settings.model);
  if (!VALID_MODELS.includes(settings.model)) {
    settings.model = defaultModelForNewUser();
  }
  settings.model = preferOpenRouterModel(settings.model);
  if (!settings.theme) settings.theme = "dark";
  if (typeof settings.hfCustomModel !== "string") {
    settings.hfCustomModel = "";
  }
  if (settings.autoRoute === undefined) settings.autoRoute = true;
  settings.agentsTier = activeAgentsTier();

  const agents = applyDevTeam();
  const agentsEnabled =
    data.agentsEnabled !== undefined ? Boolean(data.agentsEnabled) : DEFAULT.agentsEnabled;
  const plugins = normalizeInstalled(data.plugins).filter(
    (p) => p.id !== "ui-themes" && p.id !== "caveman-turbo"
  );
  const savedScripts = normalizeLocalScripts(data.savedScripts);
  const withConversations = migrateToConversations({ ...data });
  return memoryWithLegacyMessages({
    settings,
    agents,
    agentsEnabled,
    plugins,
    savedScripts,
    conversations: withConversations.conversations,
    activeConversationId: withConversations.activeConversationId,
  });
}

function readMemory(userId = "default") {
  const id = sanitizeUserId(userId);
  const file = memoryFile(id);
  if (!fs.existsSync(file)) {
    const fresh = structuredClone(DEFAULT);
    fresh.agents = defaultAgents();
    fresh.plugins = [];
    fresh.savedScripts = [];
    const { createConversation } = require("./conversations");
    createConversation(fresh);
    writeMemory(id, fresh);
    return memoryWithLegacyMessages(fresh);
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return normalizeMemoryData(data, id);
  } catch {
    const fresh = structuredClone(DEFAULT);
    fresh.agents = defaultAgents();
    fresh.plugins = [];
    fresh.savedScripts = [];
    const { createConversation } = require("./conversations");
    createConversation(fresh);
    return memoryWithLegacyMessages(fresh);
  }
}

function writeMemory(userId, data) {
  const id = sanitizeUserId(userId);
  ensureUserDir(id);
  const { messages, ...toSave } = data;
  fs.writeFileSync(memoryFile(id), JSON.stringify(toSave, null, 2), "utf8");
}

module.exports = { readMemory, writeMemory, DEFAULT, FORCED_MODE, applyDevTeam };
