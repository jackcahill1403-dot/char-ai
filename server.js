const express = require("express");
const fs = require("fs");
const path = require("path");
const { buildReply } = require("./lib/responder");
const { applyLearning, isUsefulFact } = require("./lib/learn");
const {
  readMemoryStore,
  writeMemoryStore,
  clearEntries,
  upsertEntry,
  listUsers,
  sanitizeUserId,
  userDir,
} = require("./lib/memory-store");
const {
  AutoFeeder,
  enqueue,
  readQueue,
  clearQueue,
} = require("./lib/auto-feeder");
const { scanMessages } = require("./lib/background-learner");
const { reflect } = require("./lib/reflector");
const { generateFact, poolSize: factPoolSize } = require("./lib/fact-generator");
const { callLlm, isLlmConfigured, callLlmAsCharacter } = require("./lib/llm-client");
const { loadEnv } = require("./lib/env");
const rateLimiter = require("./lib/rate-limiter");
const {
  register,
  login,
  getAccount,
  updateProfile,
  listAccounts,
  publicView,
} = require("./lib/user-store");
const {
  listAllCharacters,
  getCharacter,
  saveCharacter,
  deleteCharacter,
  readCharChat,
  writeCharChat,
  clearCharChat,
  bumpUsage,
  getRecommendations,
  migrateLegacyChat,
  listSessions,
  getSession,
  createSession,
  deleteSession,
  renameSession,
  appendMessageToSession,
  editUserMessage,
  removeLastAssistantMessage,
  newId,
} = require("./lib/character-store");

loadEnv();

const app = express();
const PORT = process.env.PORT || 3847;
const DATA_DIR = path.join(__dirname, "data");
const USERS_DIR = path.join(DATA_DIR, "users");
const KNOWLEDGE_POOL_FILE = path.join(DATA_DIR, "knowledge-pool.json");
const REFLECTION_STATE_FILE = path.join(DATA_DIR, "reflection-state.json");

const VALID_MODES = ["normal", "silly", "serious"];
const VALID_MEMORY_CATEGORIES = ["fact", "preference", "name", "rule", "correction"];

const DEFAULT_CHAT = {
  settings: { mode: "normal", displayName: "User" },
  messages: [],
};

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function migrateLegacyPerUser() {
  const legacyMemory = path.join(DATA_DIR, "memory.json");
  const legacyChat = path.join(DATA_DIR, "chat.json");
  const defaultDir = userDir("default");
  const defaultMemory = path.join(defaultDir, "memory.json");
  const defaultChat = path.join(defaultDir, "chat.json");

  ensureDir(defaultDir);

  if (fs.existsSync(legacyMemory) && !fs.existsSync(defaultMemory)) {
    try {
      const data = JSON.parse(fs.readFileSync(legacyMemory, "utf8"));
      const entries = Array.isArray(data.entries) ? data.entries : Array.isArray(data.learned) ? data.learned : [];
      writeMemoryStore("default", { entries });
      console.log("[migrate] moved legacy memory.json to users/default/");
    } catch {
      /* ignore */
    }
  }

  if (fs.existsSync(legacyChat) && !fs.existsSync(defaultChat)) {
    try {
      const data = JSON.parse(fs.readFileSync(legacyChat, "utf8"));
      writeChat("default", {
        settings: { ...DEFAULT_CHAT.settings, ...data.settings },
        messages: Array.isArray(data.messages) ? data.messages : [],
      });
      console.log("[migrate] moved legacy chat.json to users/default/");
    } catch {
      /* ignore */
    }
  }
}

migrateLegacyPerUser();

app.use((req, _res, next) => {
  const header = req.header("X-User-Id") || req.header("x-user-id");
  const query = req.query && req.query.userId;
  const bodyId = req.body && req.body.userId;
  req.userId = sanitizeUserId(header || query || bodyId || "default");
  next();
});

function chatFile(userId) {
  return path.join(userDir(userId), "chat.json");
}

