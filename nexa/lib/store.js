const fs = require("fs");
const path = require("path");
const { DEFAULT_MODEL } = require("./models");

const DATA_DIR = path.join(__dirname, "..", "data", "users");

function sanitizeId(id) {
  return String(id || "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || "default";
}

function userFile(id) {
  return path.join(DATA_DIR, `${sanitizeId(id)}.json`);
}

let convSeq = 0;
function freshConversation() {
  convSeq += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return {
    id: `c-${Date.now().toString(36)}-${convSeq}${rand}`,
    title: "New plan",
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

function defaultData() {
  const conv = freshConversation();
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
      const conv = freshConversation();
      data.conversations = [conv];
      data.activeId = conv.id;
    }
    data.settings = { ...defaultData().settings, ...(data.settings || {}) };
    return data;
  } catch {
    return defaultData();
  }
}

function write(userId, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(userFile(userId), JSON.stringify(data, null, 2), "utf8");
}

function activeConversation(data) {
  return data.conversations.find((c) => c.id === data.activeId) || data.conversations[0];
}

module.exports = { read, write, activeConversation, freshConversation, sanitizeId };
