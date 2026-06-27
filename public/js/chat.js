const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const clearBtn = document.getElementById("clear-btn");
const errorEl = document.getElementById("error");
const modeBadge = document.getElementById("mode-badge");
const greeting = document.getElementById("greeting");

function renderMessages(messages) {
  messagesEl.innerHTML = "";

  if (!messages.length) {
    messagesEl.innerHTML = '<li class="empty-state">New chat — say hello!</li>';
    return;
  }

  for (const msg of messages) {
    const li = document.createElement("li");
    li.className = `message ${msg.role}`;
    const label = msg.role === "user" ? "You" : "char.ai";
    li.innerHTML = `<span class="meta">${label}</span>${escapeHtml(msg.content)}`;
    messagesEl.appendChild(li);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function loadChat() {
  if (!isLoggedIn()) return;
  try {
    hideError(errorEl);
    const account = getStoredAccount();
    const { settings, messages } = await getMemory();
    modeBadge.textContent = settings.mode;
    const name = (account && account.displayName) || settings.displayName || "friend";
    greeting.textContent = `Chat — hi, ${name}`;
    const greetingText = document.getElementById("greeting-text");
    if (greetingText) {
      const hour = new Date().getHours();
      const tod = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
      greetingText.textContent = `Good ${tod}, ${name}. I'm char.ai. Ask me anything, or visit the Characters page to roleplay.`;
    }
    renderMessages(messages);
  } catch (err) {
    showError(errorEl, err.message);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = input.value.trim();
  if (!content) return;

  sendBtn.disabled = true;
  hideError(errorEl);

  try {
    const { messages } = await sendChat(content);
    input.value = "";
    renderMessages(messages);
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Start a new chat? The current conversation will be cleared.")) return;

  hideError(errorEl);
  try {
    const { messages } = await clearMessages();
    renderMessages(messages);
    input.focus();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

loadChat();
