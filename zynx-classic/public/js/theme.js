const THEME_KEY = "zynx_theme";

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  localStorage.setItem(THEME_KEY, theme === "light" ? "light" : "dark");
}

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function initTheme(settingsTheme) {
  const stored = localStorage.getItem(THEME_KEY);
  // localStorage wins; otherwise default light regardless of stale server value
  const theme = stored || "light";
  applyTheme(theme);
  updateThemeToggleIcon();
}

function toggleTheme() {
  const next = currentTheme() === "light" ? "dark" : "light";
  applyTheme(next);
  updateThemeToggleIcon();
  return next;
}

const SUN = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function updateThemeToggleIcon() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const isLight = currentTheme() === "light";
  btn.innerHTML = isLight ? MOON : SUN;
  btn.title = isLight ? "Switch to dark mode" : "Switch to light mode";
  btn.setAttribute("aria-label", btn.title);
}

function mountThemeToggle() {
  const header = document.querySelector(".app-header");
  if (!header || document.getElementById("theme-toggle")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "theme-toggle";
  btn.className = "btn-icon theme-toggle";
  btn.addEventListener("click", toggleTheme);
  const actions = header.querySelector(".app-header-actions");
  if (actions) actions.prepend(btn);
  else header.appendChild(btn);
  updateThemeToggleIcon();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountThemeToggle);
} else {
  mountThemeToggle();
}

window.initTheme = initTheme;
window.toggleTheme = toggleTheme;
