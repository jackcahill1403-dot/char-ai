const crypto = require("crypto");

function newConversationId() {
  return `c-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function titleFromMessages(messages) {
  const first = (messages || []).find((m) => m.role === "user");
  if (!first?.content) return "New chat";
  const t = String(first.content).trim().replace(/\s+/g, " ").slice(0, 48);
  return t || "New chat";
}

function migrateToConversations(data) {
  if (Array.isArray(data.conversations) && data.conversations.length) {
    if (!data.activeConversationId) {
      data.activeConversationId = data.conversations[0].id;
    }
    return data;
  }

  const legacy = Array.isArray(data.messages) ? data.messages : [];
  const id = newConversationId();
  const now = new Date().toISOString();
  data.conversations = [
    {
      id,
      title: titleFromMessages(legacy),
      createdAt: legacy[0]?.timestamp || now,
      updatedAt: legacy[legacy.length - 1]?.timestamp || now,
      messages: legacy,
    },
  ];
  data.activeConversationId = id;
  delete data.messages;
  return data;
}

function getConversation(mem, id) {
  return (mem.conversations || []).find((c) => c.id === id) || null;
}

function getActiveConversation(mem) {
  const convs = mem.conversations || [];
  if (!convs.length) return null;
  const active = getConversation(mem, mem.activeConversationId);
  return active || convs[0];
}

function activeMessages(mem) {
  return getActiveConversation(mem)?.messages || [];
}

function setActiveMessages(mem, messages) {
  const conv = getActiveConversation(mem);
  if (!conv) return;
  conv.messages = messages;
  conv.updatedAt = new Date().toISOString();
  if (conv.title === "New chat" || !conv.title) {
    conv.title = titleFromMessages(messages);
  }
}

function listConversations(mem) {
  return (mem.conversations || [])
    .map((c) => ({
      id: c.id,
      title: c.title || "New chat",
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
      messageCount: (c.messages || []).length,
      preview: (c.messages || []).find((m) => m.role === "user")?.content?.slice(0, 80) || "",
    }))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function createConversation(mem, title = "New chat") {
  const now = new Date().toISOString();
  const conv = {
    id: newConversationId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  if (!mem.conversations) mem.conversations = [];
  mem.conversations.unshift(conv);
  mem.activeConversationId = conv.id;
  return conv;
}

function switchConversation(mem, id) {
  const conv = getConversation(mem, id);
  if (!conv) return null;
  mem.activeConversationId = id;
  return conv;
}

function renameConversation(mem, id, title) {
  const conv = getConversation(mem, id);
  if (!conv) return null;
  conv.title = String(title || "New chat").trim().slice(0, 60) || "New chat";
  conv.updatedAt = new Date().toISOString();
  return conv;
}

function deleteConversation(mem, id) {
  const convs = mem.conversations || [];
  const idx = convs.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  convs.splice(idx, 1);
  if (!convs.length) {
    createConversation(mem);
  } else if (mem.activeConversationId === id) {
    mem.activeConversationId = convs[0].id;
  }
  return mem;
}

function memoryWithLegacyMessages(mem) {
  return {
    ...mem,
    messages: activeMessages(mem),
    conversations: listConversations(mem),
    activeConversationId: mem.activeConversationId,
  };
}

module.exports = {
  newConversationId,
  migrateToConversations,
  getActiveConversation,
  activeMessages,
  setActiveMessages,
  listConversations,
  createConversation,
  switchConversation,
  renameConversation,
  deleteConversation,
  memoryWithLegacyMessages,
  titleFromMessages,
};
