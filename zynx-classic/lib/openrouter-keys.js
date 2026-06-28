const { get } = require("./env");
const OR_CATALOG = require("./openrouter-models");

/** @type {Map<string, Set<number>>} */
const exhausted = new Map();
/** @type {Map<string, number>} */
const roundRobin = new Map();

function parseKeyList(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

function modelEnvSlug(modelId) {
  return String(modelId || "")
    .replace(/^or-/, "")
    .toUpperCase()
    .replace(/-/g, "_");
}

function listGlobalOpenRouterKeys() {
  const fromBulk = parseKeyList(get("OPENROUTER_API_KEYS"));
  if (fromBulk.length) return fromBulk;

  const keys = [];
  const primary = get("OPENROUTER_API_KEY");
  if (primary) keys.push(primary);

  for (let i = 2; i <= 20; i++) {
    const k = get(`OPENROUTER_API_KEY_${i}`);
    if (k) keys.push(k);
  }
  return keys;
}

function listKeysForModel(modelId) {
  const slug = modelEnvSlug(modelId);
  const multi = parseKeyList(get(`OPENROUTER_KEYS_OR_${slug}`));
  if (multi.length) {
    return { modelId, keys: multi, source: "dedicated", envVar: `OPENROUTER_KEYS_OR_${slug}` };
  }
  const single = get(`OPENROUTER_KEY_OR_${slug}`);
  if (single) {
    return { modelId, keys: [single], source: "dedicated", envVar: `OPENROUTER_KEY_OR_${slug}` };
  }
  const global = listGlobalOpenRouterKeys();
  return { modelId, keys: global, source: "global", envVar: "OPENROUTER_API_KEYS" };
}

function listOpenRouterKeys() {
  return listGlobalOpenRouterKeys();
}

function poolId(modelId) {
  const { source, envVar } = listKeysForModel(modelId);
  return `${modelId || "__global__"}:${source}:${envVar}`;
}

function getExhaustedSet(modelId) {
  const id = poolId(modelId);
  if (!exhausted.has(id)) exhausted.set(id, new Set());
  return exhausted.get(id);
}

function nextAvailableIndex(modelId) {
  const { keys } = listKeysForModel(modelId);
  if (!keys.length) return -1;
  const ex = getExhaustedSet(modelId);
  const start = roundRobin.get(poolId(modelId)) || 0;

  for (let offset = 0; offset < keys.length; offset++) {
    const idx = (start + offset) % keys.length;
    if (!ex.has(idx)) return idx;
  }
  return -1;
}

function getActiveKeyEntry(modelId) {
  const pool = listKeysForModel(modelId);
  const index = nextAvailableIndex(modelId);
  if (index < 0) return null;
  return {
    index,
    key: pool.keys[index],
    total: pool.keys.length,
    modelId,
    source: pool.source,
    envVar: pool.envVar,
  };
}

function openrouterKey(modelId) {
  return getActiveKeyEntry(modelId)?.key || getActiveKeyEntry(null)?.key || "";
}

function openrouterConfigured() {
  if (listGlobalOpenRouterKeys().length) return true;
  return OR_CATALOG.some((m) => listKeysForModel(m.id).source === "dedicated");
}

function shouldRotateKey(reason) {
  return ["insufficient_balance", "auth_failed", "http_402", "http_401", "http_403"].includes(
    reason
  );
}

function markKeyExhausted(modelId, index) {
  const pool = listKeysForModel(modelId);
  if (index < 0 || index >= pool.keys.length) return;
  getExhaustedSet(modelId).add(index);
  roundRobin.set(poolId(modelId), (index + 1) % pool.keys.length);
}

function resetKeyPool() {
  exhausted.clear();
  roundRobin.clear();
}

function keyPoolStatus(modelId) {
  const pool = listKeysForModel(modelId);
  const ex = getExhaustedSet(modelId);
  const activeIndex = nextAvailableIndex(modelId);
  return {
    modelId: modelId || null,
    configured: pool.keys.length > 0,
    source: pool.source,
    envVar: pool.envVar,
    total: pool.keys.length,
    available: pool.keys.length - ex.size,
    exhaustedCount: ex.size,
    exhaustedIndices: [...ex].sort((a, b) => a - b),
    activeIndex: activeIndex >= 0 ? activeIndex + 1 : null,
    allExhausted: pool.keys.length > 0 && ex.size >= pool.keys.length,
  };
}

function allModelKeyPools() {
  const pools = OR_CATALOG.map((m) => ({ ...keyPoolStatus(m.id), label: m.label }));
  const global = keyPoolStatus(null);
  if (global.configured) pools.push({ ...global, modelId: "global-fallback", label: "Global fallback" });
  return pools;
}

/** Safe diagnostic — variable names only, never secret values. */
function openrouterEnvCheck() {
  const perModel = OR_CATALOG.map((m) => {
    const slug = modelEnvSlug(m.id);
    const single = `OPENROUTER_KEY_OR_${slug}`;
    const multi = `OPENROUTER_KEYS_OR_${slug}`;
    const pool = listKeysForModel(m.id);
    return {
      modelId: m.id,
      label: m.label,
      envVar: pool.envVar,
      set: pool.keys.length > 0,
      keyCount: pool.keys.length,
      source: pool.source,
      dedicatedSingle: Boolean(get(single)),
      dedicatedMulti: Boolean(get(multi)),
    };
  });
  const globalKeys = listGlobalOpenRouterKeys();
  return {
    configured: openrouterConfigured(),
    onRender: process.env.RENDER === "true",
    global: {
      OPENROUTER_API_KEYS: Boolean(get("OPENROUTER_API_KEYS")),
      OPENROUTER_API_KEY: Boolean(get("OPENROUTER_API_KEY")),
      keyCount: globalKeys.length,
    },
    perModel,
  };
}

module.exports = {
  modelEnvSlug,
  listGlobalOpenRouterKeys,
  listKeysForModel,
  listOpenRouterKeys,
  openrouterConfigured,
  openrouterKey,
  getActiveKeyEntry,
  shouldRotateKey,
  markKeyExhausted,
  resetKeyPool,
  keyPoolStatus,
  allModelKeyPools,
  openrouterEnvCheck,
};
