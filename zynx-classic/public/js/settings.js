const displayNameInput = document.getElementById("display-name");
const userSpaceInput = document.getElementById("user-space");
const shareLinkEl = document.getElementById("share-link");
const useCacheEl = document.getElementById("use-response-cache");
const modelListEl = document.getElementById("model-list");
const cavemanDictEl = document.getElementById("caveman-dict");
const hfCustomModelEl = document.getElementById("hf-custom-model");
const saveBtn = document.getElementById("save-btn");
const errorEl = document.getElementById("error");
const successEl = document.getElementById("success");

function renderModels(models, activeId) {
  modelListEl.innerHTML = "";
  const free = models.filter((m) => m.free);
  const or = free.filter((m) => m.openrouter || m.id.startsWith("or-"));
  const otherFree = free.filter((m) => !m.openrouter && !m.id.startsWith("or-"));
  const hf = models.filter((m) => m.hf);

  function badge(m) {
    if (m.free) return `<span class="badge ok">free</span>`;
    return `<span class="badge ${m.configured ? "ok" : "no"}">${m.configured ? "key ok" : "no key"}</span>`;
  }

  function addGroup(title, list) {
    if (!list.length) return;
    const h = document.createElement("p");
    h.className = "hint model-group-title";
    h.textContent = title;
    modelListEl.appendChild(h);
    for (const m of list) {
      const label = document.createElement("label");
      label.className = "model-option";
      label.innerHTML = `
        <input type="radio" name="model" value="${m.id}" ${m.id === activeId ? "checked" : ""} />
        <span class="model-meta"><strong>${escapeHtml(m.label)}</strong><br/>
          <span class="hint">${escapeHtml(m.model)}</span>
          ${m.hint ? `<br/><span class="hint">${escapeHtml(m.hint)}</span>` : ""}
        </span>
        ${badge(m)}
      `;
      modelListEl.appendChild(label);
    }
  }

  addGroup("OpenRouter — Kimi, GLM, Qwen (20/hr · 50/day each)", or);
  addGroup("Other free — 20/hr · 50/day each", otherFree);
  addGroup("Hugging Face — 20/hr · 50/day each (needs HF billing)", hf);
  if (typeof initScrollReveals === "function") initScrollReveals(modelListEl);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function dictToText(dict) {
  return Object.entries(dict || {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function textToDict(text) {
  const dict = {};
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    dict[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return dict;
}

function refreshShareLink(userId) {
  if (!shareLinkEl) return;
  const id = userId || getZynxUserId();
  const base = `${window.location.origin}/?user=`;
  shareLinkEl.textContent = `${base}friend-name`;
  shareLinkEl.title = shareLinkForUser(id);
}

async function loadSettings() {
  try {
    hideError(errorEl);
    const mem = await getMemory();
    const { settings, userId } = mem;
    const models = await getModels();
    displayNameInput.value = settings.displayName || "User";
    if (userSpaceInput) userSpaceInput.value = userId || getZynxUserId();
    refreshShareLink(userId || getZynxUserId());
    if (useCacheEl) useCacheEl.checked = settings.useResponseCache !== false;
    if (cavemanDictEl) cavemanDictEl.value = dictToText(settings.cavemanDict);
    if (hfCustomModelEl) hfCustomModelEl.value = settings.hfCustomModel || "";
    initTheme(settings.theme);
    renderModels(models.models, models.active);
  } catch (err) {
    showError(errorEl, err.message);
  }
}

saveBtn.addEventListener("click", async () => {
  hideError(errorEl);
  const model = document.querySelector('input[name="model"]:checked')?.value || "or-kimi";
  const spaceName = userSpaceInput?.value.trim();
  if (spaceName) setZynxUserId(spaceName);
  try {
    await updateSettings({
      model,
      displayName: displayNameInput.value.trim() || "User",
      useResponseCache: useCacheEl?.checked ?? true,
      theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      cavemanDict: textToDict(cavemanDictEl?.value),
      hfCustomModel: hfCustomModelEl?.value.trim() || "",
    });
    showSuccess(successEl, "Saved.");
    await loadSettings();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

loadSettings();
