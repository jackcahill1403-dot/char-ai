const fs = require("fs");
const path = require("path");
const { DEFAULT_MODEL, getModel } = require("./models");

const DATA_DIR = path.join(__dirname, "..", "data", "users");

function sanitizeId(id) {
  return String(id || "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || "default";
}

function userFile(id) {
  return path.join(DATA_DIR, `${sanitizeId(id)}.json`);
}

// Per-user folder that holds one sub-folder per model with saved plans as .md
function savedRoot(id) {
  return path.join(DATA_DIR, sanitizeId(id), "saved");
}

let convSeq = 0;
function freshConversation(model = DEFAULT_MODEL) {
  convSeq += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return {
    id: `c-${Date.now().toString(36)}-${convSeq}${rand}`,
    title: "New plan",
    model,
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

function defaultData() {
  const conv = freshConversation(DEFAULT_MODEL);
  return {
    settings: { displayName: "there", model: DEFAULT_MODEL, customPrompt: "", theme: "light", plugins: [] },
    conversations: [conv],
    activeId: conv.id,
  };
}

function read(userId) {
  const file = userFile(userId);
  if (!fs.existsSync(file)) return defaultData();
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data.conversations?.length) {
      const conv = freshConversation(data.settings?.model || DEFAULT_MODEL);
      data.conversations = [conv];
      data.activeId = conv.id;
    }
    // Back-fill model tag on older conversations
    for (const c of data.conversations) {
      if (!c.model) c.model = data.settings?.model || DEFAULT_MODEL;
    }
    data.settings = { ...defaultData().settings, ...(data.settings || {}) };
    return data;
  } catch {
    return defaultData();
  }
}

function safeName(s) {
  return String(s || "plan").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 50) || "plan";
}

function convToMarkdown(conv) {
  const lines = [`# ${conv.title || "New plan"}`, "", `_Model: ${getModel(conv.model).label} · ${conv.createdAt || ""}_`, ""];
  for (const m of conv.messages || []) {
    lines.push(`## ${m.role === "user" ? "You" : "Nexa"}`, "", m.content, "");
  }
  return lines.join("\n");
}

// Mirror every conversation to data/users/<id>/saved/<Model Label>/<title>.md
function mirrorToDisk(userId, data) {
  const root = savedRoot(userId);
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  for (const conv of data.conversations) {
    if (!conv.messages?.length) continue;
    const modelDir = path.join(root, safeName(getModel(conv.model).label));
    fs.mkdirSync(modelDir, { recursive: true });
    const fname = `${safeName(conv.title)}-${conv.id}.md`;
    fs.writeFileSync(path.join(modelDir, fname), convToMarkdown(conv), "utf8");
  }
}

function write(userId, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(userFile(userId), JSON.stringify(data, null, 2), "utf8");
  try {
    mirrorToDisk(userId, data);
  } catch {
    /* mirror is best-effort */
  }
}

function activeConversation(data) {
  return data.conversations.find((c) => c.id === data.activeId) || data.conversations[0];
}

module.exports = { read, write, activeConversation, freshConversation, sanitizeId };
