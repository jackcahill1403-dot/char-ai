const { buildPoolStatus } = require("./rate-limiter");
const { siblingFallbackOrder } = require("./model-fallback");
const { listModels } = require("./models");

function isModelLimited(userId, modelId) {
  if (!modelId) return true;
  return buildPoolStatus(userId, modelId).limited;
}

function configuredModelIds() {
  return new Set(listModels().filter((m) => m.configured).map((m) => m.id));
}

/** Preferred first, then sibling fallbacks — only models with quota left. */
function availableModelCandidates(userId, preferredId) {
  const configured = configuredModelIds();
  const order = [preferredId, ...siblingFallbackOrder(preferredId)].filter(
    (id, i, arr) => id && configured.has(id) && arr.indexOf(id) === i
  );
  return order.filter((id) => !isModelLimited(userId, id));
}

function pickAvailableModel(userId, preferredId) {
  return availableModelCandidates(userId, preferredId)[0] || null;
}

function pickAvailableFromList(userId, modelIds) {
  for (const id of modelIds || []) {
    const pick = pickAvailableModel(userId, id);
    if (pick) return pick;
  }
  return null;
}

module.exports = {
  isModelLimited,
  availableModelCandidates,
  pickAvailableModel,
  pickAvailableFromList,
};
