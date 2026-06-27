// Shared header: gates auth, renders avatar + display name + logout.
// Include after api.js on every protected page.

function renderAvatarEl(account, size = 28) {
  const av = (account && account.avatar) || "🙂";
  const el = document.createElement("span");
  el.className = "user-avatar";
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.fontSize = size * 0.6 + "px";
  if (av.startsWith("data:image/")) {
    const img = document.createElement("img");
    img.src = av;
    img.alt = account.displayName || "";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.borderRadius = "50%";
    img.style.objectFit = "cover";
    el.appendChild(img);
  } else {
    el.textContent = av;
  }
  return el;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderUserArea() {
  const area = document.getElementById("user-area");
  if (!area) return;
  const account = getStoredAccount();
  if (!account) return;

  area.innerHTML = "";
  const avatar = renderAvatarEl(account);
  const name = document.createElement("span");
  name.className = "user-name";
  name.textContent = account.displayName || account.userId;
  name.title = `@${account.userId}`;

  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "logout-btn";
  logout.textContent = "Log out";
  logout.addEventListener("click", () => {
    clearSession();
    window.location.href = "/login.html";
  });

  const profileLink = document.createElement("a");
  profileLink.href = "/settings.html";
  profileLink.className = "user-profile-link";
  profileLink.title = "Edit profile";
  profileLink.appendChild(avatar);
  profileLink.appendChild(name);

  area.appendChild(profileLink);
  area.appendChild(logout);
}

function initHeader() {
  const onLoginPage = window.location.pathname.endsWith("/login.html");
  if (!onLoginPage && !isLoggedIn()) {
    window.location.href = "/login.html";
    return;
  }
  renderUserArea();
}

// Run the auth gate immediately so later scripts don't fire unauthenticated calls.
(function runAuthGate() {
  const onLoginPage = window.location.pathname.endsWith("/login.html");
  if (!onLoginPage && !isLoggedIn()) {
    window.location.href = "/login.html";
  }
})();

document.addEventListener("DOMContentLoaded", renderUserArea);
