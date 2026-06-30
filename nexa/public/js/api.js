function getUserId() {
  let id = localStorage.getItem("nexa_user_id");
  if (!id) {
    id = "u-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("nexa_user_id", id);
  }
  return id;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": getUserId(),
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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
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

// Streaming chat via SSE-over-fetch
async function streamChat(body, onEvent, { signal } = {}) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": getUserId() },
    body: JSON.stringify(body),
    signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = JSON.parse(line.slice(5).trim());
      if (json.error) throw new Error(json.error);
      if (json.done) result = json;
      else onEvent(json);
    }
  }
  return result;
}
