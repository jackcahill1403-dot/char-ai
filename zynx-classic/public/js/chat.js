const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const commandPalette = document.getElementById("command-palette");
const sendBtn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const attachChip = document.getElementById("attach-chip");
const exportBtn = document.getElementById("export-btn");
const errorEl = document.getElementById("error");
const statusLine = document.getElementById("status-line");
const conversationListEl = document.getElementById("conversation-list");
const newChatBtn = document.getElementById("new-chat-btn");
const chatModelSelect = document.getElementById("chat-model");

let agentsEnabled = false;
let activeConversationId = null;
let currentMessages = [];
let activeAbort = null;
let pendingAttachment = null;
let editIndex = null;

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function autoGrowTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  const max = 160;
  const next = Math.min(el.scrollHeight, max);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
}

function renderMessages(messages, { animate = false } = {}) {
  currentMessages = messages || [];
  messagesEl.innerHTML = "";
  if (!currentMessages.length) {
    messagesEl.innerHTML = '<li class="empty-state">Say hello — Atlas listening.</li>';
    return;
  }

  const lastAssistantIdx = (() => {
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      if (currentMessages[i].role === "assistant") return i;
    }
    return -1;
  })();

  currentMessages.forEach((msg, index) => {
    const li = document.createElement("li");
    li.className = `message ${msg.role}`;
    li.dataset.index = String(index);
    const staggerFrom = Math.max(0, currentMessages.length - 12);
    if (animate && index >= currentMessages.length - 2) {
      li.classList.add("message-enter");
      if (index === currentMessages.length - 1) li.style.animationDelay = "0.05s";
    } else if (!window.motionReduced?.() && index >= staggerFrom) {
      li.classList.add("message-enter");
      li.style.animationDelay = `${(index - staggerFrom) * 0.035}s`;
    }
    const label = msg.role === "user" ? "You" : "Atlas";
    const badges = msg.role === "assistant" ? badgeForLlm(msg.llm) : "";
    const isLastAssistant = index === lastAssistantIdx && msg.llm?.used;
    const feedbackBtns =
      msg.role === "assistant" && msg.llm?.used
        ? `<span class="feedback-btns" data-model="${escapeHtml(msg.llm.routedModel || msg.llm.model || "")}" data-reason="${escapeHtml(msg.llm.routeReason || "general")}">
            <button type="button" class="feedback-btn" data-vote="1" title="Good">👍</button>
            <button type="button" class="feedback-btn" data-vote="-1" title="Bad">👎</button>
          </span>`
        : "";
    const regenBtn = isLastAssistant
      ? `<button type="button" class="msg-action-btn regenerate-btn" title="Regenerate">↻</button>`
      : "";
    const editBtn =
      msg.role === "user"
        ? `<button type="button" class="msg-action-btn edit-btn" title="Edit & resend">✎</button>`
        : "";

    li.innerHTML = `
      <div class="message-head">
        <span class="meta">${label}</span>
        <div class="message-actions">
          ${editBtn}${regenBtn}
          ${feedbackBtns}
          ${badges}
          <button type="button" class="copy-msg-btn btn-icon" title="Copy">⧉</button>
        </div>
      </div>
      <div class="message-body">${formatMessageContent(msg.content)}</div>`;

    li.querySelector(".copy-msg-btn")?.addEventListener("click", (e) => copyText(msg.content, e.target));
    li.querySelector(".regenerate-btn")?.addEventListener("click", () => runChat({ regenerate: true }));
    li.querySelector(".edit-btn")?.addEventListener("click", () => startEditMessage(index, msg.content));
    li.querySelectorAll(".feedback-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const wrap = btn.closest(".feedback-btns");
        try {
          await submitFeedback({
            vote: Number(btn.dataset.vote),
            modelId: wrap?.dataset.model,
            reason: wrap?.dataset.reason,
          });
          wrap.querySelectorAll(".feedback-btn").forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
        } catch {
          /* ignore */
        }
      });
    });
    messagesEl.appendChild(li);
  });
  bindCopyHandlers(messagesEl);
  if (typeof initScrollReveals === "function") initScrollReveals(messagesEl);
  scrollChatToBottom(!animate);
}

