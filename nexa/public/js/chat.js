const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");
const errorEl = document.getElementById("error");
const statusLine = document.getElementById("status-line");
const greetingEl = document.getElementById("greeting");
const convListEl = document.getElementById("conversation-list");
const newChatBtn = document.getElementById("new-chat-btn");
const modelSelect = document.getElementById("chat-model");
const convSearch = document.getElementById("conv-search");

let activeId = null;
let activeAbort = null;
let modelProgrammatic = false;
let modelLabels = {};
let modelOrder = [];

function esc(t) {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 180) + "px";
}

function renderMessages(messages, animate = false) {
  messagesEl.innerHTML = "";
  if (!messages?.length) {
    messagesEl.innerHTML = `<li class="empty-state"><div class="empty-state-inner">
      <span class="empty-mark" aria-hidden="true"></span>
      <p class="empty-title">What needs organising?</p>
      <p class="empty-hint">Drop a goal, messy notes, or a task — Nexa turns it into a plan.</p>
    </div></li>`;
    return;
  }
  messages.forEach((msg, i) => {
    const li = document.createElement("li");
    li.className = `message ${msg.role}`;
    if (animate && i >= messages.length - 2) li.classList.add("message-enter");
    const label = msg.role === "user" ? "You" : "Nexa";
    const think = msg.thinking
      ? `<details class="think-block"><summary class="think-summary">Reasoning</summary><div class="think-body">${formatMarkdownBlock(msg.thinking)}</div></details>`
      : "";
    li.innerHTML = `
      <div class="message-head"><span class="meta">${label}</span>
        <div class="message-actions"><button type="button" class="copy-msg-btn btn-icon" title="Copy">⧉</button></div>
      </div>
      <div class="message-body">${think}${formatMessageContent(msg.content)}</div>`;
    li.querySelector(".copy-msg-btn")?.addEventListener("click", (e) => copyText(msg.content, e.target));
    messagesEl.appendChild(li);
  });
  if (typeof bindCopyHandlers === "function") bindCopyHandlers(messagesEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderConversations(conversations, currentId) {
  activeId = currentId;
  if (!conversations?.length) {
    convListEl.innerHTML = '<li class="hint">No plans yet</li>';
    return;
  }

  // Group plans into a folder per model
  const byModel = {};
  for (const c of conversations) {
    const key = c.model || "other";
    (byModel[key] ||= []).push(c);
  }
  const order = modelOrder.length ? modelOrder : Object.keys(byModel);
  const keys = [...new Set([...order, ...Object.keys(byModel)])].filter((k) => byModel[k]?.length);

  convListEl.innerHTML = keys.map((key) => {
    const items = byModel[key];
    const hasActive = items.some((c) => c.id === currentId);
    const label = modelLabels[key] || key;
    const rows = items.map((c) => {
      const active = c.id === currentId ? " is-active" : "";
      return `<li class="conversation-item${active}">
        <button type="button" class="conversation-btn" data-id="${c.id}">${esc(c.title || "New plan")}</button>
        <button type="button" class="conversation-del btn-icon" data-id="${c.id}" title="Delete">×</button>
      </li>`;
    }).join("");
    return `<li class="model-folder">
      <details class="model-folder-details"${hasActive ? " open" : ""}>
        <summary class="model-folder-head">
          <span class="model-folder-name">${esc(label)}</span>
          <span class="model-folder-count">${items.length}</span>
        </summary>
        <ul class="model-folder-list">${rows}</ul>
      </details>
    </li>`;
  }).join("");

  convListEl.querySelectorAll(".conversation-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.id === activeId) return;
      try {
        const data = await api(`/api/conversations/${btn.dataset.id}/activate`, { method: "POST" });
        activeId = data.activeId;
        renderMessages(data.messages || []);
        await refreshConversations();
      } catch (err) { showError(errorEl, err.message); }
    });
  });
  convListEl.querySelectorAll(".conversation-del").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this plan?")) return;
      try {
        const data = await api(`/api/conversations/${btn.dataset.id}`, { method: "DELETE" });
        renderConversations(data.conversations, data.activeId);
        renderMessages(data.messages || []);
      } catch (err) { showError(errorEl, err.message); }
    });
  });
}

