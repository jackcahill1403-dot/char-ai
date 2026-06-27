const grid = document.getElementById("char-grid");
const mostUsedGrid = document.getElementById("most-used-grid");
const recommendedGrid = document.getElementById("recommended-grid");
const searchGrid = document.getElementById("search-grid");
const recommendedSection = document.getElementById("recommended-section");
const mostUsedSection = document.getElementById("most-used-section");
const searchSection = document.getElementById("search-results-section");
const recommendedReason = document.getElementById("recommended-reason");
const searchInput = document.getElementById("search-input");
const filterChipsEl = document.getElementById("filter-chips");
const newBtn = document.getElementById("new-char-btn");
const modal = document.getElementById("editor-modal");
const form = document.getElementById("char-form");
const cancelBtn = document.getElementById("editor-cancel");
const errorEl = document.getElementById("error");
const successEl = document.getElementById("success");
const editorTitle = document.getElementById("editor-title");

let editingId = null;
let allCharacters = [];
let mostUsed = [];
let activeTag = null;
let pendingImage = null;

function showSuccess(msg) {
  successEl.textContent = msg;
  successEl.classList.add("visible");
  setTimeout(() => successEl.classList.remove("visible"), 2200);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function avatarHtml(c) {
  const fallback = escapeHtml(c.avatar || "🧑");
  if (c.image) {
    const src = escapeAttr(c.image);
    const alt = escapeAttr(c.name || "");
    return `<img class="char-avatar-img" src="${src}" alt="${alt}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block'"/><span class="char-avatar-emoji" style="display:none">${fallback}</span>`;
  }
  return `<span class="char-avatar-emoji">${fallback}</span>`;
}

function characterCard(c, usageCount) {
  const card = document.createElement("a");
  card.className = "char-card";
  card.href = `/character-chat.html?id=${encodeURIComponent(c.id)}`;
  const usageBadge = usageCount
    ? `<span class="char-usage-badge" title="Times used">${usageCount}💬</span>`
    : "";
  card.innerHTML = `
    <div class="char-avatar">${avatarHtml(c)}</div>
    <div class="char-info">
      <h3 class="char-name">${escapeHtml(c.name)}</h3>
      <p class="char-tagline">${escapeHtml(c.tagline || "")}</p>
      <div class="char-tags">${(c.tags || []).map((t) => `<span class="char-tag">${escapeHtml(t)}</span>`).join("")}</div>
    </div>
    ${usageBadge}
  `;
  return card;
}

function renderInto(targetGrid, characters, withUsage = false) {
  targetGrid.innerHTML = "";
  if (!characters.length) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "Nothing here yet.";
    targetGrid.appendChild(p);
    return;
  }
  for (const c of characters) {
    targetGrid.appendChild(characterCard(c, withUsage ? c.usageCount : 0));
  }
}

function renderAll(all, recData) {
  allCharacters = all;
  mostUsed = recData.mostUsed || [];

  renderFilterChips(all);
  renderFilteredGrid();

  if (recData.recommended && recData.recommended.length) {
    renderInto(recommendedGrid, recData.recommended);
    const topTags = Object.entries(recData.affinity || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    if (topTags.length) {
      recommendedReason.textContent = `You tend to like: ${topTags.join(", ")}.`;
    } else {
      recommendedReason.textContent = "";
    }
    recommendedSection.style.display = "";
  } else {
    recommendedSection.style.display = "none";
  }

  if (mostUsed.length) {
    renderInto(mostUsedGrid, mostUsed, true);
    mostUsedSection.style.display = "";
  } else {
    mostUsedSection.style.display = "none";
  }
}

function renderFilterChips(characters) {
  const tagCounts = {};
  for (const c of characters) {
    for (const t of c.tags || []) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  const tags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  filterChipsEl.innerHTML = "";
  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "chip" + (activeTag === null ? " active" : "");
  allChip.textContent = "all";
  allChip.addEventListener("click", () => setActiveTag(null));
  filterChipsEl.appendChild(allChip);

  for (const t of tags) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (activeTag === t ? " active" : "");
    chip.textContent = t;
    chip.addEventListener("click", () => setActiveTag(t));
    filterChipsEl.appendChild(chip);
  }
}

function setActiveTag(tag) {
  activeTag = tag;
  renderFilterChips(allCharacters);
  renderFilteredGrid();
}

function renderFilteredGrid() {
  const filtered = activeTag
    ? allCharacters.filter((c) => (c.tags || []).includes(activeTag))
    : allCharacters;
  renderInto(grid, filtered);
}

async function loadCharacters() {
  try {
    hideError(errorEl);
    const [listRes, recRes] = await Promise.all([
      listCharacters(),
      getRecommendations(),
    ]);
    renderAll(listRes.characters || [], recRes);
  } catch (err) {
    showError(errorEl, err.message);
  }
}

function searchMostUsed(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    searchSection.style.display = "none";
    return;
  }
  const matches = mostUsed.filter((c) => {
    const inName = (c.name || "").toLowerCase().includes(q);
    const inTagline = (c.tagline || "").toLowerCase().includes(q);
    const inTags = (c.tags || []).some((t) => t.toLowerCase().includes(q));
    return inName || inTagline || inTags;
  });
  renderInto(searchGrid, matches, true);
  searchSection.style.display = "";
  const heading = searchSection.querySelector(".section-title");
  if (matches.length === 0) {
    searchGrid.innerHTML = `<p class="empty-state">No matches in your most-used characters. Try the full list below.</p>`;
  }
}

let searchTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchMostUsed(searchInput.value), 120);
});

function openEditor(character = null) {
  editingId = character ? character.id : null;
  pendingImage = null;
  editorTitle.textContent = character ? `Edit ${character.name}` : "New character";
  form.elements["char-name"].value = character?.name || "";
  form.elements["char-avatar"].value = character?.avatar || "🧑";
  form.elements["char-tagline"].value = character?.tagline || "";
  form.elements["char-description"].value = character?.description || "";
  form.elements["char-scenario"].value = character?.scenario || "";
  form.elements["char-greeting"].value = character?.greeting || "";
  form.elements["char-tags"].value = (character?.tags || []).join(", ");
  form.elements["char-image"].value = "";
  renderImagePreview(character?.image || null);
  modal.style.display = "flex";
}

function renderImagePreview(imageSrc) {
  const previewEl = document.getElementById("char-image-preview");
  const clearBtn = document.getElementById("char-image-clear");
  previewEl.innerHTML = "";
  if (imageSrc) {
    const img = document.createElement("img");
    img.src = imageSrc;
    img.alt = "Profile picture preview";
    previewEl.appendChild(img);
    clearBtn.style.display = "";
  } else {
    clearBtn.style.display = "none";
  }
}

// Downscale uploaded image to a capped square data URL so we don't bloat JSON.
function processImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 8 * 1024 * 1024) {
      return reject(new Error("Image too large (max 8MB)."));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image file."));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(size / img.width, size / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        ctx.drawImage(img, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);
        try {
          const dataUrl = canvas.toDataURL("image/png");
          resolve(dataUrl);
        } catch (err) {
          reject(new Error("Could not process image."));
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const imageInput = document.getElementById("char-image");
imageInput.addEventListener("change", async () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;
  try {
    hideError(errorEl);
    const dataUrl = await processImageFile(file);
    pendingImage = dataUrl;
    renderImagePreview(dataUrl);
  } catch (err) {
    showError(errorEl, err.message);
    imageInput.value = "";
  }
});

document.getElementById("char-image-clear").addEventListener("click", () => {
  pendingImage = null;
  form.elements["char-image"].value = "";
  renderImagePreview(null);
});

function closeEditor() {
  modal.style.display = "none";
  editingId = null;
  pendingImage = null;
}

newBtn.addEventListener("click", () => openEditor());
cancelBtn.addEventListener("click", closeEditor);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeEditor();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError(errorEl);
  const tags = form.elements["char-tags"].value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const payload = {
    id: editingId || undefined,
    name: form.elements["char-name"].value.trim(),
    avatar: form.elements["char-avatar"].value.trim() || "🧑",
    tagline: form.elements["char-tagline"].value.trim(),
    description: form.elements["char-description"].value.trim(),
    scenario: form.elements["char-scenario"].value.trim(),
    greeting: form.elements["char-greeting"].value.trim(),
    tags,
  };
  // Image handling: pending upload > keep existing > cleared.
  if (pendingImage !== null) {
    payload.image = pendingImage;
  } else if (editingId) {
    const existing = allCharacters.find((c) => c.id === editingId);
    const clearBtn = document.getElementById("char-image-clear");
    if (clearBtn.style.display === "none") {
      payload.image = "";
    } else if (existing && existing.image) {
      payload.image = existing.image;
    }
  }

  try {
    await createCharacter(payload);
    showSuccess(editingId ? "Character updated." : "Character created.");
    closeEditor();
    loadCharacters();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

loadCharacters();
