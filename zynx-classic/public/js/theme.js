const THEME_KEY = "zynx_theme";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, theme === "dark" ? "dark" : "light");
}

function initTheme(settingsTheme) {
  const stored = localStorage.getItem(THEME_KEY);
  const theme = stored || settingsTheme || "light";
  applyTheme(theme);
}

window.initTheme = initTheme;
