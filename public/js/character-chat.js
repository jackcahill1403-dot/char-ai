const params = new URLSearchParams(window.location.search);
const characterId = params.get("id");

const titleEl = document.getElementById("char-title");
const scenarioEl = document.getElementById("char-scenario-display");
const sceneAvatarEl = document.getElementById("char-scene-avatar");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const sessionSelect = document.getElementById("session-select");
const newChatBtn = document.getElementById("new-chat-btn");
const renameBtn = document.getElementById("rename-btn");
const deleteBtn = document.getElementById("delete-btn");
const errorEl = document.getElementById("error");
const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editTextarea = document.getElementById("edit-textarea");
const editCancel = document.getElementById("edit-cancel");
const editModalTitle = document.getElementById("edit-modal-title");
const chatDrawer = document.getElementById("chat-drawer");
const drawerToggle = document.getElementById("chat-drawer-toggle");

let character = null;
let sessions = [];
let currentSession = null;
let editingMessageId = null;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function setDrawerOpen(open) {
  if (!chatDrawer || !drawerToggle) return;
  chatDrawer.classList.toggle("open", open);
  drawerToggle.textContent = open ? "✕ Close" : "☰ Chats";
}

if (drawerToggle) {
  drawerToggle.addEventListener("click", () => {
    setDrawerOpen(!chatDrawer.classList.contains("open"));
  });
}

function renderSceneAvatar(character) {
  if (!sceneAvatarEl) return;
  sceneAvatarEl.innerHTML = "";
  sceneAvatarEl.classList.remove("has-image");
  if (character && character.image) {
    const img = document.createElement("img");
    img.src = character.image;
    img.alt = character.name || "";
    img.className = "scene-avatar-img";
    img.onerror = () => {
      sceneAvatarEl.innerHTML = `<span class="scene-avatar-emoji">${escapeHtml(character.avatar || "🧑")}</span>`;
      sceneAvatarEl.classList.remove("has-image");
    };
    sceneAvatarEl.appendChild(img);
    sceneAvatarEl.classList.add("has-image");
  } else if (character) {
    sceneAvatarEl.innerHTML = `<span class="scene-avatar-emoji">${escapeHtml(character.avatar || "🧑")}</span>`;
  }
}

function formatContent(text) {
  const lines = String(text || "").split("\n");
  const parts = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Whole-line action: *does something*
    if (/^\*[^*]+\*$/.test(trimmed)) {
      parts.push(`<p class="action">${escapeHtml(trimmed.slice(1, -1))}</p>`);
      continue;
    }
    // Dialogue — strip short *emphasis* (e.g. *or*) so it doesn't break mid-sentence
    let html = escapeHtml(trimmed);
    html = html.replace(/\*([^*]+)\*/g, (_, inner) => {
      const wordCount = inner.trim().split(/\s+/).length;
      if (wordCount >= 2 || inner.length >= 14) {
        return `<em class="inline-em">${escapeHtml(inner)}</em>`;
      }
      return escapeHtml(inner);
    });
    parts.push(`<p class="dialogue-line">${html}</p>`);
  }
  return parts.join("") || `<p class="dialogue-line">${escapeHtml(text)}</p>`;
}

function appendMessageAvatar(container) {
  const av = document.createElement("div");
  av.className = "message-avatar";
  if (character?.image) {
    const img = document.createElement("img");
    img.src = character.image;
    img.alt = character.name || "";
    img.className = "message-avatar-img";
    img.onerror = () => {
      av.innerHTML = "";
      av.textContent = character.avatar || "🧑";
    };
    av.appendChild(img);
  } else {
    av.textContent = character?.avatar || "🧑";
  }
  container.appendChild(av);
}