function startEditMessage(index, content) {
  editIndex = index;
  input.value = content;
  autoGrowTextarea(input);
  input.focus();
  sendBtn.textContent = "Save & send";
  statusLine.textContent = "Editing message — sends from here and clears replies after.";
}

function clearEditMode() {
  editIndex = null;
  sendBtn.textContent = "Send";
}

function scrollChatToBottom(smooth) {
  if (typeof scrollMessagesToBottom === "function") scrollMessagesToBottom(smooth);
  else messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderConversationList(conversations, activeId) {
  if (!conversationListEl) return;
  activeConversationId = activeId;
  if (!conversations?.length) {
    conversationListEl.innerHTML = '<li class="hint">No chats yet</li>';
    return;
  }
  conversationListEl.innerHTML = conversations
    .map((c) => {
      const active = c.id === activeId ? " is-active" : "";
      const title = escapeHtml(c.title || "New chat");
      return `<li class="conversation-item${active}">
        <button type="button" class="conversation-btn" data-id="${c.id}" title="Double-click to rename">${title}</button>
        <button type="button" class="conversation-del btn-icon" data-id="${c.id}" title="Delete">×</button>
      </li>`;
    })
    .join("");

  if (!window.motionReduced?.()) {
    conversationListEl.querySelectorAll(".conversation-item").forEach((el, i) => {
      el.classList.add("conv-enter");
      el.style.animationDelay = `${i * 0.04}s`;
    });
  }

  conversationListEl.querySelectorAll(".conversation-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.id === activeConversationId) return;
      try {
        hideError(errorEl);
        clearEditMode();
        const data = await activateConversation(btn.dataset.id);
        renderConversationList((await getConversations()).conversations, data.activeConversationId);
        renderMessages(data.messages || []);
      } catch (err) {
        showError(errorEl, err.message);
      }
    });
    btn.addEventListener("dblclick", async (e) => {
      e.preventDefault();
      const title = prompt("Rename chat", btn.textContent);
      if (!title?.trim()) return;
      try {
        await renameConversationApi(btn.dataset.id, title.trim());
        const convData = await getConversations();
        renderConversationList(convData.conversations, convData.activeConversationId);
      } catch (err) {
        showError(errorEl, err.message);
      }
    });
  });

  conversationListEl.querySelectorAll(".conversation-del").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this chat?")) return;
      try {
        const data = await deleteConversationApi(btn.dataset.id);
        renderConversationList(data.conversations, data.activeConversationId);
        renderMessages(data.messages || []);
      } catch (err) {
        showError(errorEl, err.message);
      }
    });
  });
}

function populateModelSelect(models, active, autoRoute, pools) {
  if (!chatModelSelect) return;
  const poolMap = Object.fromEntries((pools || []).map((p) => [p.modelId, p]));
  const orModels = (models || []).filter((m) => m.openrouter || m.configured);
  chatModelSelect.innerHTML =
    `<option value="auto"${autoRoute !== false ? " selected" : ""}>Auto route</option>` +
    orModels
      .map((m) => {
        const sel = autoRoute === false && m.id === active ? " selected" : "";
        const p = poolMap[m.id];
        const usage = p ? ` · ${p.hourCount}/${p.perHour}hr` : "";
        return `<option value="${m.id}"${sel}>${escapeHtml(m.label)}${usage}</option>`;
      })
      .join("");
  chatModelSelect.disabled = agentsEnabled;
}

function setGenerating(on) {
  sendBtn.disabled = on;
  sendBtn.hidden = on;
  stopBtn.hidden = !on;
  if (attachBtn) attachBtn.disabled = on;
}

function appendStreamingAssistant() {
  const li = document.createElement("li");
  li.className = "message assistant streaming message-enter";
  li.id = "streaming-msg";
  li.innerHTML = `<div class="message-head"><span class="meta">Atlas</span><span class="msg-badge">streaming</span></div><div class="message-body"><div class="msg-text md-body"></div></div>`;
  messagesEl.appendChild(li);
  scrollChatToBottom(true);
  return li.querySelector(".msg-text");
}

function appendPipelinePanel() {
  const li = document.createElement("li");
  li.className = "message assistant streaming message-enter";
  li.id = "pipeline-panel";
  li.innerHTML = `
    <div class="message-head"><span class="meta">Dev team</span><span class="msg-badge">pipeline</span></div>
    <div class="message-body"><div class="pipeline-steps" id="pipeline-steps"></div></div>`;
  messagesEl.appendChild(li);
  scrollChatToBottom(true);
  return { stepsEl: li.querySelector("#pipeline-steps") };
}

