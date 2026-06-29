const THEME_KEY = "zynx_theme";

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  localStorage.setItem(THEME_KEY, theme === "light" ? "light" : "dark");
}

function initTheme(settingsTheme) {
  const stored = localStorage.getItem(THEME_KEY);
  // localStorage wins; otherwise default light regardless of stale server value
  const theme = stored || "light";
  applyTheme(theme);
}

window.initTheme = initTheme;