function renderMessages(messages) {
  messagesEl.innerHTML = "";
  if (!messages.length) {
    messagesEl.innerHTML = '<li class="empty-state">No messages yet.</li>';
    return;
  }
  for (const msg of messages) {
    messagesEl.appendChild(renderMessageEl(msg));
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessageEl(msg) {
  const li = document.createElement("li");
  li.className = `message ${msg.role}`;
  li.dataset.id = msg.id || "";

  const inner = document.createElement("div");
  inner.className = "message-inner";

  if (msg.role === "assistant") {
    appendMessageAvatar(inner);
  }

  const body = document.createElement("div");
  body.className = "message-body";

  const nameEl = document.createElement("span");
  nameEl.className = "message-name";
  nameEl.textContent = msg.role === "user" ? "You" : character?.name || "Character";

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = formatContent(msg.content);

  const actions = document.createElement("span");
  actions.className = "message-actions";
  if (msg.role === "user" && !msg.greeting) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "msg-action";
    editBtn.textContent = "Edit";
    editBtn.title = "Edit your message";
    editBtn.addEventListener("click", () => openEditModal(msg));
    actions.appendChild(editBtn);
  }
  if (msg.role === "assistant" && !msg.greeting) {
    const regenBtn = document.createElement("button");
    regenBtn.type = "button";
    regenBtn.className = "msg-action";
    regenBtn.textContent = "Regenerate";
    regenBtn.title = "Regenerate this reply";
    regenBtn.addEventListener("click", () => regenerateReply());
    actions.appendChild(regenBtn);
  }

  body.appendChild(nameEl);
  body.appendChild(content);
  if (actions.children.length) body.appendChild(actions);
  inner.appendChild(body);
  li.appendChild(inner);
  return li;
}

function renderSessionSelect() {
  sessionSelect.innerHTML = "";
  if (!sessions.length) {
    const opt = document.createElement("option");
    opt.textContent = "No chats";
    sessionSelect.appendChild(opt);
    return;
  }
  for (const s of sessions) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.title || "New chat"} (${s.messageCount})`;
    if (currentSession && s.id === currentSession.id) opt.selected = true;
    sessionSelect.appendChild(opt);
  }
}

async function loadCharacterAndSessions() {
  if (!isLoggedIn()) return;
  if (!characterId) {
    showError(errorEl, "No character selected. Go back to the characters page.");
    return;
  }
  try {
    hideError(errorEl);
    const data = await getCharacter(characterId);
    character = data.character;
    sessions = data.sessions || [];
    titleEl.textContent = character.name;
    scenarioEl.textContent = character.scenario || "";
    renderSceneAvatar(character);
    document.title = `char.ai — ${character.name}`;

    if (!sessions.length) {
      const r = await createSession(characterId);
      sessions = [r.session];
      currentSession = r.session;
    } else {
      currentSession = sessions[0];
    }
    renderSessionSelect();
    await loadCurrentSessionMessages();
  } catch (err) {
    showError(errorEl, err.message);
  }
}

async function loadCurrentSessionMessages() {
  if (!currentSession) return;
  try {
    const data = await getSessionMessages(characterId, currentSession.id);
    currentSession = data.session;
    renderMessages(currentSession.messages || []);
  } catch (err) {
    showError(errorEl, err.message);
  }
}

sessionSelect.addEventListener("change", async () => {
  const id = sessionSelect.value;
  const found = sessions.find((s) => s.id === id);
  if (!found) return;
  currentSession = found;
  await loadCurrentSessionMessages();
});

newChatBtn.addEventListener("click", async () => {
  hideError(errorEl);
  try {
    const r = await createSession(characterId);
    sessions = [r.session, ...sessions];
    currentSession = r.session;
    renderSessionSelect();
    renderMessages(currentSession.messages || []);
    input.focus();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

renameBtn.addEventListener("click", async () => {
  if (!currentSession) return;
  const title = prompt("Rename this chat:", currentSession.title || "");
  if (title == null) return;
  try {
    const r = await renameSession(characterId, currentSession.id, title);
    currentSession = r.session;
    sessions = sessions.map((s) => (s.id === r.session.id ? { ...s, title: r.session.title } : s));
    renderSessionSelect();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

deleteBtn.addEventListener("click", async () => {
  if (!currentSession) return;
  if (!confirm(`Delete this chat "${currentSession.title || "New chat"}"? This cannot be undone.`)) return;
  hideError(errorEl);
  try {
    await deleteSession(characterId, currentSession.id);
    sessions = sessions.filter((s) => s.id !== currentSession.id);
    if (sessions.length) {
      currentSession = sessions[0];
      await loadCurrentSessionMessages();
    } else {
      const r = await createSession(characterId);
      sessions = [r.session];
      currentSession = r.session;
      renderMessages(currentSession.messages || []);
    }
    renderSessionSelect();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = input.value.trim();
  if (!content || !currentSession) return;
  sendBtn.disabled = true;
  hideError(errorEl);
  try {
    const r = await sendSessionMessage(characterId, currentSession.id, content);
    input.value = "";
    currentSession = r.session;
    sessions = sessions.map((s) => (s.id === r.session.id ? { ...s, title: r.session.title, messageCount: r.session.messages.length, updatedAt: r.session.updatedAt } : s));
    renderSessionSelect();
    renderMessages(currentSession.messages || []);
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});

async function regenerateReply() {
  if (!currentSession) return;
  sendBtn.disabled = true;
  hideError(errorEl);
  try {
    const r = await regenerateLastReply(characterId, currentSession.id);
    currentSession = r.session;
    renderMessages(currentSession.messages || []);
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function openEditModal(msg) {
  editingMessageId = msg.id;
  editTextarea.value = msg.content;
  editModalTitle.textContent = "Edit your message";
  editModal.style.display = "flex";
}

editCancel.addEventListener("click", () => {
  editModal.style.display = "none";
  editingMessageId = null;
});
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) {
    editModal.style.display = "none";
    editingMessageId = null;
  }
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingMessageId || !currentSession) return;
  const content = editTextarea.value.trim();
  if (!content) return;
  sendBtn.disabled = true;
  hideError(errorEl);
  try {
    const r = await editSessionMessage(characterId, currentSession.id, editingMessageId, content);
    currentSession = r.session;
    editModal.style.display = "none";
    editingMessageId = null;
    renderMessages(currentSession.messages || []);
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});

loadCharacterAndSessions();
