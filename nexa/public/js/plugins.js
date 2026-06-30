const gridEl = document.getElementById("plugin-grid");
const errorEl = document.getElementById("error");

function esc(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

function render(plugins) {
  gridEl.innerHTML = plugins
    .map(
      (p) => `
    <div class="plugin-card ${p.enabled ? "is-on" : ""}" data-id="${p.id}">
      <div class="plugin-icon" aria-hidden="true">${p.icon}</div>
      <div class="plugin-body">
        <div class="plugin-name">${esc(p.name)}</div>
        <p class="plugin-blurb">${esc(p.blurb)}</p>
      </div>
      <button type="button" class="plugin-switch ${p.enabled ? "is-on" : ""}" role="switch"
        aria-checked="${p.enabled}" data-id="${p.id}" aria-label="Toggle ${esc(p.name)}">
        <span class="plugin-knob"></span>
      </button>
    </div>`
    )
    .join("");

  gridEl.querySelectorAll(".plugin-switch").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const enable = btn.getAttribute("aria-checked") !== "true";
      try {
        hideError(errorEl);
        const data = await api("/api/plugins/toggle", {
          method: "POST",
          body: JSON.stringify({ id, enabled: enable }),
        });
        render(data.plugins);
      } catch (err) {
        showError(errorEl, err.message);
      }
    });
  });
}

async function load() {
  try {
    hideError(errorEl);
    const [{ plugins }, state] = await Promise.all([api("/api/plugins"), api("/api/state")]);
    initTheme(state.settings.theme);
    render(plugins);
  } catch (err) {
    showError(errorEl, err.message);
  }
}

load();
