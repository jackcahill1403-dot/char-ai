const displayNameEl = document.getElementById("display-name");
const modelListEl = document.getElementById("model-list");
const customPromptEl = document.getElementById("custom-prompt");
const darkToggle = document.getElementById("dark-toggle");
const saveBtn = document.getElementById("save-btn");
const errorEl = document.getElementById("error");
const successEl = document.getElementById("success");

function esc(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

function showSuccess(msg) {
  successEl.textContent = msg;
  successEl.classList.add("is-visible");
  setTimeout(() => successEl.classList.remove("is-visible"), 1800);
}

function renderModels(models, active) {
  modelListEl.innerHTML = models.map((m) => `
    <label class="model-option">
      <input type="radio" name="model" value="${m.id}" ${m.id === active ? "checked" : ""} ${m.configured ? "" : "disabled"} />
      <span class="model-meta"><strong>${esc(m.label)}</strong><br/>
        <span class="hint">${esc(m.role)}</span><br/>
        <span class="hint">${esc(m.model)}</span>
      </span>
      <span class="badge ${m.configured ? "ok" : "no"}">${m.configured ? "ready" : "no key"}</span>
    </label>
  `).join("");
}

async function load() {
  try {
    hideError(errorEl);
    const [state, models] = await Promise.all([api("/api/state"), api("/api/models")]);
    displayNameEl.value = state.settings.displayName || "";
    customPromptEl.value = state.settings.customPrompt || "";
    darkToggle.checked = state.settings.theme === "dark";
    initTheme(state.settings.theme);
    renderModels(models.models, state.settings.model || models.active);
  } catch (err) {
    showError(errorEl, err.message);
  }
}

saveBtn.addEventListener("click", async () => {
  hideError(errorEl);
  const model = document.querySelector('input[name="model"]:checked')?.value;
  const theme = darkToggle.checked ? "dark" : "light";
  applyTheme(theme);
  try {
    await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        displayName: displayNameEl.value.trim() || "there",
        model,
        customPrompt: customPromptEl.value.trim(),
        theme,
      }),
    });
    showSuccess("Saved.");
    await load();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

darkToggle.addEventListener("change", () => applyTheme(darkToggle.checked ? "dark" : "light"));

load();
