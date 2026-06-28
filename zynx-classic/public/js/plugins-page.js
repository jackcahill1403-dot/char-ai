const pluginListEl = document.getElementById("plugin-list");
const errorEl = document.getElementById("error");
const successEl = document.getElementById("success");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function powerClass(power) {
  if (power === "high") return "power-high";
  if (power === "medium") return "power-med";
  return "power-low";
}

function renderPlugins(plugins) {
  pluginListEl.innerHTML = "";
  if (!plugins.length) {
    pluginListEl.innerHTML = '<p class="hint">No plugins in catalog.</p>';
    return;
  }
  for (const p of plugins) {
    const card = document.createElement("div");
    card.className = "plugin-card";
    const tags = (p.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    card.innerHTML = `
      <div class="plugin-card-head">
        <div>
          <strong>${escapeHtml(p.name)}</strong>
          <span class="badge ${powerClass(p.power)}">${escapeHtml(p.power || "low")} power</span>
        </div>
        <span class="hint">v${escapeHtml(p.version)}</span>
      </div>
      <p class="plugin-desc">${escapeHtml(p.description)}</p>
      <div class="plugin-tags">${tags}</div>
      <div class="plugin-actions"></div>
    `;
    const actions = card.querySelector(".plugin-actions");
    if (!p.installed) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Download & install";
      btn.addEventListener("click", () => installOne(p.id));
      actions.appendChild(btn);
    } else {
      const toggle = document.createElement("label");
      toggle.className = "toggle-row";
      toggle.innerHTML = `
        <input type="checkbox" ${p.enabled ? "checked" : ""} />
        Enabled
      `;
      toggle.querySelector("input").addEventListener("change", (e) =>
        toggleOne(p.id, e.target.checked)
      );
      const uninstall = document.createElement("button");
      uninstall.type = "button";
      uninstall.className = "btn-secondary";
      uninstall.textContent = "Uninstall";
      uninstall.addEventListener("click", () => uninstallOne(p.id));
      actions.appendChild(toggle);
      actions.appendChild(uninstall);
    }
    pluginListEl.appendChild(card);
  }
  if (typeof initScrollReveals === "function") initScrollReveals(pluginListEl);
}

async function installOne(id) {
  hideError(errorEl);
  try {
    await installPlugin(id);
    showSuccess(successEl, "Plugin installed.");
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
