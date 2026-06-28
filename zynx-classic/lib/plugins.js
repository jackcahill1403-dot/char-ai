const fs = require("fs");
const path = require("path");

const CATALOG_FILE = path.join(__dirname, "..", "plugins", "catalog.json");
const BUNDLED_DIR = path.join(__dirname, "..", "plugins", "bundled");

function loadCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
  } catch {
    return [];
  }
}

function loadBundledModule(id) {
  const file = path.join(BUNDLED_DIR, `${id}.js`);
  if (!fs.existsSync(file)) return null;
  try {
    delete require.cache[require.resolve(file)];
    return require(file);
  } catch {
    return null;
  }
}

function normalizeInstalled(list) {
  if (!Array.isArray(list)) return [];
  const catalogIds = new Set(loadCatalog().map((p) => p.id));
  return list
    .filter((p) => catalogIds.has(p.id))
    .map((p) => ({
      id: p.id,
      enabled: p.enabled !== false,
      installedAt: p.installedAt || new Date().toISOString(),
    }));
}

function getInstalledState(installedList) {
  const catalog = loadCatalog();
  const installed = normalizeInstalled(installedList);
  const installedMap = new Map(installed.map((p) => [p.id, p]));

  return catalog.map((meta) => {
    const row = installedMap.get(meta.id);
    return {
      ...meta,
      installed: Boolean(row),
      enabled: Boolean(row?.enabled),
      installedAt: row?.installedAt || null,
    };
  });
}

function installPlugin(installedList, id) {
  const catalog = loadCatalog();
  if (!catalog.some((p) => p.id === id)) {
    throw new Error("Unknown plugin.");
  }
  if (!loadBundledModule(id)) {
    throw new Error("Plugin files missing.");
  }
  const list = normalizeInstalled(installedList).filter((p) => p.id !== id);
  list.push({ id, enabled: true, installedAt: new Date().toISOString() });
  return list;
}

function uninstallPlugin(installedList, id) {
  return normalizeInstalled(installedList).filter((p) => p.id !== id);
}

function togglePlugin(installedList, id, enabled) {
  const list = normalizeInstalled(installedList);
  const row = list.find((p) => p.id === id);
  if (!row) throw new Error("Plugin not installed.");
  row.enabled = Boolean(enabled);
  return list;
}

function getEnabledModules(installedList) {
  const ids = normalizeInstalled(installedList)
    .filter((p) => p.enabled)
    .map((p) => p.id);
  return ids.map(loadBundledModule).filter(Boolean);
}

function isPluginEnabled(installedList, id) {
  return normalizeInstalled(installedList).some((p) => p.id === id && p.enabled);
}

function matchesAgent(plugin, ctx) {
  if (!plugin.targetAgents?.length) return true;
  const id = (ctx.agentId || "").toLowerCase();
  const name = (ctx.agentName || "").toLowerCase();
  return plugin.targetAgents.some(
    (t) => id.includes(t) || name.includes(t)
  );
}

function applyAgentPrompts(role, ctx, installedList) {
  const extras = [];
  for (const plugin of getEnabledModules(installedList)) {
    if (!plugin.agentPrompt || !matchesAgent(plugin, ctx)) continue;
    const bit = plugin.agentPrompt(ctx);
    if (bit) extras.push(bit);
  }
  if (!extras.length) return role;
  return `${role}\n\n${extras.join("\n\n")}`;
}

function applyUserMessage(message, ctx, installedList) {
  let out = message;
  const fullCtx = { ...ctx, userMessage: message };
  for (const plugin of getEnabledModules(installedList)) {
    if (!plugin.userMessage) continue;
    out = plugin.userMessage({ ...fullCtx, userMessage: out });
  }
  return out;
}

function applyFinalResponse(text, ctx, installedList) {
  let out = text;
  const fullCtx = { ...ctx, text: out };
  for (const plugin of getEnabledModules(installedList)) {
    if (!plugin.finalResponse) continue;
    out = plugin.finalResponse({ ...fullCtx, text: out });
  }
  return out;
}

module.exports = {
  loadCatalog,
  getInstalledState,
  normalizeInstalled,
  installPlugin,
  uninstallPlugin,
  togglePlugin,
  applyAgentPrompts,
  applyUserMessage,
  applyFinalResponse,
  isPluginEnabled,
};
