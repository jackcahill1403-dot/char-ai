function getZynxUserId() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("user") || params.get("u");
  if (fromUrl) {
    const id = fromUrl
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40);
    if (id) {
      localStorage.setItem("zynxUserId", id);
      return id;
    }
  }
  let id = localStorage.getItem("zynxUserId");
  if (!id) {
    id = `guest-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("zynxUserId", id);
  }
  return id;
}

function setZynxUserId(name) {
  const id = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
  if (!id) return getZynxUserId();
  localStorage.setItem("zynxUserId", id);
  return id;
}

function shareLinkForUser(userId) {
  const url = new URL(window.location.href);
  url.searchParams.set("user", userId);
  url.pathname = "/";
  url.hash = "";
  return url.toString();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": getZynxUserId(),
      ...(options.headers || {}),
    },
    ...options,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.add("is-visible");
}

function hideError(el) {
  if (!el) el = document.getElementById("error");
  if (el) el.classList.remove("is-visible");
}

function showSuccess(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.add("is-visible");
  setTimeout(() => {
    el.classList.remove("is-visible");
  }, 2500);
}

function getMemory() {
  return api("/api/memory");
}

function sendChat(content) {
  return api("/api/chat", { method: "POST", body: JSON.stringify({ content }) });
}

function createConversationApi(title) {
  return api("/api/conversations", { method: "POST", body: JSON.stringify({ title }) });
}

function activateConversation(id) {
  return api(`/api/conversations/${encodeURIComponent(id)}/activate`, { method: "POST" });
}

function deleteConversationApi(id) {
  return api(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

function getConversations() {
  return api("/api/conversations");
}

async function sendChatStream(payload, onEvent, { signal } = {}) {
  const body = typeof payload === "string" ? { content: payload } : payload;
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": getZynxUserId(),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(data.error || `Stream failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const payloadJson = JSON.parse(line.slice(5).trim());
      if (onEvent) onEvent(payloadJson);
      if (payloadJson.done) finalResult = payloadJson;
      if (payloadJson.error) throw new Error(payloadJson.error);
    }
  }
  return finalResult;
}

function renameConversationApi(id, title) {
  return api(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

function clearMessages() {
  return api("/api/messages", { method: "DELETE" });
}

function getModels() {
  return api("/api/models");
}

function getUsage() {
  return api("/api/usage");
}

function getCommands() {
  return api("/api/commands");
}

function getAgents() {
  return api("/api/agents");
}

function applyAgentPreset(id) {
  return api("/api/agents/preset", { method: "POST", body: JSON.stringify({ id }) });
}

function updateAgents(body) {
  return api("/api/agents", { method: "PUT", body: JSON.stringify(body) });
}

function getPlugins() {
  return api("/api/plugins");
}

function installPlugin(id) {
  return api("/api/plugins/install", { method: "POST", body: JSON.stringify({ id }) });
}

function uninstallPlugin(id) {
  return api("/api/plugins/uninstall", { method: "POST", body: JSON.stringify({ id }) });
}

function togglePlugin(id, enabled) {
  return api("/api/plugins/toggle", { method: "POST", body: JSON.stringify({ id, enabled }) });
}

function getScripts() {
  return api("/api/scripts");
}

function saveScript(name, content, meta = {}) {
  return api("/api/scripts", { method: "POST", body: JSON.stringify({ name, content, ...meta }) });
}

function patchScript(slug, patch) {
  return api(`/api/scripts/${encodeURIComponent(slug)}`, { method: "PATCH", body: JSON.stringify(patch) });
}

function publishScriptApi(slug) {
  return api("/api/scripts/publish", { method: "POST", body: JSON.stringify({ slug }) });
}

function runScriptApi(slug) {
  return api("/api/scripts/run", { method: "POST", body: JSON.stringify({ slug }) });
}

function deleteScriptApi(slug) {
  return api(`/api/scripts/${encodeURIComponent(slug)}`, { method: "DELETE" });
}

function updateSettings(body) {
  return api("/api/settings", { method: "PUT", body: JSON.stringify(body) });
}

function submitFeedback(body) {
  return api("/api/feedback", { method: "POST", body: JSON.stringify(body) });
}

function getStatus() {
  return api("/api/status");
}

function exportMarkdown() {
  fetch("/api/export/markdown", {
    headers: { "X-User-Id": getZynxUserId() },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Export failed");
      return res.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "atlas-chat.md";
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch((err) => alert(err.message));
}
