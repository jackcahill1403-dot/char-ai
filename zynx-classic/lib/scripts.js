const fs = require("fs");
const path = require("path");

const GLOBAL_FILE = path.join(__dirname, "..", "data", "scripts-global.json");
const DATA_DIR = path.join(__dirname, "..", "data");

function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readGlobalScripts() {
  ensureDataDir();
  if (!fs.existsSync(GLOBAL_FILE)) {
    const seed = { scripts: defaultGlobalScripts() };
    fs.writeFileSync(GLOBAL_FILE, JSON.stringify(seed, null, 2), "utf8");
    return seed.scripts;
  }
  try {
    const data = JSON.parse(fs.readFileSync(GLOBAL_FILE, "utf8"));
    return Array.isArray(data.scripts) ? data.scripts : [];
  } catch {
    return [];
  }
}

function writeGlobalScripts(scripts) {
  ensureDataDir();
  fs.writeFileSync(GLOBAL_FILE, JSON.stringify({ scripts }, null, 2), "utf8");
}

function defaultGlobalScripts() {
  return [
    {
      id: "global-hello-py",
      slug: "hello-python",
      name: "Hello Python",
      description: "Tiny Python hello script — free to run, no AI cost.",
      author: "mini-zynx",
      content: "```python\n#!/usr/bin/env python3\nprint('hello from mini-zynx script vault')\n```",
      createdAt: new Date().toISOString(),
    },
    {
      id: "global-backup-reminder",
      slug: "backup-checklist",
      name: "Backup checklist",
      description: "Caveman backup steps before deploy.",
      author: "mini-zynx",
      content:
        "1) export .env keys safe\n2) git commit\n3) test !run hello-python\n4) deploy\n5) smoke test /api/health",
      createdAt: new Date().toISOString(),
    },
  ];
}

function normalizeLocalScripts(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s, i) => ({
      id: String(s.id || `local-${i}`).slice(0, 48),
      slug: slugify(s.slug || s.name || `script-${i}`),
      name: String(s.name || "Untitled").slice(0, 60),
      content: String(s.content || "").slice(0, 50000),
      publishedGlobal: Boolean(s.publishedGlobal),
      folder: String(s.folder || "default").slice(0, 40),
      tags: Array.isArray(s.tags) ? s.tags.map((t) => String(t).slice(0, 24)).slice(0, 8) : [],
      createdAt: s.createdAt || new Date().toISOString(),
    }))
    .slice(0, 100);
}

function findScript(slug, localScripts) {
  const key = slugify(slug);
  if (!key) return null;
  const local = normalizeLocalScripts(localScripts).find((s) => s.slug === key);
  if (local) return { ...local, source: "local" };
  const global = readGlobalScripts().find((s) => s.slug === key);
  if (global) return { ...global, source: "global" };
  return null;
}

function listScripts(localScripts) {
  const local = normalizeLocalScripts(localScripts).map((s) => ({
    ...s,
    source: "local",
  }));
  const global = readGlobalScripts().map((s) => ({ ...s, source: "global" }));
  return { local, global, all: [...global, ...local] };
}

function saveLocalScript(localScripts, name, content, meta = {}) {
  const slug = slugify(name);
  if (!slug) throw new Error("Script name required.");
  if (!content.trim()) throw new Error("Nothing to save — run dev team first or paste content on Scripts page.");
  const existing = normalizeLocalScripts(localScripts).find((s) => s.slug === slug);
  const list = normalizeLocalScripts(localScripts).filter((s) => s.slug !== slug);
  const row = {
    id: existing?.id || `local-${Date.now()}`,
    slug,
    name: name.trim().slice(0, 60),
    content: content.trim(),
    publishedGlobal: existing?.publishedGlobal || false,
    folder: meta.folder || existing?.folder || "default",
    tags: meta.tags || existing?.tags || [],
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  list.unshift(row);
  return list.slice(0, 100);
}

function updateScriptMeta(localScripts, slugOrName, patch = {}) {
  const key = slugify(slugOrName);
  return normalizeLocalScripts(localScripts).map((s) => {
    if (s.slug !== key) return s;
    return {
      ...s,
      folder: patch.folder !== undefined ? String(patch.folder).slice(0, 40) : s.folder,
      tags: patch.tags !== undefined ? patch.tags.map((t) => String(t).slice(0, 24)).slice(0, 8) : s.tags,
      name: patch.name !== undefined ? String(patch.name).slice(0, 60) : s.name,
    };
  });
}

function listFriendFeed(limit = 20) {
  return readGlobalScripts()
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      author: s.author,
      description: s.description,
      createdAt: s.createdAt,
    }));
}

function publishScript(localScripts, slugOrName, author = "user") {
  const found = findScript(slugOrName, localScripts);
  if (!found || found.source !== "local") {
    throw new Error("Local script not found. Save first with !save name");
  }
  const global = readGlobalScripts();
  if (global.some((s) => s.slug === found.slug)) {
    throw new Error("Already published globally.");
  }
  global.unshift({
    id: `global-${Date.now()}`,
    slug: found.slug,
    name: found.name,
    content: found.content,
    description: `Published by ${author}`,
    author,
    createdAt: new Date().toISOString(),
  });
  writeGlobalScripts(global.slice(0, 200));
  const updated = normalizeLocalScripts(localScripts).map((s) =>
    s.slug === found.slug ? { ...s, publishedGlobal: true } : s
  );
  return updated;
}

function deleteLocalScript(localScripts, slugOrName) {
  const key = slugify(slugOrName);
  return normalizeLocalScripts(localScripts).filter((s) => s.slug !== key);
}

function formatScriptList(localScripts) {
  const { global, local } = listScripts(localScripts);
  const lines = ["Scripts (run = FREE, no message limit):", ""];
  if (global.length) {
    lines.push("Global:");
    for (const s of global) lines.push(`- !run ${s.slug} — ${s.name}`);
  }
  if (local.length) {
    lines.push("", "Yours:");
    for (const s of local) lines.push(`- !run ${s.slug} — ${s.name}${s.publishedGlobal ? " (published)" : ""}`);
  }
  if (!global.length && !local.length) {
    lines.push("(none — !save name after dev team, or add on /scripts.html)");
  }
  lines.push("", "Commands: !save name | !run name | !publish name");
  return lines.join("\n");
}

function lastAssistantContent(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return messages[i].content;
  }
  return "";
}

module.exports = {
  slugify,
  normalizeLocalScripts,
  listScripts,
  findScript,
  saveLocalScript,
  updateScriptMeta,
  publishScript,
  deleteLocalScript,
  formatScriptList,
  lastAssistantContent,
  readGlobalScripts,
  listFriendFeed,
};