async function refreshConversations() {
  const state = await api("/api/state");
  renderConversations(state.conversations, state.activeId);
}

function populateModels(models, active) {
  modelLabels = Object.fromEntries(models.map((m) => [m.id, m.label]));
  modelOrder = models.map((m) => m.id);
  modelProgrammatic = true;
  modelSelect.innerHTML = models.map((m) =>
    `<option value="${m.id}"${m.id === active ? " selected" : ""}${m.configured ? "" : " disabled"}>${esc(m.label)}${m.configured ? "" : " (no key)"}</option>`
  ).join("");
  modelProgrammatic = false;
  const cur = models.find((m) => m.id === active);
  modelSelect.title = cur?.role || "Pick a model";
}

function setGenerating(on) {
  sendBtn.disabled = on;
  sendBtn.hidden = on;
  stopBtn.hidden = !on;
  modelSelect.disabled = on;
}

function appendStreaming() {
  const li = document.createElement("li");
  li.className = "message assistant streaming message-enter";
  li.id = "streaming-msg";
  li.innerHTML = `<div class="message-head"><span class="meta">Nexa</span><span class="msg-badge">working…</span></div><div class="message-body"><div class="msg-text md-body"></div></div>`;
  messagesEl.appendChild(li);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return li.querySelector(".msg-text");
}

async function loadState() {
  try {
    hideError(errorEl);
    const [state, models] = await Promise.all([api("/api/state"), api("/api/models")]);
    initTheme(state.settings.theme);
    populateModels(models.models, models.active);
    renderConversations(state.conversations, state.activeId);
    renderMessages(state.messages);
    greetingEl.textContent = `Hi ${state.settings.displayName || "there"} — let's get organised`;
    const m = models.models.find((x) => x.id === models.active);
    statusLine.textContent = m ? `${m.label} · ${m.hint}` : "";
  } catch (err) {
    showError(errorEl, err.message);
  }
}

async function runChat() {
  const content = input.value.trim();
  if (!content) return;
  hideError(errorEl);
  setGenerating(true);
  activeAbort = new AbortController();
  const streamBody = appendStreaming();
  let streamed = "";

  try {
    const result = await streamChat({ content }, (ev) => {
      if (ev.type === "delta") {
        streamed += ev.delta || "";
        streamBody.textContent = streamed.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "⋯ thinking ⋯");
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }, { signal: activeAbort.signal });

    document.getElementById("streaming-msg")?.remove();
    if (result?.messages) renderMessages(result.messages, true);
    if (result?.conversations) renderConversations(result.conversations, result.activeId);
    input.value = "";
    autoGrow(input);
  } catch (err) {
    document.getElementById("streaming-msg")?.remove();
    if (err.name === "AbortError") statusLine.textContent = "Stopped.";
    else showError(errorEl, err.message);
  } finally {
    activeAbort = null;
    setGenerating(false);
    input.focus();
  }
}

form.addEventListener("submit", (e) => { e.preventDefault(); runChat(); });
stopBtn.addEventListener("click", () => activeAbort?.abort());
input.addEventListener("input", () => autoGrow(input));
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});

newChatBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/conversations", { method: "POST" });
    renderConversations(data.conversations, data.activeId);
    renderMessages([]);
    input.focus();
  } catch (err) { showError(errorEl, err.message); }
});

modelSelect.addEventListener("change", async () => {
  if (modelProgrammatic) return;
  try {
    await api("/api/settings", { method: "POST", body: JSON.stringify({ model: modelSelect.value }) });
    await loadState();
  } catch (err) { showError(errorEl, err.message); }
});

convSearch?.addEventListener("input", () => {
  const q = convSearch.value.toLowerCase().trim();
  convListEl.querySelectorAll(".conversation-item").forEach((li) => {
    const t = li.querySelector(".conversation-btn")?.textContent.toLowerCase() || "";
    li.style.display = !q || t.includes(q) ? "" : "none";
  });
});

autoGrow(input);
setGenerating(false);
loadState();