function readChat(userId) {
  ensureDir(userDir(userId));
  const file = chatFile(userId);
  if (!fs.existsSync(file)) {
    writeChat(userId, DEFAULT_CHAT);
    return { ...DEFAULT_CHAT, messages: [], settings: { ...DEFAULT_CHAT.settings } };
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      settings: { ...DEFAULT_CHAT.settings, ...data.settings },
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  } catch {
    throw new Error("Could not read chat.json. It may be corrupted.");
  }
}

function writeChat(userId, data) {
  ensureDir(userDir(userId));
  fs.writeFileSync(chatFile(userId), JSON.stringify(data, null, 2), "utf8");
}

function readKnowledgePool() {
  if (!fs.existsSync(KNOWLEDGE_POOL_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(KNOWLEDGE_POOL_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function readReflectionState() {
  if (!fs.existsSync(REFLECTION_STATE_FILE)) {
    return { poolIdx: 0, lastRunAt: null, lastGenerated: 0, lastStudied: 0 };
  }
  try {
    return JSON.parse(fs.readFileSync(REFLECTION_STATE_FILE, "utf8"));
  } catch {
    return { poolIdx: 0, lastRunAt: null, lastGenerated: 0, lastStudied: 0 };
  }
}

function writeReflectionState(state) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(REFLECTION_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function isUsefulManualFact(text) {
  const value = String(text || "").trim();
  if (value.length < 3) return false;
  if (/^(hi|hello|hey|yo|lol|haha|ok|okay|yes|no|test)$/i.test(value)) return false;
  if (/^[\W\d]+$/.test(value)) return false;
  return true;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/users", (_req, res) => {
  res.json({ users: listUsers() });
});

app.get("/api/llm-status", (_req, res) => {
  const env = require("./lib/env");
  res.json({
    configured: isLlmConfigured(),
    primary: {
      model: env.get("LLM_MODEL", "gemini-3.5-flash"),
      configured: Boolean(env.get("LLM_API_KEY") || env.get("HF_TOKEN")),
    },
    fallback: {
      model: env.get("FALLBACK_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
      configured: Boolean(env.get("FALLBACK_API_KEY") || env.get("GROQ_API_KEY")),
    },
  });
});

app.get("/api/usage", (req, res) => {
  res.json({ rateLimit: rateLimiter.status(req.userId) });
});

app.get("/api/characters", (req, res) => {
  try {
    res.json({ characters: listAllCharacters(req.userId) });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.get("/api/characters/recommendations", (req, res) => {
  try {
    const data = getRecommendations(req.userId, { limit: 6 });
    res.json(data);
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.get("/api/characters/:id", (req, res) => {
  try {
    const character = getCharacter(req.userId, req.params.id);
    if (!character) return sendError(res, 404, "Character not found.");
    migrateLegacyChat(req.userId, req.params.id, character);
    const sessions = listSessions(req.userId, req.params.id);
    res.json({ character, sessions });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.get("/api/characters/:id/sessions", (req, res) => {
  try {
    const character = getCharacter(req.userId, req.params.id);
    if (!character) return sendError(res, 404, "Character not found.");
    migrateLegacyChat(req.userId, req.params.id, character);
    res.json({ sessions: listSessions(req.userId, req.params.id) });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/characters/:id/sessions", (req, res) => {
  try {
    const character = getCharacter(req.userId, req.params.id);
    if (!character) return sendError(res, 404, "Character not found.");
    const session = createSession(req.userId, req.params.id, character);
    res.json({ ok: true, session });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.get("/api/characters/:id/sessions/:sessionId", (req, res) => {
  try {
    const character = getCharacter(req.userId, req.params.id);
    if (!character) return sendError(res, 404, "Character not found.");
    const session = getSession(req.userId, req.params.id, req.params.sessionId);
    if (!session) return sendError(res, 404, "Session not found.");
    res.json({ character, session });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.patch("/api/characters/:id/sessions/:sessionId", (req, res) => {
  try {
    const { title } = req.body || {};
    const session = renameSession(req.userId, req.params.id, req.params.sessionId, title);
    if (!session) return sendError(res, 404, "Session not found.");
    res.json({ ok: true, session });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.delete("/api/characters/:id/sessions/:sessionId", (req, res) => {
  try {
    deleteSession(req.userId, req.params.id, req.params.sessionId);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

async function generateCharacterReply(character, chatHistory, memoryEntries) {
  if (!isLlmConfigured()) {
    return {
      ok: false,
      reply: `*${character.name} looks at you but seems distant.* (No LLM API key set — add LLM_API_KEY to .env to enable character roleplay.)`,
      meta: { used: false, reason: "no_token" },
    };
  }
  const lastUser = [...chatHistory].reverse().find((m) => m.role === "user");
  const result = await callLlmAsCharacter({
    userMessage: lastUser ? lastUser.content : "",
    character,
    chatHistory,
    entries: memoryEntries,
  });
  if (result.ok) {
    return { ok: true, reply: result.reply, meta: { used: true, model: result.model, provider: result.provider } };
  }
  console.error(`[llm:character] all providers failed: ${result.reason} ${result.detail || ""}`);
  return {
    ok: false,
    reply: `*${character.name} pauses, distracted for a moment.* (LLM unavailable: ${result.reason})`,
    meta: { used: false, reason: result.reason, provider: result.provider },
  };
}

app.post("/api/characters/:id/sessions/:sessionId/chat", rateLimiter.middleware, async (req, res) => {
  try {
    const content = String(req.body?.content || "").trim();
    if (!content) return sendError(res, 400, "Message cannot be empty.");

    const character = getCharacter(req.userId, req.params.id);
    if (!character) return sendError(res, 404, "Character not found.");
    const session = getSession(req.userId, req.params.id, req.params.sessionId);
    if (!session) return sendError(res, 404, "Session not found.");
    const memory = readMemoryStore(req.userId);

    const appended = appendMessageToSession(req.userId, req.params.id, req.params.sessionId, {
      role: "user",
      content,
    });
    if (!appended) return sendError(res, 500, "Could not append message.");

    const { reply, meta } = await generateCharacterReply(character, appended.session.messages, memory.entries);

    const assistantAppend = appendMessageToSession(req.userId, req.params.id, req.params.sessionId, {
      role: "assistant",
      content: reply,
    });
    bumpUsage(req.userId, req.params.id);

    res.json({
      message: assistantAppend.message,
      session: assistantAppend.session,
      llm: meta,
      rateLimit: rateLimiter.status(req.userId),
    });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/characters/:id/sessions/:sessionId/regenerate", rateLimiter.middleware, async (req, res) => {
  try {
    const character = getCharacter(req.userId, req.params.id);
    if (!character) return sendError(res, 404, "Character not found.");
    let session = removeLastAssistantMessage(req.userId, req.params.id, req.params.sessionId);
    if (!session) return sendError(res, 404, "Session not found.");
    const memory = readMemoryStore(req.userId);

    const { reply, meta } = await generateCharacterReply(character, session.messages, memory.entries);
    const appended = appendMessageToSession(req.userId, req.params.id, req.params.sessionId, {
      role: "assistant",
      content: reply,
    });

    res.json({
      message: appended.message,
      session: appended.session,
      llm: meta,
      rateLimit: rateLimiter.status(req.userId),
    });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.patch("/api/characters/:id/sessions/:sessionId/messages/:messageId", rateLimiter.middleware, async (req, res) => {
  try {
    const newContent = String(req.body?.content || "").trim();
    if (!newContent) return sendError(res, 400, "Content cannot be empty.");

    const character = getCharacter(req.userId, req.params.id);
    if (!character) return sendError(res, 404, "Character not found.");
    const edited = editUserMessage(req.userId, req.params.id, req.params.sessionId, req.params.messageId, newContent);
    if (!edited) return sendError(res, 404, "Message not found or not editable.");
    const memory = readMemoryStore(req.userId);

    const { reply, meta } = await generateCharacterReply(character, edited.messages, memory.entries);
    const appended = appendMessageToSession(req.userId, req.params.id, req.params.sessionId, {
      role: "assistant",
      content: reply,
    });
    bumpUsage(req.userId, req.params.id);

    res.json({
      session: appended.session,
      llm: meta,
      rateLimit: rateLimiter.status(req.userId),
    });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/characters", (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (name.length < 2) return sendError(res, 400, "Name must be at least 2 characters.");
    const imageRaw = String(body.image || "").trim();
    // Cap data-URL image at 512KB to keep JSON sane.
    const image = imageRaw.length > 512 * 1024 ? "" : imageRaw;
    const character = saveCharacter(req.userId, {
      id: body.id || name.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
      name,
      avatar: String(body.avatar || "🧑").slice(0, 8) || "🧑",
      image: image || undefined,
      tagline: String(body.tagline || "").slice(0, 120),
      description: String(body.description || "").slice(0, 2000),
      scenario: String(body.scenario || "").slice(0, 1000),
      greeting: String(body.greeting || "").slice(0, 1000),
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 10) : [],
    });
    res.json({ ok: true, character });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.put("/api/characters/:id", (req, res) => {
  try {
    const existing = getCharacter(req.userId, req.params.id);
    if (!existing) return sendError(res, 404, "Character not found.");
    const body = req.body || {};
    const merged = {
      ...existing,
      ...body,
      id: existing.id,
    };
    // Sanitize image: cap size, treat empty string as "no image".
    if ("image" in merged) {
      const img = String(merged.image || "").trim();
      merged.image = img && img.length <= 512 * 1024 ? img : "";
    }
    const character = saveCharacter(req.userId, merged);
    res.json({ ok: true, character });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.delete("/api/characters/:id", (req, res) => {
  try {
    deleteCharacter(req.userId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.delete("/api/characters/:id/chat", (req, res) => {
  try {
    const messages = clearCharChat(req.userId, req.params.id);
    res.json({ ok: true, messages });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/characters/:id/chat", rateLimiter.middleware, async (req, res) => {
  try {
    const content = String(req.body?.content || "").trim();
    if (!content) return sendError(res, 400, "Message cannot be empty.");

    const character = getCharacter(req.userId, req.params.id);
    if (!character) return sendError(res, 404, "Character not found.");

    const chat = readCharChat(req.userId, req.params.id);
    const memory = readMemoryStore(req.userId);

    if (!chat.messages.length && character.greeting) {
      chat.messages.push({
        role: "assistant",
        content: character.greeting,
        timestamp: new Date().toISOString(),
        greeting: true,
      });
    }

    const userMsg = { role: "user", content, timestamp: new Date().toISOString() };
    chat.messages.push(userMsg);

    let reply;
    let llmMeta;
    if (isLlmConfigured()) {
      const result = await callLlmAsCharacter({
        userMessage: content,
        character,
        chatHistory: chat.messages,
        entries: memory.entries,
      });
      if (result.ok) {
        reply = result.reply;
        llmMeta = { used: true, model: result.model, provider: result.provider };
      } else {
        console.error(`[llm:character] all providers failed: ${result.reason} ${result.detail || ""}`);
        reply = `*${character.name} pauses, distracted for a moment.* (LLM unavailable: ${result.reason})`;
        llmMeta = { used: false, reason: result.reason, provider: result.provider };
      }
    } else {
      reply = `*${character.name} looks at you but seems distant.* (No LLM API key set — add LLM_API_KEY to .env to enable character roleplay.)`;
      llmMeta = { used: false, reason: "no_token" };
    }

    const assistantMsg = {
      role: "assistant",
      content: reply,
      timestamp: new Date().toISOString(),
    };
    chat.messages.push(assistantMsg);
    writeCharChat(req.userId, req.params.id, chat);
    bumpUsage(req.userId, req.params.id);

    res.json({
      message: assistantMsg,
      messages: chat.messages,
      llm: llmMeta,
    });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.get("/api/whoami", (req, res) => {
  const account = getAccount(req.userId);
  res.json({
    userId: req.userId,
    account: account ? publicView(account) : null,
  });
});

app.get("/api/accounts", (_req, res) => {
  res.json({ accounts: listAccounts() });
});

app.post("/api/auth/register", (req, res) => {
  try {
    const body = req.body || {};
    const account = register({
      userId: body.userId,
      password: body.password,
      displayName: body.displayName,
      avatar: body.avatar,
    });
    res.json({ ok: true, account });
  } catch (err) {
    sendError(res, 400, err.message);
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const body = req.body || {};
    const account = login({
      userId: body.userId,
      password: body.password,
    });
    res.json({ ok: true, account });
  } catch (err) {
    sendError(res, 401, err.message);
  }
});

app.get("/api/profile", (req, res) => {
  const account = getAccount(req.userId);
  if (!account) return sendError(res, 404, "No account for this user.");
  res.json({ account: publicView(account) });
});

app.put("/api/profile", (req, res) => {
  try {
    const body = req.body || {};
    const account = updateProfile(req.userId, {
      displayName: body.displayName,
      avatar: body.avatar,
      password: body.password,
    });
    if (!account) return sendError(res, 404, "Account not found.");
    res.json({ ok: true, account });
  } catch (err) {
    sendError(res, 400, err.message);
  }
});

app.get("/api/memory", (req, res) => {
  try {
    const chat = readChat(req.userId);
    const memory = readMemoryStore(req.userId);
    res.json({
      userId: req.userId,
      settings: chat.settings,
      messages: chat.messages,
      entries: memory.entries,
      learned: memory.entries,
    });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/chat", rateLimiter.middleware, async (req, res) => {
  const content = (req.body?.content || "").trim();
  if (!content) {
    return sendError(res, 400, "Message cannot be empty.");
  }

  try {
    const chat = readChat(req.userId);
    const memory = readMemoryStore(req.userId);
    const mode = chat.settings.mode;

    if (!VALID_MODES.includes(mode)) {
      return sendError(res, 400, "Invalid mode in settings.");
    }

    const now = new Date().toISOString();
    const userMsg = { role: "user", content, timestamp: now };

    const justSaved = applyLearning(memory.entries, content, chat.messages);
    if (justSaved.length) writeMemoryStore(req.userId, memory);

    let reply;
    let llmMeta = null;
    if (isLlmConfigured()) {
      const llmResult = await callLlm({
        userMessage: content,
        entries: memory.entries,
        mode,
        displayName: chat.settings.displayName,
      });
      if (llmResult.ok) {
        reply = llmResult.reply;
        llmMeta = { model: llmResult.model, used: true, provider: llmResult.provider };
      } else {
        console.error(`[llm] falling back to template: ${llmResult.reason} ${llmResult.detail || ""}`);
        reply = buildReply(content, mode, memory.entries, justSaved);
        llmMeta = { used: false, reason: llmResult.reason };
      }
    } else {
      reply = buildReply(content, mode, memory.entries, justSaved);
      llmMeta = { used: false, reason: "no_token" };
    }

    const assistantMsg = {
      role: "assistant",
      content: reply,
      timestamp: new Date().toISOString(),
    };

    chat.messages.push(userMsg, assistantMsg);
    writeChat(req.userId, chat);

    runBackgroundLearnForUser(req.userId);

    res.json({
      message: assistantMsg,
      messages: chat.messages,
      entries: memory.entries,
      learned: memory.entries,
      justSaved,
      llm: llmMeta,
    });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.put("/api/settings", (req, res) => {
  try {
    const chat = readChat(req.userId);
    const { mode, displayName } = req.body || {};

    if (mode !== undefined) {
      if (!VALID_MODES.includes(mode)) {
        return sendError(res, 400, "Mode must be normal, silly, or serious.");
      }
      chat.settings.mode = mode;
    }

    if (displayName !== undefined) {
      const name = String(displayName).trim().slice(0, 40);
      chat.settings.displayName = name || "User";
    }

    writeChat(req.userId, chat);
    res.json({ settings: chat.settings });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.delete("/api/messages", (req, res) => {
  try {
    const chat = readChat(req.userId);
    chat.messages = [];
    writeChat(req.userId, chat);
    res.json({ ok: true, messages: [] });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.delete("/api/learned", (req, res) => {
  try {
    const entries = clearEntries(req.userId);
    res.json({ ok: true, entries, learned: entries });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/data-center/entry", (req, res) => {
  try {
    const memory = readMemoryStore(req.userId);
    const fact = String(req.body?.fact || "").trim();
    const category = String(req.body?.category || "").trim().toLowerCase();
    const confidenceRaw = Number(req.body?.confidence);
    const sourceMessage = String(req.body?.source_message || fact);

    if (!VALID_MEMORY_CATEGORIES.includes(category)) {
      return sendError(res, 400, "Invalid category.");
    }
    if (!isUsefulManualFact(fact)) {
      return sendError(
        res,
        400,
        "That entry does not look useful enough to save. Add a concrete fact or rule."
      );
    }

    const confidence =
      Number.isFinite(confidenceRaw) && confidenceRaw >= 0 && confidenceRaw <= 1
        ? confidenceRaw
        : 0.9;

    const entry = upsertEntry(memory.entries, {
      fact,
      category,
      confidence,
      source_message: sourceMessage,
    });

    writeMemoryStore(req.userId, memory);
    res.json({ ok: true, entry, entries: memory.entries });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

const autoFeeder = new AutoFeeder({
  upsertEntry,
  readMemoryStore,
  writeMemoryStore,
  isUsefulFact,
});

app.get("/api/data-center/feed", (_req, res) => {
  try {
    res.json(autoFeeder.status());
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/data-center/feed/start", (req, res) => {
  try {
    const intervalSec = Number(req.body?.intervalSec);
    const cfg = autoFeeder.start(intervalSec);
    res.json({ ok: true, ...cfg });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/data-center/feed/stop", (_req, res) => {
  try {
    const cfg = autoFeeder.stop();
    res.json({ ok: true, ...cfg });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/data-center/feed/tick", (_req, res) => {
  try {
    const result = autoFeeder.tick();
    res.json({ ok: true, ...result, status: autoFeeder.status() });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/data-center/queue", (req, res) => {
  try {
    const fact = String(req.body?.fact || "").trim();
    const category = String(req.body?.category || "").trim().toLowerCase();
    const confidence = Number(req.body?.confidence);
    const sourceMessage = String(req.body?.source_message || fact);

    if (!VALID_MEMORY_CATEGORIES.includes(category)) {
      return sendError(res, 400, "Invalid category.");
    }
    if (!isUsefulManualFact(fact)) {
      return sendError(res, 400, "That queued entry does not look useful enough.");
    }

    const queue = enqueue({
      fact,
      category,
      confidence: Number.isFinite(confidence) ? confidence : 0.85,
      source_message: sourceMessage,
    });
    res.json({ ok: true, queue });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.get("/api/data-center/queue", (_req, res) => {
  try {
    res.json({ queue: readQueue() });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.delete("/api/data-center/queue", (_req, res) => {
  try {
    clearQueue();
    res.json({ ok: true, queue: [] });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

autoFeeder.restore();

const BACKGROUND_LEARN_INTERVAL_MS = 20000;
let backgroundLearnTimer = null;
let lastBackgroundLearnAt = null;
let lastBackgroundLearnSaved = 0;

const bgLearnIdx = new Map();

function runBackgroundLearnForUser(userId) {
  try {
    const chat = readChat(userId);
    if (!chat.messages.length) return;
    let idx = bgLearnIdx.get(userId) || 0;
    if (chat.messages.length < idx) idx = 0;

    const memory = readMemoryStore(userId);
    const { saved, nextIdx } = scanMessages({
      messages: chat.messages,
      entries: memory.entries,
      sinceIdx: idx,
    });

    for (const item of saved) {
      upsertEntry(memory.entries, {
        fact: item.fact,
        category: item.category,
        confidence: item.confidence,
        source_message: item.source_message,
      });
    }

    if (saved.length) writeMemoryStore(userId, memory);

    bgLearnIdx.set(userId, nextIdx);
    lastBackgroundLearnAt = new Date().toISOString();
    lastBackgroundLearnSaved = saved.length;

    if (saved.length) {
      console.log(
        `[background-learner:${userId}] saved ${saved.length} entr${saved.length === 1 ? "y" : "ies"}`
      );
    }
  } catch (err) {
    console.error(`[background-learner:${userId}] error:`, err.message);
  }
}

function runBackgroundLearnAll() {
  const users = listUsers();
  if (!users.length) {
    runBackgroundLearnForUser("default");
    return;
  }
  for (const u of users) runBackgroundLearnForUser(u);
}

function startBackgroundLearer() {
  if (backgroundLearnTimer) return;
  backgroundLearnTimer = setInterval(runBackgroundLearnAll, BACKGROUND_LEARN_INTERVAL_MS);
  if (backgroundLearnTimer.unref) backgroundLearnTimer.unref();
}

function stopBackgroundLearer() {
  if (backgroundLearnTimer) {
    clearInterval(backgroundLearnTimer);
    backgroundLearnTimer = null;
  }
}

function backgroundLearnStatus() {
  return {
    running: Boolean(backgroundLearnTimer),
    intervalMs: BACKGROUND_LEARN_INTERVAL_MS,
    lastRunAt: lastBackgroundLearnAt,
    lastSaved: lastBackgroundLearnSaved,
    users: listUsers(),
  };
}

app.get("/api/background-learn", (_req, res) => {
  res.json(backgroundLearnStatus());
});

app.post("/api/background-learn/tick", (_req, res) => {
  try {
    runBackgroundLearnAll();
    res.json({ ok: true, ...backgroundLearnStatus() });
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

app.post("/api/background-learn/start", (_req, res) => {
  startBackgroundLearer();
  res.json({ ok: true, ...backgroundLearnStatus() });
});

app.post("/api/background-learn/stop", (_req, res) => {
  stopBackgroundLearer();
  res.json({ ok: true, ...backgroundLearnStatus() });
});

const REFLECTION_INTERVAL_MS = 60000;
let reflectionTimer = null;
let reflectionRunning = false;

function runReflectionForUser(userId, state, pool) {
  try {
    const chat = readChat(userId);
    const memory = readMemoryStore(userId);
    const generated = [];

    const reflected = reflect({ messages: chat.messages, entries: memory.entries });
    for (const item of reflected) {
      const entry = upsertEntry(memory.entries, {
        fact: item.fact,
        category: item.category,
        confidence: item.confidence,
        source_message: item.source_message,
      });
      if (entry) generated.push(entry);
    }

    let studied = 0;
    if (pool.length) {
      const idx = state.poolIdx % pool.length;
      const factText = String(pool[idx]).trim();
      if (factText && isUsefulManualFact(factText)) {
        const entry = upsertEntry(memory.entries, {
          fact: factText,
          category: "fact",
          confidence: 0.6,
          source_message: "self-study from knowledge pool",
        });
        if (entry) studied = 1;
      }
      state.poolIdx = (idx + 1) % pool.length;
    }

    if (generated.length || studied) writeMemoryStore(userId, memory);

    return { generated: generated.length, studied };
  } catch (err) {
    console.error(`[reflector:${userId}] error:`, err.message);
    return { generated: 0, studied: 0 };
  }
}

function runReflectionPass() {
  if (reflectionRunning) return null;
  reflectionRunning = true;
  try {
    const state = readReflectionState();
    const pool = readKnowledgePool();
    const users = listUsers();
    const targets = users.length ? users : ["default"];

    let totalGenerated = 0;
    let totalStudied = 0;
    for (const u of targets) {
      const r = runReflectionForUser(u, state, pool);
      totalGenerated += r.generated;
      totalStudied += r.studied;
    }

    state.lastRunAt = new Date().toISOString();
    state.lastGenerated = totalGenerated;
    state.lastStudied = totalStudied;
    writeReflectionState(state);

    if (totalGenerated || totalStudied) {
      console.log(
        `[reflector] generated ${totalGenerated}, studied ${totalStudied} across ${targets.length} users`
      );
    }

    return { generated: totalGenerated, studied: totalStudied, users: targets.length };
  } catch (err) {
    console.error("[reflector] error:", err.message);
    return null;
  } finally {
    reflectionRunning = false;
  }
}

function startReflection() {
  if (reflectionTimer) return;
  reflectionTimer = setInterval(runReflectionPass, REFLECTION_INTERVAL_MS);
  if (reflectionTimer.unref) reflectionTimer.unref();
}

function stopReflection() {
  if (reflectionTimer) {
    clearInterval(reflectionTimer);
    reflectionTimer = null;
  }
}

function reflectionStatus() {
  const state = readReflectionState();
  return {
    running: Boolean(reflectionTimer),
    intervalMs: REFLECTION_INTERVAL_MS,
    lastRunAt: state.lastRunAt,
    lastGenerated: state.lastGenerated || 0,
    lastStudied: state.lastStudied || 0,
    poolIdx: state.poolIdx || 0,
    poolSize: readKnowledgePool().length,
    users: listUsers(),
  };
}

app.get("/api/reflection", (_req, res) => {
  res.json(reflectionStatus());
});

app.post("/api/reflection/tick", (_req, res) => {
  const result = runReflectionPass();
  res.json({ ok: true, result, status: reflectionStatus() });
});

app.post("/api/reflection/start", (_req, res) => {
  startReflection();
  res.json({ ok: true, ...reflectionStatus() });
});

app.post("/api/reflection/stop", (_req, res) => {
  stopReflection();
  res.json({ ok: true, ...reflectionStatus() });
});

startBackgroundLearer();
startReflection();

const FACT_GEN_INTERVAL_MS = 1000;
let factGenTimer = null;
let factGenRunning = false;
let factGenCount = 0;
let factGenLastAt = null;
let factGenLastFact = null;
let factGenUserRotator = 0;

function runFactGeneration() {
  if (factGenRunning) return;
  factGenRunning = true;
  try {
    const fact = generateFact();
    if (!fact || !isUsefulManualFact(fact)) {
      factGenRunning = false;
      return;
    }

    const users = listUsers();
    const targets = users.length ? users : ["default"];
    const userId = targets[factGenUserRotator % targets.length];
    factGenUserRotator = (factGenUserRotator + 1) % targets.length;

    const memory = readMemoryStore(userId);
    const entry = upsertEntry(memory.entries, {
      fact,
      category: "fact",
      confidence: 0.55,
      source_message: "auto-generated fact",
    });

    if (entry) {
      writeMemoryStore(userId, memory);
      factGenCount += 1;
      factGenLastAt = new Date().toISOString();
      factGenLastFact = fact;
    }
  } catch (err) {
    console.error("[fact-gen] error:", err.message);
  } finally {
    factGenRunning = false;
  }
}

function startFactGenerator() {
  if (factGenTimer) return;
  factGenTimer = setInterval(runFactGeneration, FACT_GEN_INTERVAL_MS);
  if (factGenTimer.unref) factGenTimer.unref();
}

function stopFactGenerator() {
  if (factGenTimer) {
    clearInterval(factGenTimer);
    factGenTimer = null;
  }
}

function factGenStatus() {
  return {
    running: Boolean(factGenTimer),
    intervalMs: FACT_GEN_INTERVAL_MS,
    count: factGenCount,
    lastAt: factGenLastAt,
    lastFact: factGenLastFact,
    pool: factPoolSize(),
    users: listUsers().length,
  };
}

app.get("/api/fact-gen", (_req, res) => {
  res.json(factGenStatus());
});

app.post("/api/fact-gen/tick", (_req, res) => {
  runFactGeneration();
  res.json({ ok: true, ...factGenStatus() });
});

app.post("/api/fact-gen/start", (_req, res) => {
  startFactGenerator();
  res.json({ ok: true, ...factGenStatus() });
});

app.post("/api/fact-gen/stop", (_req, res) => {
  stopFactGenerator();
  res.json({ ok: true, ...factGenStatus() });
});

// Background fact generator — off in production unless explicitly enabled.
if (process.env.ENABLE_FACT_GEN === "true" || process.env.NODE_ENV !== "production") {
  startFactGenerator();
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`char.ai running on port ${PORT}`);
});
