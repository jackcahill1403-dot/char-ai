const express = require("express");
const path = require("path");
const { loadEnv } = require("./lib/env");
const { readMemory, writeMemory, FORCED_MODE } = require("./lib/memory");
const { listModels, validModelIds } = require("./lib/models");
const { statusForModels, allModelPools } = require("./lib/rate-limiter");
const { normalizeAgents } = require("./lib/agents");
const {
  getInstalledState,
  installPlugin,
  uninstallPlugin,
  togglePlugin,
} = require("./lib/plugins");
const {
  listScripts,
  saveLocalScript,
  publishScript,
  deleteLocalScript,
  updateScriptMeta,
  findScript,
  listFriendFeed,
} = require("./lib/scripts");
const { processChat, pushCommandExchange } = require("./lib/chat-core");
const { loadPresets, getPreset } = require("./lib/agent-presets");
const { getFullStatus } = require("./lib/status");
const { messagesToMarkdown } = require("./lib/export-md");
const { recordFeedback, feedbackSummary } = require("./lib/route-feedback");
const { sanitizeUserId } = require("./lib/users");
const {
  listConversations,
  createConversation,
  switchConversation,
  renameConversation,
  deleteConversation,
  activeMessages,
} = require("./lib/conversations");
const { listAvailableCommands } = require("./lib/command-registry");
const { friendlyLlmError } = require("./lib/errors");
const { APP_NAME } = require("./lib/branding");

loadEnv();

const app = express();
const PORT = process.env.PORT || 3848;
const VALID_MODELS = validModelIds();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use((req, _res, next) => {
  const header = req.headers["x-user-id"];
  const query = req.query && req.query.userId;
  const bodyId = req.body && req.body.userId;
  req.userId = sanitizeUserId(header || query || bodyId || "default");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: APP_NAME });
});

app.get("/api/status", async (req, res) => {
  try {
    res.json(await getFullStatus(req.userId));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/memory", (req, res) => {
  res.json({ ...readMemory(req.userId), userId: req.userId });
});

app.get("/api/models", (req, res) => {
  const mem = readMemory(req.userId);
  res.json({
    models: listModels().filter((m) => m.openrouter || m.configured),
    active: mem.settings.model || "or-kimi",
    autoRoute: mem.settings.autoRoute !== false,
  });
});

app.get("/api/conversations", (req, res) => {
  const mem = readMemory(req.userId);
  res.json({
    conversations: listConversations(mem),
    activeConversationId: mem.activeConversationId,
  });
});

app.post("/api/conversations", (req, res) => {
  const mem = readMemory(req.userId);
  const title = String(req.body?.title || "New chat").slice(0, 60);
  const conv = createConversation(mem, title);
  writeMemory(req.userId, mem);
  res.json({
    conversation: { id: conv.id, title: conv.title, updatedAt: conv.updatedAt, messageCount: 0 },
    activeConversationId: conv.id,
    messages: [],
  });
});

app.post("/api/conversations/:id/activate", (req, res) => {
  const mem = readMemory(req.userId);
  const conv = switchConversation(mem, req.params.id);
  if (!conv) return res.status(404).json({ error: "Conversation not found." });
  writeMemory(req.userId, mem);
  res.json({
    activeConversationId: conv.id,
    messages: conv.messages || [],
    conversation: { id: conv.id, title: conv.title },
  });
});

app.patch("/api/conversations/:id", (req, res) => {
  const mem = readMemory(req.userId);
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Title required." });
  const conv = renameConversation(mem, req.params.id, title);
  if (!conv) return res.status(404).json({ error: "Conversation not found." });
  writeMemory(req.userId, mem);
  res.json({ conversation: { id: conv.id, title: conv.title }, conversations: listConversations(mem) });
});

app.delete("/api/conversations/:id", (req, res) => {
  const mem = readMemory(req.userId);
  deleteConversation(mem, req.params.id);
  writeMemory(req.userId, mem);
  const active = activeMessages(mem);
  res.json({
    conversations: listConversations(mem),
    activeConversationId: mem.activeConversationId,
    messages: active,
  });
});

app.get("/api/commands", (req, res) => {
  const mem = readMemory(req.userId);
  res.json({ commands: listAvailableCommands(mem.plugins) });
});

app.get("/api/usage", (req, res) => {
  const mem = readMemory(req.userId);
  const runPipeline = mem.agentsEnabled && mem.agents?.length;
  const modelIds = runPipeline
    ? [...new Set(mem.agents.map((a) => a.model).filter(Boolean))]
    : [mem.settings.model || "or-kimi"];
  res.json({
    mode: FORCED_MODE,
    cavemanLimits: true,
    locked: true,
    perModel: true,
    perUser: true,
    userId: req.userId,
    agentsEnabled: mem.agentsEnabled,
    activeModel: mem.settings.model || "or-kimi",
    modelIds,
    rateLimit: statusForModels(req.userId, modelIds, {
      devTeam: Boolean(runPipeline && modelIds.length > 1),
    }),
    modelPools: allModelPools(req.userId),
    theme: mem.settings.theme || "light",
  });
});

app.get("/api/agents", (req, res) => {
  const mem = readMemory(req.userId);
  res.json({
    agents: mem.agents,
    agentsEnabled: mem.agentsEnabled,
    models: listModels(),
    presets: loadPresets(),
  });
});

app.post("/api/agents/preset", (req, res) => {
  const mem = readMemory(req.userId);
  const presetId = String(req.body?.id || "").trim();
  const preset = getPreset(presetId);
  if (!preset) return res.status(404).json({ error: "Preset not found." });
  mem.agents = normalizeAgents(preset.agents);
  mem.agentsEnabled = true;
  writeMemory(req.userId, mem);
  res.json({ agents: mem.agents, agentsEnabled: true, preset: preset.id });
});

app.put("/api/agents", (req, res) => {
  const mem = readMemory(req.userId);
  const { agents, agentsEnabled } = req.body || {};
  if (agents !== undefined) mem.agents = normalizeAgents(agents);
  if (agentsEnabled !== undefined) mem.agentsEnabled = Boolean(agentsEnabled);
  writeMemory(req.userId, mem);
  res.json({ agents: mem.agents, agentsEnabled: mem.agentsEnabled });
});

app.get("/api/plugins", (req, res) => {
  const mem = readMemory(req.userId);
  res.json({ plugins: getInstalledState(mem.plugins) });
});

app.post("/api/plugins/install", (req, res) => {
  const mem = readMemory(req.userId);
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "Plugin id required." });
  try {
    mem.plugins = installPlugin(mem.plugins, id);
    writeMemory(req.userId, mem);
    res.json({ plugins: getInstalledState(mem.plugins) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/plugins/uninstall", (req, res) => {
  const mem = readMemory(req.userId);
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "Plugin id required." });
  mem.plugins = uninstallPlugin(mem.plugins, id);
  writeMemory(req.userId, mem);
  res.json({ plugins: getInstalledState(mem.plugins) });
});

