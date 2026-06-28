const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { cacheEligible } = require("./ai-quality");

const FILE = path.join(__dirname, "..", "data", "response-cache.json");
const MAX_ENTRIES = 80;
const FUZZY_MIN_SCORE = 0.82;

function ensureFile() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify({ entries: [] }, null, 2), "utf8");
  }
}

function readStore() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

function writeStore(entries) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify({ entries: entries.slice(0, MAX_ENTRIES) }, null, 2), "utf8");
}

function normalize(text) {
  return String(text).trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheKey(text) {
  return crypto.createHash("sha256").update(normalize(text)).digest("hex").slice(0, 24);
}

function tokenSet(text) {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

function jaccard(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function getCached(text) {
  if (!cacheEligible(text)) return null;

  const norm = normalize(text);
  const key = cacheKey(text);
  const entries = readStore();

  let hit = entries.find((e) => e.key === key);
  if (!hit) {
    let best = null;
    let bestScore = 0;
    for (const e of entries) {
      const score = jaccard(norm, e.previewNorm || normalize(e.preview || ""));
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best && bestScore >= FUZZY_MIN_SCORE) hit = best;
  }

  if (!hit) return null;
  const rest = entries.filter((e) => e.key !== hit.key);
  rest.unshift({ ...hit, lastUsed: new Date().toISOString() });
  writeStore(rest);
  return hit.content;
}

function setCached(text, content) {
  if (!cacheEligible(text)) return;

  const key = cacheKey(text);
  const preview = String(text).trim().slice(0, 80);
  const entries = readStore().filter((e) => e.key !== key);
  entries.unshift({
    key,
    preview,
    previewNorm: normalize(text),
    content: String(content).slice(0, 50000),
    savedAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
  });
  writeStore(entries);
}

module.exports = { getCached, setCached, cacheKey };
