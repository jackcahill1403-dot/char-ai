const express = require("express");
const path = require("path");
const { loadEnv } = require("./lib/env");
const { listModels, validModelIds, DEFAULT_MODEL } = require("./lib/models");
const { callModel } = require("./lib/llm");
const { read, write, activeConversation, freshConversation, sanitizeId } = require("./lib/store");
const { APP_NAME, TAGLINE } = require("./lib/branding");
const { listPlugins, validPluginIds } = require("./lib/plugins");

loadEnv();

const app = express();
const PORT = process.env.PORT || 3849;

app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, _res, next) => {
  req.userId = sanitizeId(req.headers["x-user-id"] || req.query.userId || req.body?.userId || "default");
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, app: APP_NAME }));

app.get("/api/models", (req, res) => {
  const data = read(req.userId);
  res.json({ models: listModels(), active: data.settings.model || DEFAULT_MODEL });
});

app.get("/api/state", (req, res) => {
  const data = read(req.userId);
  const conv = activeConversation(data);
  res.json({
    app: APP_NAME,
    tagline: TAGLINE,
    settings: data.settings,
    conversations: data.conversations.map((c) => ({ id: c.id, title: c.title, model: c.model })),
    activeId: data.activeId,
    messages: conv.messages,
  });
});

app.post("/api/settings", (req, res) => {
  const data = read(req.userId);
  const { displayName, model, customPrompt, theme } = req.body || {};
  if (displayName !== undefined) data.settings.displayName = String(displayName).slice(0, 60);
  if (model !== undefined && validModelIds().includes(model)) data.settings.model = model;
  if (customPrompt !== undefined) data.settings.customPrompt = String(customPrompt).slice(0, 2000);
  if (theme !== undefined) data.settings.theme = theme === "dark" ? "dark" : "light";
  write(req.userId, data);
  res.json({ ok: true, settings: data.settings });
});

app.get("/api/plugins", (req, res) => {
  const data = read(req.userId);
  res.json({ plugins: listPlugins(data.settings.plugins || []) });
});

app.post("/api/plugins/toggle", (req, res) => {
  const data = read(req.userId);
  const { id, enabled } = req.body || {};
  if (!validPluginIds().includes(id)) return res.status(400).json({ error: "Unknown plugin." });
  const set = new Set(data.settings.plugins || []);
  if (enabled) set.add(id);
  else set.delete(id);
  data.settings.plugins = [...set];
  write(req.userId, data);
  res.json({ plugins: listPlugins(data.settings.plugins) });
});

app.post("/api/conversations", (req, res) => {
  const data = read(req.userId);
  const conv = freshConversation(data.settings.model || DEFAULT_MODEL);
  data.conversations.unshift(conv);
  data.activeId = conv.id;
  write(req.userId, data);
  res.json({ activeId: conv.id, conversations: data.conversations.map((c) => ({ id: c.id, title: c.title, model: c.model })) });
});

app.post("/api/conversations/:id/activate", (req, res) => {
  const data = read(req.userId);
  if (!data.conversations.some((c) => c.id === req.params.id)) {
    return res.status(404).json({ error: "Conversation not found." });
  }
  data.activeId = req.params.id;
  write(req.userId, data);
  const conv = activeConversation(data);
  res.json({ activeId: data.activeId, messages: conv.messages });
});

app.delete("/api/conversations/:id", (req, res) => {
  const data = read(req.userId);
  data.conversations = data.conversations.filter((c) => c.id !== req.params.id);
  if (!data.conversations.length) data.conversations = [freshConversation()];
  if (!data.conversations.some((c) => c.id === data.activeId)) data.activeId = data.conversations[0].id;
  write(req.userId, data);
  const conv = activeConversation(data);
  res.json({
    activeId: data.activeId,
    conversations: data.conversations.map((c) => ({ id: c.id, title: c.title, model: c.model })),
    messages: conv.messages,
  });
});

app.post("/api/chat/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const content = String(req.body?.content || "").trim();
    if (!content) {
      send({ error: "Message cannot be empty." });
      return res.end();
    }
    const data = read(req.userId);
    const conv = activeConversation(data);
    conv.messages.push({ role: "user", content, ts: new Date().toISOString() });

    const history = conv.messages.map((m) => ({ role: m.role, content: m.content }));
    const result = await callModel(data.settings.model, history, {
      displayName: data.settings.displayName,
      customPrompt: data.settings.customPrompt,
      plugins: data.settings.plugins || [],
      onStream: (delta) => send({ type: "delta", delta }),
    });

    if (!result.ok) {
      conv.messages.pop();
      write(req.userId, data);
      send({ error: friendlyError(result) });
      return res.end();
    }

    conv.messages.push({
      role: "assistant",
      content: result.content,
      ...(result.thinking ? { thinking: result.thinking } : {}),
      model: result.modelId || data.settings.model,
      ts: new Date().toISOString(),
    });

    if (conv.messages.length === 2) conv.title = await makeTitle(data, content);
    write(req.userId, data);

    send({
      done: true,
      messages: conv.messages,
      conversations: data.conversations.map((c) => ({ id: c.id, title: c.title, model: c.model })),
      activeId: data.activeId,
    });
  } catch (err) {
    send({ error: err.message || "Request failed." });
  }
  res.end();
});

async function makeTitle(data, firstMsg) {
  try {
    const r = await callModel(data.settings.model, [
      { role: "user", content: `Give a 3-6 word title for a plan/workflow chat that starts with: "${firstMsg.slice(0, 200)}". Title only, no quotes.` },
    ], { displayName: data.settings.displayName });
    if (r.ok && r.content) return r.content.trim().replace(/^["']|["']$/g, "").slice(0, 60);
  } catch {
    /* ignore */
  }
  return firstMsg.slice(0, 40);
}

function friendlyError(r) {
  if (r.reason === "no_key") return r.detail;
  if (r.reason === "network") return "Couldn't reach OpenRouter. Check your connection.";
  if (r.httpStatus === 401 || r.httpStatus === 403) return "OpenRouter rejected the key for this model.";
  if (r.httpStatus === 429) return "Rate limited by OpenRouter — try again shortly.";
  return r.detail || "The model failed to respond.";
}

app.listen(PORT, () => console.log(`${APP_NAME} running at http://localhost:${PORT}`));