app.post("/api/plugins/toggle", (req, res) => {
  const mem = readMemory(req.userId);
  const id = String(req.body?.id || "").trim();
  const { enabled } = req.body || {};
  if (!id) return res.status(400).json({ error: "Plugin id required." });
  try {
    mem.plugins = togglePlugin(mem.plugins, id, enabled);
    writeMemory(req.userId, mem);
    res.json({ plugins: getInstalledState(mem.plugins) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/settings", (req, res) => {
  const mem = readMemory(req.userId);
  const { displayName, model, useResponseCache, theme, cavemanDict, hfCustomModel, autoRoute } =
    req.body || {};
  mem.settings.mode = FORCED_MODE;
  if (displayName !== undefined) {
    mem.settings.displayName = String(displayName).slice(0, 40) || "User";
  }
  if (model !== undefined) {
    if (!VALID_MODELS.includes(model)) return res.status(400).json({ error: "Invalid model." });
    mem.settings.model = model;
  }
  if (autoRoute !== undefined) mem.settings.autoRoute = Boolean(autoRoute);
  if (useResponseCache !== undefined) mem.settings.useResponseCache = Boolean(useResponseCache);
  if (theme !== undefined) mem.settings.theme = theme === "dark" ? "dark" : "light";
  if (cavemanDict !== undefined && typeof cavemanDict === "object") {
    const clean = {};
    for (const [k, v] of Object.entries(cavemanDict)) {
      if (k && typeof v === "string") clean[String(k).slice(0, 40)] = v.slice(0, 80);
    }
    mem.settings.cavemanDict = clean;
  }
  if (hfCustomModel !== undefined) {
    mem.settings.hfCustomModel = String(hfCustomModel).slice(0, 120);
  }
  writeMemory(req.userId, mem);
  res.json({ settings: mem.settings, models: listModels() });
});

app.post("/api/feedback", (req, res) => {
  const vote = Number(req.body?.vote);
  const modelId = String(req.body?.modelId || req.body?.routedModel || "").trim();
  const reason = String(req.body?.reason || req.body?.routeReason || "general").trim();
  if (!modelId || ![1, -1].includes(vote)) {
    return res.status(400).json({ error: "modelId and vote (1 or -1) required." });
  }
  const row = recordFeedback(req.userId, { modelId, reason, vote });
  res.json({ ok: true, feedback: row, top: feedbackSummary(req.userId) });
});

app.delete("/api/messages", (req, res) => {
  const mem = readMemory(req.userId);
  const conv = createConversation(mem, "New chat");
  writeMemory(req.userId, mem);
  res.json({ messages: [], activeConversationId: conv.id, conversations: listConversations(mem) });
});

app.get("/api/export/markdown", (req, res) => {
  const mem = readMemory(req.userId);
  const md = messagesToMarkdown(activeMessages(mem), mem.settings.displayName);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="atlas-chat.md"');
  res.send(md);
});

app.get("/api/scripts", (req, res) => {
  const mem = readMemory(req.userId);
  res.json({ ...listScripts(mem.savedScripts), feed: listFriendFeed() });
});

app.post("/api/scripts", (req, res) => {
  const mem = readMemory(req.userId);
  const name = String(req.body?.name || "").trim();
  const content = String(req.body?.content || "").trim();
  const folder = req.body?.folder;
  const tags = req.body?.tags;
  try {
    mem.savedScripts = saveLocalScript(mem.savedScripts, name, content, { folder, tags });
    writeMemory(req.userId, mem);
    res.json(listScripts(mem.savedScripts));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/scripts/:slug", (req, res) => {
  const mem = readMemory(req.userId);
  try {
    mem.savedScripts = updateScriptMeta(mem.savedScripts, req.params.slug, req.body || {});
    writeMemory(req.userId, mem);
    res.json(listScripts(mem.savedScripts));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/scripts/publish", (req, res) => {
  const mem = readMemory(req.userId);
  const slug = String(req.body?.slug || req.body?.name || "").trim();
  try {
    mem.savedScripts = publishScript(mem.savedScripts, slug, mem.settings.displayName || "user");
    writeMemory(req.userId, mem);
    res.json(listScripts(mem.savedScripts));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/scripts/run", (req, res) => {
  const mem = readMemory(req.userId);
  const slug = String(req.body?.slug || req.body?.name || "").trim();
  const script = findScript(slug, mem.savedScripts);
  if (!script) return res.status(404).json({ error: "Script not found." });
  const userLine = `!run ${script.slug}`;
  const reply = `[Script: ${script.name} (${script.source}) — FREE replay]\n\n${script.content}`;
  const messages = pushCommandExchange(req.userId, mem, userLine, reply, {
    command: "!run",
    script: script.slug,
    scriptSource: script.source,
    badge: "script",
  });
  res.json({
    messages,
    llm: { used: false, free: true, script: script.slug, badge: "script" },
    rateLimit: statusForModels(req.userId, [mem.settings.model || "or-kimi"]),
  });
});

app.delete("/api/scripts/:slug", (req, res) => {
  const mem = readMemory(req.userId);
  mem.savedScripts = deleteLocalScript(mem.savedScripts, req.params.slug);
  writeMemory(req.userId, mem);
  res.json(listScripts(mem.savedScripts));
});

function chatBody(req) {
  const body = req.body || {};
  return {
    content: body.content,
    userId: req.userId,
    regenerate: Boolean(body.regenerate),
    editIndex: body.editIndex !== undefined && body.editIndex !== null ? Number(body.editIndex) : null,
    attachment: body.attachment || null,
  };
}

app.post("/api/chat", async (req, res) => {
  try {
    const result = await processChat(chatBody(req));
    if (result.error) {
      if (result.status === 429) {
        res.setHeader("Retry-After", String(result.retryAfterSeconds || 60));
      }
      const msg = result.llm?.error || friendlyLlmError(result.reason, result.detail) || result.error;
      return res.status(result.status || 400).json({ error: msg, rateLimit: result.rateLimit });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Chat failed." });
  }
});

app.post("/api/chat/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const result = await processChat({
      ...chatBody(req),
      stream: (event) => {
        const payload = typeof event === "string" ? { type: "delta", delta: event } : event;
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      },
    });
    if (result.error) {
      res.write(`data: ${JSON.stringify({ error: result.error, rateLimit: result.rateLimit })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ done: true, ...result })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

app.post("/api/hook/discord", async (req, res) => {
  const secret = process.env.DISCORD_WEBHOOK_SECRET;
  if (!secret || req.body?.secret !== secret) {
    return res.status(401).json({ error: "Invalid webhook secret." });
  }
  const content = String(req.body?.content || "").trim();
  if (!content) return res.status(400).json({ error: "content required" });
  try {
    const result = await processChat({
      content: req.body?.asAgents ? `!agents ${content}` : content,
    });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error, rateLimit: result.rateLimit });
    }
    const last = result.messages[result.messages.length - 1];
    res.json({ reply: last?.content, llm: result.llm, rateLimit: result.rateLimit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${APP_NAME} running at http://localhost:${PORT}`);
});
