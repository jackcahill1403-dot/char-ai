const fs = require("fs");
const path = require("path");
const { conversationModel } = require("./conversations");
const { getProvider } = require("./models");
const { userDir } = require("./users");

function safeName(s) {
  return String(s || "chat").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 50) || "chat";
}

function modelLabel(id) {
  if (!id || id === "unassigned") return "Unassigned";
  try {
    const p = getProvider(id);
    return p?.label || id;
  } catch {
    return id;
  }
}

function convToMarkdown(conv, label) {
  const lines = [`# ${conv.title || "New chat"}`, "", `_Model: ${label} · ${conv.updatedAt || conv.createdAt || ""}_`, ""];
  for (const m of conv.messages || []) {
    const who = m.role === "user" ? "You" : m.role === "assistant" ? "Atlas" : m.role;
    lines.push(`## ${who}`, "", String(m.content || ""), "");
  }
  return lines.join("\n");
}

// Mirror conversations into data/users/<id>/saved/<Model>/<title>.md, one folder per model.
function mirrorConversations(userId, mem) {
  const root = path.join(userDir(userId), "saved");
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  for (const conv of mem.conversations || []) {
    if (!(conv.messages || []).length) continue;
    const label = modelLabel(conversationModel(conv));
    const dir = path.join(root, safeName(label));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${safeName(conv.title)}-${conv.id}.md`), convToMarkdown(conv, label), "utf8");
  }
}

module.exports = { mirrorConversations };
