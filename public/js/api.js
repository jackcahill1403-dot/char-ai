const USER_KEY = "char-ai-userId";
const LEGACY_USER_KEY = "mini-zynx-userId";
const ACCOUNT_KEY = "char-ai-account";

function getStoredAccount() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
  } catch {
    return null;
  }
}

function setSession(account) {
  if (!account || !account.userId) return;
  localStorage.setItem(USER_KEY, account.userId);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

function clearSession() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

function isLoggedIn() {
  return !!getStoredAccount();
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

function getUserId() {
  const account = getStoredAccount();
  if (account && account.userId) return account.userId;
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = localStorage.getItem(LEGACY_USER_KEY);
    if (id) {
      localStorage.setItem(USER_KEY, id);
    }
  }
  return id || "";
}

function setUserId(id) {
  const cleaned = String(id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!cleaned) return null;
  localStorage.setItem(USER_KEY, cleaned);
  return cleaned;
}

async function apiRequest(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-User-Id": getUserId(),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });

  let data;
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

function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
}

function hideError(el) {
  if (!el) return;
  el.classList.remove("visible");
}

function getMemory() {
  return apiRequest("/api/memory");
}

function sendChat(content) {
  return apiRequest("/api/chat", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

function updateSettings(settings) {
  return apiRequest("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

function clearMessages() {
  return apiRequest("/api/messages", { method: "DELETE" });
}

function clearLearned() {
  return apiRequest("/api/learned", { method: "DELETE" });
}

function getBackgroundLearnStatus() {
  return apiRequest("/api/background-learn");
}

function tickBackgroundLearn() {
  return apiRequest("/api/background-learn/tick", { method: "POST" });
}

function startBackgroundLearn() {
  return apiRequest("/api/background-learn/start", { method: "POST" });
}

function stopBackgroundLearn() {
  return apiRequest("/api/background-learn/stop", { method: "POST" });
}

function addDataCenterEntry(entry) {
  return apiRequest("/api/data-center/entry", {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

function getFeedStatus() {
  return apiRequest("/api/data-center/feed");
}

function startFeed(intervalSec) {
  return apiRequest("/api/data-center/feed/start", {
    method: "POST",
    body: JSON.stringify({ intervalSec }),
  });
}

function stopFeed() {
  return apiRequest("/api/data-center/feed/stop", { method: "POST" });
}

function tickFeed() {
  return apiRequest("/api/data-center/feed/tick", { method: "POST" });
}

function enqueueFeed(entry) {
  return apiRequest("/api/data-center/queue", {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

function getQueue() {
  return apiRequest("/api/data-center/queue");
}

function clearQueue() {
  return apiRequest("/api/data-center/queue", { method: "DELETE" });
}

function getReflectionStatus() {
  return apiRequest("/api/reflection");
}

function tickReflection() {
  return apiRequest("/api/reflection/tick", { method: "POST" });
}

function startReflection() {
  return apiRequest("/api/reflection/start", { method: "POST" });
}

function stopReflection() {
  return apiRequest("/api/reflection/stop", { method: "POST" });
}

function listUsers() {
  return apiRequest("/api/users");
}

function whoami() {
  return apiRequest("/api/whoami");
}

function getLlmStatus() {
  return apiRequest("/api/llm-status");
}

function getUsage() {
  return apiRequest("/api/usage");
}

function registerAccount(payload) {
  return fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || "Register failed")))));
}

function loginAccount(payload) {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || "Login failed")))));
}

function getProfile() {
  return apiRequest("/api/profile");
}

function updateProfile(payload) {
  return apiRequest("/api/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

function getAccounts() {
  return apiRequest("/api/accounts");
}
