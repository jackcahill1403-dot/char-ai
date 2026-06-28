const globalListEl = document.getElementById("global-list");
const localListEl = document.getElementById("local-list");
const feedListEl = document.getElementById("feed-list");
const nameInput = document.getElementById("script-name");
const contentInput = document.getElementById("script-content");
const folderInput = document.getElementById("script-folder");
const tagsInput = document.getElementById("script-tags");
const folderFilterEl = document.getElementById("folder-filter");
const saveBtn = document.getElementById("save-script-btn");
const errorEl = document.getElementById("error");
const successEl = document.getElementById("success");

let pageData = { local: [], global: [], feed: [] };

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderScriptCard(script, isLocal) {
  const card = document.createElement("div");
  card.className = "script-card";
  const tags = (script.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
  card.innerHTML = `
    <div class="script-card-head">
      <strong>${escapeHtml(script.name)}</strong>
      <code>!run ${escapeHtml(script.slug)}</code>
    </div>
    <p class="hint">${isLocal ? `folder: ${escapeHtml(script.folder || "default")}` : `by ${escapeHtml(script.author || "?")}`}</p>
    <div class="plugin-tags">${tags}</div>
    ${script.description ? `<p class="hint">${escapeHtml(script.description)}</p>` : ""}
    <pre class="script-preview">${escapeHtml(script.content.slice(0, 400))}${script.content.length > 400 ? "…" : ""}</pre>
    <div class="plugin-actions"></div>
  `;
  const actions = card.querySelector(".plugin-actions");

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.className = "btn";
  runBtn.textContent = "Run (free)";
  runBtn.addEventListener("click", () => runScript(script.slug));
  actions.appendChild(runBtn);

  if (isLocal) {
    const contBtn = document.createElement("button");
    contBtn.type = "button";
    contBtn.className = "btn-secondary";
    contBtn.textContent = "Continue in chat";
    contBtn.addEventListener("click", () => {
      window.location.href = `/?q=${encodeURIComponent(`!agents continue ${script.slug} -- `)}`;
    });
    actions.appendChild(contBtn);

    if (!script.publishedGlobal) {
      const pubBtn = document.createElement("button");
      pubBtn.type = "button";
      pubBtn.className = "btn-secondary";
      pubBtn.textContent = "Publish global";
      pubBtn.addEventListener("click", () => publishScript(script.slug));
      actions.appendChild(pubBtn);
    } else {
      const badge = document.createElement("span");
      badge.className = "badge ok";
      badge.textContent = "published";
      actions.appendChild(badge);
    }
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-secondary";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteScript(script.slug));
    actions.appendChild(delBtn);
  } else {
    const badge = document.createElement("span");
    badge.className = "badge ok";
    badge.textContent = "global";
    actions.appendChild(badge);
  }

  return card;
}

function renderFeed(feed) {
  if (!feedListEl) return;
  feedListEl.innerHTML = "";
  if (!feed?.length) {
    feedListEl.innerHTML = "<p class=\"hint\">No published scripts yet.</p>";
    return;
  }
  for (const s of feed) {
    const row = document.createElement("div");
    row.className = "script-card";
    row.innerHTML = `
      <div class="script-card-head"><strong>${escapeHtml(s.name)}</strong><span class="hint">by ${escapeHtml(s.author)}</span></div>
      <p class="hint">${escapeHtml(s.description || "")}</p>
      <code>!run ${escapeHtml(s.slug)}</code>
    `;
    feedListEl.appendChild(row);
  }
}

function renderLists(data) {
  pageData = data;
  const local = data.local || [];
  const folder = folderFilterEl?.value || "";
  const filtered = folder ? local.filter((s) => (s.folder || "default") === folder) : local;

  globalListEl.innerHTML = "";
  localListEl.innerHTML = "";
  if (!data.global.length) {
    globalListEl.innerHTML = '<p class="hint">No global scripts yet.</p>';
  } else {
    for (const s of data.global) globalListEl.appendChild(renderScriptCard(s, false));
  }
  if (!filtered.length) {
    localListEl.innerHTML = '<p class="hint">None in this folder. Use !save or save above.</p>';
  } else {
    for (const s of filtered) localListEl.appendChild(renderScriptCard(s, true));
  }

  if (folderFilterEl) {
    const folders = [...new Set(local.map((s) => s.folder || "default"))];
    const prev = folderFilterEl.value;
    folderFilterEl.innerHTML = '<option value="">All folders</option>' + folders.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
    folderFilterEl.value = prev;
  }

  renderFeed(data.feed);
  if (typeof initScrollReveals === "function") {
    initScrollReveals(localListEl);
    initScrollReveals(globalListEl);
    initScrollReveals(feedListEl);
  }
}

async function loadPage() {
  pageData = await getScripts();
  renderLists(pageData);
}

saveBtn.addEventListener("click", async () => {
  hideError(errorEl);
  try {
    const tags = (tagsInput?.value || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await saveScript(nameInput.value.trim(), contentInput.value, {
      folder: folderInput?.value.trim() || "default",
      tags,
    });
    showSuccess(successEl, "Script saved.");
    nameInput.value = "";
    contentInput.value = "";
    if (tagsInput) tagsInput.value = "";
    await loadPage();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

if (folderFilterEl) {
  folderFilterEl.addEventListener("change", () => renderLists(pageData));
}

async function runScript(slug) {
  hideError(errorEl);
  try {
    await runScriptApi(slug);
    showSuccess(successEl, `Ran ${slug} — check Chat (free, no limit used).`);
  } catch (err) {
    showError(errorEl, err.message);
  }
}

async function publishScript(slug) {
  hideError(errorEl);
  try {
    await publishScriptApi(slug);
    showSuccess(successEl, "Published globally.");
    await loadPage();
  } catch (err) {
    showError(errorEl, err.message);
  }
}

async function deleteScript(slug) {
  if (!confirm("Delete this local script?")) return;
  hideError(errorEl);
  try {
    await deleteScriptApi(slug);
    await loadPage();
  } catch (err) {
    showError(errorEl, err.message);
  }
}

initTheme("dark");
loadPage().catch((err) => showError(errorEl, err.message));
