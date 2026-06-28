const { getProvider, listModels } = require("./models");

/** Similar OpenRouter models — tried before unrelated providers. */
const OR_SIBLINGS = {
  "or-kimi": ["or-kimi-code", "or-flash", "or-glm", "or-qwen36"],
  "or-kimi-code": ["or-kimi", "or-glm", "or-qwen36", "or-deepseek-v4"],
  "or-qwen36": ["or-glm", "or-kimi-code", "or-flash", "or-kimi"],
  "or-glm": ["or-qwen36", "or-kimi-code", "or-kimi", "or-deepseek-v4"],
  "or-gpt-oss": ["or-kimi", "or-deepseek-v4", "or-flash"],
  "or-deepseek-v4": ["or-flash", "or-glm", "or-kimi-code", "or-qwen36"],
  "or-flash": ["or-deepseek-v4", "or-kimi", "or-qwen36", "or-glm"],
};

function configuredModelIds() {
  return new Set(listModels().filter((m) => m.configured).map((m) => m.id));
}

function siblingFallbackOrder(preferredId) {
  const configured = configuredModelIds();
  const siblings = OR_SIBLINGS[preferredId] || [];
  return siblings.filter((id) => configured.has(id) && id !== preferredId);
}

function isOpenRouterModel(modelId) {
  const p = getProvider(modelId);
  return Boolean(p?.openrouter);
}

module.exports = { siblingFallbackOrder, isOpenRouterModel, OR_SIBLINGS };
