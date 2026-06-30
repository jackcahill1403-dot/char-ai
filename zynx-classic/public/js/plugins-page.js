const pluginListEl = document.getElementById("plugin-list");
const errorEl = document.getElementById("error");
const successEl = document.getElementById("success");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function monogram(name) {
  return escapeHtml(String(name || "?").trim().charAt(0).toUpperCase());
}

function renderPlugins(plugins) {
  pluginListEl.innerHTML = "";
  if (!plugins.length) {
    pluginListEl.innerHTML = '<p class="hint">No plugins in catalog.</p>';
    return;
  }
  for (const p of plugins) {
    const on = p.installed && p.enabled;
    const tile = document.createElement("div");
    tile.className = `plugin-tile ${on ? "is-on" : ""}`.trim();
    tile.innerHTML = `
      <div class="plugin-tile-icon" aria-hidden="true">${monogram(p.name)}</div>
      <div class="plugin-tile-body">
        <div class="plugin-tile-name">${escapeHtml(p.name)}</div>
        <p class="plugin-tile-blurb">${escapeHtml(p.description)}</p>
      </div>
      <button type="button" class="plugin-switch ${on ? "is-on" : ""}" role="switch"
        aria-checked="${on}" aria-label="Toggle ${escapeHtml(p.name)}">
        <span class="plugin-knob"></span>
      </button>`;

    tile.querySelector(".plugin-switch").addEventListener("click", () => {
      if (on) toggleOne(p.id, false); // turn off (stays installed)
      else installOne(p.id); // install if needed + enable
    });
    pluginListEl.appendChild(tile);
  }
  if (typeof initScrollReveals === "function") initScrollReveals(pluginListEl);
}

async function installOne(id) {
  hideError(errorEl);
  try {
    await installPlugin(id);
    try { await togglePlugin(id, true); } catch { /* enable best-effort */ }
    showSuccess(successEl, "Plugin enabled.");
    await loadPage();
  } catch (err) {
    showError(errorEl, err.message);
  }
}

async function toggleOne(id, enabled) {
  hideError(errorEl);
  try {
    await togglePlugin(id, enabled);
    await loadPage();
  } catch (err) {
    showError(errorEl, err.message);
  }
}

async function uninstallOne(id) {
  if (!confirm("Uninstall this plugin?")) return;
  hideError(errorEl);
  try {
    await uninstallPlugin(id);
    showSuccess(successEl, "Plugin removed.");
    await loadPage();
  } catch (err) {
    showError(errorEl, err.message);
  }
}

async function loadPage() {
  const data = await getPlugins();
  renderPlugins(data.plugins);
}

loadPage().catch((err) => showError(errorEl, err.message));
