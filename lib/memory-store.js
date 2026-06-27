const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_DIR = path.join(DATA_DIR, "users");
const MAX_ENTRIES = 1000;

const DEFAULT_MEMORY = { entries: [] };

function sanitizeUserId(userId) {
  const cleaned = String(userId || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return cleaned.slice(0, 40) || "default";
}

function userDir(userId) {
  return path.join(USERS_DIR, sanitizeUserId(userId));
}

function memoryFile(userId) {
  return path.join(userDir(userId), "memory.json");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readMemoryStore(userId = "default") {
  const dir = userDir(userId);
  const file = memoryFile(userId);
  ensureDir(dir);
  if (!fs.existsSync(file)) {
    writeMemoryStore(userId, DEFAULT_MEMORY);
    return { entries: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { entries: Array.isArray(data.entries) ? data.entries : [] };
  } catch {
    throw new Error("Could not read memory.json. It may be corrupted.");
  }
}

function writeMemoryStore(userId = "default", data) {
  ensureDir(userDir(userId));
  fs.writeFileSync(memoryFile(userId), JSON.stringify(data, null, 2), "utf8");
}

function normalizeFact(fact) {
  return fact.trim().replace(/\s+/g, " ").slice(0, 120);
}

function findSimilar(entries, fact, category) {
  const lower = fact.toLowerCase();
  return entries.find(
    (e) => e.category === category && e.fact.toLowerCase() === lower
  );
}

function upsertEntry(entries, { fact, category, confidence, source_message }) {
  const cleaned = normalizeFact(fact);
  if (!cleaned) return null;

  const existing = findSimilar(entries, cleaned, category);

  if (existing) {
    existing.confidence = Math.min(1, Math.max(existing.confidence, confidence));
    existing.date_saved = new Date().toISOString();
    if (confidence >= existing.confidence) {
      existing.source_message = source_message.slice(0, 200);
    }
    return existing;
  }

  if (category === "name") {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].category === "name") entries.splice(i, 1);
    }
  }

  if (entries.length >= MAX_ENTRIES) {
    entries.sort((a, b) => a.confidence - b.confidence);
    entries.shift();
  }

  const entry = {
    fact: cleaned,
    category,
    date_saved: new Date().toISOString(),
    confidence: Math.round(confidence * 100) / 100,
    source_message: source_message.slice(0, 200),
  };
  entries.push(entry);
  return entry;
}

function clearEntries(userId = "default") {
  writeMemoryStore(userId, DEFAULT_MEMORY);
  return [];
}

function listUsers() {
  if (!fs.existsSync(USERS_DIR)) return [];
  return fs
    .readdirSync(USERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function migrateLegacyLearned(userId, legacyItems) {
  if (!legacyItems?.length) return;
  const store = readMemoryStore(userId);
  if (store.entries.length) return;

  const typeToCategory = {
    name: "name",
    like: "preference",
    dislike: "preference",
    job: "fact",
    location: "fact",
    fact: "fact",
  };

  for (const item of legacyItems) {
    upsertEntry(store.entries, {
      fact: item.value,
      category: typeToCategory[item.type] || "fact",
      confidence: 0.8,
      source_message: item.value,
    });
  }
  writeMemoryStore(userId, store);
}

module.exports = {
  readMemoryStore,
  writeMemoryStore,
  upsertEntry,
  clearEntries,
  migrateLegacyLearned,
  findSimilar,
  listUsers,
  sanitizeUserId,
  userDir,
};
