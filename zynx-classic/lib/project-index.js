const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MAX_FILES = 35;
const SNIPPET_LINES = 40;
const MAX_SNIPPET_CHARS = 2000;

const ROOT_FILES = ["PROJECT.md", "README.md", "package.json", "server.js", ".env.example"];

let cache = { builtAt: 0, entries: [] };
const CACHE_MS = 60_000;

function listIndexableFiles() {
  const files = new Set(ROOT_FILES);
  for (const dir of ["lib", "public/js"]) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (/\.(js|md|json|html|css)$/.test(name)) files.add(path.join(dir, name).replace(/\\/g, "/"));
    }
  }
  return [...files].slice(0, MAX_FILES);
}

function snippetForFile(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  const raw = fs.readFileSync(full, "utf8");
  const lines = raw.split(/\r?\n/).slice(0, SNIPPET_LINES);
  let text = lines.join("\n");
  if (text.length > MAX_SNIPPET_CHARS) text = `${text.slice(0, MAX_SNIPPET_CHARS)}\n…`;
  return { path: rel, text, mtime: fs.statSync(full).mtimeMs };
}

function buildIndex() {
  const now = Date.now();
  if (cache.entries.length && now - cache.builtAt < CACHE_MS) return cache.entries;

  const entries = [];
  for (const rel of listIndexableFiles()) {
    try {
      const snip = snippetForFile(rel);
      if (snip) entries.push(snip);
    } catch {
      /* skip */
    }
  }
  cache = { builtAt: now, entries };
  return entries;
}

function keywords(text) {
  const STOP = new Set(
    "the a an and or but if then else when while of to in on for with without about is are was were be been being i you he she it we we they me my your our their this that these those do does did doing have has had having just really very so too what who where why how which can could should would will".split(
      " "
    )
  );
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function scoreEntry(query, entry) {
  const q = keywords(query);
  if (!q.length) return 0;
  const hay = `${entry.path} ${entry.text}`.toLowerCase();
  let score = 0;
  for (const w of q) {
    if (entry.path.toLowerCase().includes(w)) score += 3;
    if (hay.includes(w)) score += 1;
  }
  return score;
}

function findRelevantFiles(query, limit = 3) {
  const entries = buildIndex();
  return entries
    .map((e) => ({ entry: e, score: scoreEntry(query, e) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}

function projectIndexBlock(query) {
  const hits = findRelevantFiles(query);
  if (!hits.length) return "";
  const parts = hits.map((h) => `### ${h.path}\n\`\`\`\n${h.text}\n\`\`\``);
  return `\n\n--- Relevant project files ---\n${parts.join("\n\n")}\n--- end files ---`;
}

module.exports = { buildIndex, findRelevantFiles, projectIndexBlock };