function ensurePipelineStep(stepsEl, id, name, modelLabel) {
  let row = stepsEl.querySelector(`[data-step-id="${id}"]`);
  if (row) return row.querySelector(".pipeline-step-body");
  row = document.createElement("div");
  row.className = "pipeline-step is-running";
  row.dataset.stepId = id;
  row.innerHTML = `<div class="pipeline-step-head"><strong>${escapeHtml(name)}</strong><span class="pipeline-step-meta">${escapeHtml(modelLabel || "")} · running…</span></div><div class="pipeline-step-body"></div>`;
  stepsEl.appendChild(row);
  scrollChatToBottom(true);
  return row.querySelector(".pipeline-step-body");
}

function finishPipelineStep(stepsEl, step) {
  const row = stepsEl.querySelector(`[data-step-id="${step.id}"]`);
  if (!row) return;
  row.classList.remove("is-running");
  row.classList.add(step.failed ? "is-failed" : "is-done");
  const meta = row.querySelector(".pipeline-step-meta");
  if (meta) meta.textContent = `${step.modelLabel || step.model} · ${step.failed ? "failed" : "done"}`;
  const body = row.querySelector(".pipeline-step-body");
  if (body && step.content) {
    body.innerHTML = formatMessageContent(step.content.slice(0, 4000));
    bindCopyHandlers(body);
  } else if (body && step.error) body.textContent = step.error;
  scrollChatToBottom(true);
}

async function loadChat() {
  try {
    hideError(errorEl);
    const [{ settings, messages, agentsEnabled: devOn, activeConversationId: activeId }, models, usage, convData] =
      await Promise.all([getMemory(), getModels(), getUsage(), getConversations()]);
    agentsEnabled = devOn ?? usage.agentsEnabled;
    initTheme(usage.theme || settings.theme);
    if (typeof refreshGlobalUsage === "function") refreshGlobalUsage();
    populateModelSelect(models.models, models.active, models.autoRoute, usage.modelPools);
    renderConversationList(convData.conversations, activeId || convData.activeConversationId);
    const name = settings.displayName || "friend";
    const greetingEl = document.getElementById("greeting");
    if (greetingEl) greetingEl.textContent = `Hi ${name} — like ChatGPT: Enter send · Shift+Enter newline · ↻ regenerate`;
    if (!activeAbort) {
      statusLine.textContent = agentsEnabled
        ? "Dev team ON"
        : models.autoRoute !== false
          ? "Auto-route"
          : models.models.find((m) => m.id === models.active)?.label || "";
    }
    renderMessages(messages);
  } catch (err) {
    showError(errorEl, err.message);
  }
}

async function runChat(opts = {}) {
  const content = opts.content ?? input.value.trim();
  if (!content && !opts.regenerate) return;

  hideError(errorEl);
  setGenerating(true);
  activeAbort = new AbortController();

  let streamBody = null;
  let pipeline = null;
  const stepBodies = new Map();
  let streamed = "";

  if (agentsEnabled && !content.startsWith("!") && !opts.regenerate) {
    pipeline = appendPipelinePanel();
  } else {
    streamBody = appendStreamingAssistant();
  }

  const payload = {
    content,
    regenerate: Boolean(opts.regenerate),
  };
  if (editIndex !== null && !opts.regenerate) payload.editIndex = editIndex;
  if (pendingAttachment) payload.attachment = pendingAttachment;

  try {
    const result = await sendChatStream(
      payload,
      (event) => {
        if (event.type === "delta" || event.delta) {
          streamed += event.delta || "";
          if (streamBody) {
            streamBody.textContent = streamed;
            scrollChatToBottom(true);
          }
        }
        if (event.type === "step_start" && pipeline) {
          stepBodies.set(event.id, ensurePipelineStep(pipeline.stepsEl, event.id, event.name, event.modelLabel));
        }
        if (event.type === "step_delta" && pipeline) {
          const body = stepBodies.get(event.id);
          if (body) {
            body.dataset.raw = (body.dataset.raw || "") + event.delta;
            body.textContent = body.dataset.raw;
            scrollChatToBottom(true);
          }
        }
        if (event.type === "step_done" && pipeline) finishPipelineStep(pipeline.stepsEl, event);
        if (event.type === "fallback" && statusLine) {
          statusLine.textContent = `Fallback: ${event.from} → ${event.to}`;
        }
      },
      { signal: activeAbort.signal }
    );

    document.getElementById("streaming-msg")?.remove();
    document.getElementById("pipeline-panel")?.remove();
    if (result?.messages) renderMessages(result.messages, { animate: true });
    const convData = await getConversations();
    renderConversationList(convData.conversations, convData.activeConversationId);
    if (!opts.regenerate) input.value = "";
    clearEditMode();
    clearAttachment();
    autoGrowTextarea(input);
    if (typeof refreshGlobalUsage === "function") refreshGlobalUsage();
    await loadChat();
  } catch (err) {
    document.getElementById("streaming-msg")?.remove();
    document.getElementById("pipeline-panel")?.remove();
    if (err.name === "AbortError") {
      statusLine.textContent = "Stopped.";
    } else {
      showError(errorEl, err.message);
    }
  } finally {
    activeAbort = null;
    setGenerating(false);
    input.focus();
  }
}

