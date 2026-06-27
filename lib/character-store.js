const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_DIR = path.join(DATA_DIR, "users");
const PRESETS_FILE = path.join(DATA_DIR, "characters.json");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readPresets() {
  if (!fs.existsSync(PRESETS_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(PRESETS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function sanitizeId(id) {
  return String(id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

function userCharsDir(userId) {
  return path.join(USERS_DIR, userId, "characters");
}

function userCharChatsDir(userId) {
  return path.join(USERS_DIR, userId, "character-chats");
}

function userCharFile(userId, charId) {
  return path.join(userCharsDir(userId), `${charId}.json`);
}

function userCharChatFile(userId, charId) {
  return path.join(userCharChatsDir(userId), `${charId}.json`);
}

// New: per-character sessions directory. Each session is its own JSON file.
function sessionsDir(userId, charId) {
  return path.join(userCharChatsDir(userId), charId);
}

function sessionFile(userId, charId, sessionId) {
  return path.join(sessionsDir(userId, charId), `${sessionId}.json`);
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Migrate legacy single-chat file (<charId>.json with {messages:[...]}) into a session.
function migrateLegacyChat(userId, charId, character) {
  const legacyFile = userCharChatFile(userId, charId);
  if (!fs.existsSync(legacyFile)) return null;
  if (!fs.existsSync(sessionsDir(userId, charId))) {
    try {
      const data = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
      const messages = Array.isArray(data.messages) ? data.messages : [];
      if (!messages.length) {
        fs.unlinkSync(legacyFile);
        return null;
      }
      const sessionId = newId("sess");
      const session = {
        id: sessionId,
        characterId: charId,
        title: deriveTitle(messages, character),
        messages,
        createdAt: messages[0]?.timestamp || new Date().toISOString(),
        updatedAt: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
      };
      ensureDir(sessionsDir(userId, charId));
      fs.writeFileSync(sessionFile(userId, charId, sessionId), JSON.stringify(session, null, 2), "utf8");
      fs.unlinkSync(legacyFile);
      console.log(`[migrate] moved legacy chat for ${charId} to session ${sessionId}`);
      return session;
    } catch {
      return null;
    }
  }
  return null;
}

function deriveTitle(messages, character) {
  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser && firstUser.content) {
    const text = firstUser.content.replace(/\s+/g, " ").trim();
    return text.length > 48 ? text.slice(0, 48) + "…" : text;
  }
  if (character && character.name) return `Chat with ${character.name}`;
  return "New chat";
}

function listAllCharacters(userId) {
  const presets = readPresets();
  const userChars = [];
  const dir = userCharsDir(userId);
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        userChars.push(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
      } catch {
        /* skip */
      }
    }
  }
  const presetIds = new Set(presets.map((c) => c.id));
  const customOnly = userChars.filter((c) => !presetIds.has(c.id));
  return [...presets, ...customOnly];
}

function getCharacter(userId, charId) {
  const id = sanitizeId(charId);
  const presets = readPresets();
  const preset = presets.find((c) => c.id === id);
  if (preset) return preset;

  const file = userCharFile(userId, id);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

function saveCharacter(userId, character) {
  const id = sanitizeId(character.id || character.name);
  if (!id) throw new Error("Character id required");
  ensureDir(userCharsDir(userId));
  const toSave = { ...character, id };
  fs.writeFileSync(userCharFile(userId, id), JSON.stringify(toSave, null, 2), "utf8");
  return toSave;
}

function deleteCharacter(userId, charId) {
  const id = sanitizeId(charId);
  const file = userCharFile(userId, id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return id;
}

function readCharChat(userId, charId) {
  const id = sanitizeId(charId);
  const file = userCharChatFile(userId, id);
  if (!fs.existsSync(file)) return { messages: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { messages: Array.isArray(data.messages) ? data.messages : [] };
  } catch {
    return { messages: [] };
  }
}

function writeCharChat(userId, charId, data) {
  const id = sanitizeId(charId);
  ensureDir(userCharChatsDir(userId));
  fs.writeFileSync(userCharChatFile(userId, id), JSON.stringify(data, null, 2), "utf8");
}

function clearCharChat(userId, charId) {
  writeCharChat(userId, charId, { messages: [] });
  return [];
}

// --- sessions (multi-chat per character) ----------------------------------

function listSessions(userId, charId) {
  const id = sanitizeId(charId);
  const dir = sessionsDir(userId, id);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      out.push({
        id: s.id,
        characterId: s.characterId,
        title: s.title || "New chat",
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
      });
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return out;
}

function getSession(userId, charId, sessionId) {
  const id = sanitizeId(charId);
  const file = sessionFile(userId, id, sessionId);
  if (!fs.existsSync(file)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(s.messages)) s.messages = [];
    return s;
  } catch {
    return null;
  }
}

function writeSession(userId, charId, session) {
  const id = sanitizeId(charId);
  ensureDir(sessionsDir(userId, id));
  fs.writeFileSync(sessionFile(userId, id, session.id), JSON.stringify(session, null, 2), "utf8");
}

function createSession(userId, charId, character) {
  const id = sanitizeId(charId);
  const sessionId = newId("sess");
  const now = new Date().toISOString();
  const messages = [];
  if (character && character.greeting) {
    messages.push({
      id: newId("msg"),
      role: "assistant",
      content: character.greeting,
      timestamp: now,
      greeting: true,
    });
  }
  const session = {
    id: sessionId,
    characterId: id,
    title: character ? `New chat with ${character.name}` : "New chat",
    messages,
    createdAt: now,
    updatedAt: now,
  };
  writeSession(userId, id, session);
  return session;
}

function deleteSession(userId, charId, sessionId) {
  const id = sanitizeId(charId);
  const file = sessionFile(userId, id, sessionId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function renameSession(userId, charId, sessionId, title) {
  const s = getSession(userId, charId, sessionId);
  if (!s) return null;
  s.title = String(title || "").slice(0, 80) || s.title;
  s.updatedAt = new Date().toISOString();
  writeSession(userId, charId, s);
  return s;
}

function appendMessageToSession(userId, charId, sessionId, message) {
  const s = getSession(userId, charId, sessionId);
  if (!s) return null;
  const msg = {
    id: message.id || newId("msg"),
    role: message.role,
    content: message.content,
    timestamp: message.timestamp || new Date().toISOString(),
    ...(message.greeting ? { greeting: true } : {}),
  };
  s.messages.push(msg);
  s.updatedAt = msg.timestamp;
  // Auto-title from first user message
  if (msg.role === "user" && (s.title || "").startsWith("New chat")) {
    s.title = deriveTitle([msg], null);
  }
  writeSession(userId, charId, s);
  return { session: s, message: msg };
}

function findMessageIndex(s, messageId) {
  return s.messages.findIndex((m) => m.id === messageId);
}

function editUserMessage(userId, charId, sessionId, messageId, newContent) {
  const s = getSession(userId, charId, sessionId);
  if (!s) return null;
  const idx = findMessageIndex(s, messageId);
  if (idx < 0) return null;
  if (s.messages[idx].role !== "user") return null;
  s.messages[idx].content = String(newContent || "").trim();
  // Truncate everything after the edited message
  s.messages = s.messages.slice(0, idx + 1);
  s.updatedAt = new Date().toISOString();
  writeSession(userId, charId, s);
  return s;
}

function removeLastAssistantMessage(userId, charId, sessionId) {
  const s = getSession(userId, charId, sessionId);
  if (!s) return null;
  for (let i = s.messages.length - 1; i >= 0; i--) {
    if (s.messages[i].role === "assistant" && !s.messages[i].greeting) {
      s.messages.splice(i, 1);
      break;
    }
  }
  s.updatedAt = new Date().toISOString();
  writeSession(userId, charId, s);
  return s;
}

// --- usage tracking & recommendations ------------------------------------

function usageFile(userId) {
  return path.join(USERS_DIR, userId, "character-usage.json");
}

function readUsage(userId) {
  const file = usageFile(userId);
  if (!fs.existsSync(file)) return { counts: {}, updatedAt: null };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { counts: data.counts || {}, updatedAt: data.updatedAt || null };
  } catch {
    return { counts: {}, updatedAt: null };
  }
}

function writeUsage(userId, counts) {
  ensureDir(path.join(USERS_DIR, userId));
  fs.writeFileSync(
    usageFile(userId),
    JSON.stringify({ counts, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function bumpUsage(userId, charId) {
  const id = sanitizeId(charId);
  if (!id) return;
  const { counts } = readUsage(userId);
  counts[id] = (counts[id] || 0) + 1;
  writeUsage(userId, counts);
}

// Compute tag affinity: sum of usage counts grouped by each character's tags.
function computeTagAffinity(userId, characters) {
  const { counts } = readUsage(userId);
  const affinity = {};
  for (const c of characters) {
    const uses = counts[c.id] || 0;
    if (!uses) continue;
    for (const tag of c.tags || []) {
      affinity[tag] = (affinity[tag] || 0) + uses;
    }
  }
  return affinity;
}

function scoreCharacter(character, affinity, usedIds) {
  let score = 0;
  for (const tag of character.tags || []) {
    score += affinity[tag] || 0;
  }
  // Mild boost for characters the user has used before (familiarity)
  if (usedIds.has(character.id)) score += 1;
  return score;
}

function getRecommendations(userId, options = {}) {
  const limit = options.limit || 6;
  const all = listAllCharacters(userId);
  const { counts } = readUsage(userId);
  const affinity = computeTagAffinity(userId, all);
  const usedIds = new Set(Object.keys(counts));

  // Recommendations: characters ranked by tag affinity score, excluding already-used.
  const recommended = all
    .slice()
    .map((c) => ({ c, score: scoreCharacter(c, affinity, usedIds) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.c);

  // Most used: characters the user has actually used, sorted by count desc.
  const mostUsed = all
    .filter((c) => counts[c.id])
    .sort((a, b) => counts[b.id] - counts[a.id])
    .map((c) => ({ ...c, usageCount: counts[c.id] }));

  return {
    recommended,
    mostUsed,
    affinity,
    counts,
  };
}

module.exports = {
  listAllCharacters,
  getCharacter,
  saveCharacter,
  deleteCharacter,
  readCharChat,
  writeCharChat,
  clearCharChat,
  sanitizeId,
  bumpUsage,
  readUsage,
  getRecommendations,
  computeTagAffinity,
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
};