function clearAttachment() {
  pendingAttachment = null;
  if (attachChip) {
    attachChip.hidden = true;
    attachChip.textContent = "";
  }
  if (fileInput) fileInput.value = "";
}

chatModelSelect?.addEventListener("change", async () => {
  const val = chatModelSelect.value;
  try {
    if (val === "auto") await updateSettings({ autoRoute: true });
    else await updateSettings({ model: val, autoRoute: false });
    await loadChat();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  runChat();
});

stopBtn?.addEventListener("click", () => {
  activeAbort?.abort();
});

attachBtn?.addEventListener("click", () => fileInput?.click());

fileInput?.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > 100000) {
    showError(errorEl, "File too large (max 100KB).");
    return;
  }
  const text = await file.text();
  pendingAttachment = { name: file.name, content: text };
  if (attachChip) {
    attachChip.hidden = false;
    attachChip.textContent = `📎 ${file.name}`;
    attachChip.onclick = clearAttachment;
  }
});

input?.addEventListener("input", async () => {
  autoGrowTextarea(input);
  const v = input.value;
  if (v === "!" || v === "! ") {
    const cmds = await loadCommands();
    showCommandPalette(cmds);
    return;
  }
  if (commandPalette) commandPalette.hidden = true;
});

input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
    return;
  }
  if (e.key === "Escape") {
    if (commandPalette) commandPalette.hidden = true;
    clearEditMode();
  }
});

newChatBtn?.addEventListener("click", async () => {
  hideError(errorEl);
  clearEditMode();
  try {
    await createConversationApi("New chat");
    const convData = await getConversations();
    renderConversationList(convData.conversations, convData.activeConversationId);
    renderMessages([]);
    input.focus();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

if (exportBtn) exportBtn.addEventListener("click", () => exportMarkdown());

let commandCache = null;
async function loadCommands() {
  if (commandCache) return commandCache;
  try {
    commandCache = (await getCommands()).commands || [];
  } catch {
    commandCache = [];
  }
  return commandCache;
}

function showCommandPalette(commands) {
  if (!commandPalette) return;
  if (!commands.length) {
    commandPalette.hidden = true;
    return;
  }
  commandPalette.hidden = false;
  commandPalette.innerHTML = commands
    .map(
      (c) =>
        `<button type="button" class="command-palette-item" data-usage="${c.usage.replace(/"/g, "&quot;")}"><code>${c.usage}</code><span>${c.desc}${c.free ? " · FREE" : ""}</span></button>`
    )
    .join("");
  commandPalette.querySelectorAll(".command-palette-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.usage === "!" ? "!" : `${btn.dataset.usage} `;
      commandPalette.hidden = true;
      input.focus();
    });
  });
}

document.addEventListener("click", (e) => {
  if (!commandPalette || commandPalette.hidden) return;
  if (e.target === input || commandPalette.contains(e.target)) return;
  commandPalette.hidden = true;
});

const prefill = new URLSearchParams(window.location.search).get("q");
if (prefill && input) input.value = prefill;

autoGrowTextarea(input);
setGenerating(false);
loadChat();
