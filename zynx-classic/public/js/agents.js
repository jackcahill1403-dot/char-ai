const agentListEl = document.getElementById("agent-list");
const presetListEl = document.getElementById("preset-list");
const agentsEnabledEl = document.getElementById("agents-enabled");
const addAgentBtn = document.getElementById("add-agent-btn");
const saveBtn = document.getElementById("save-btn");
const errorEl = document.getElementById("error");
const successEl = document.getElementById("success");

let agents = [];
let models = [];

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function modelOptions(selected) {
  return models
    .map(
      (m) =>
        `<option value="${escapeHtml(m.id)}" ${m.id === selected ? "selected" : ""}>${escapeHtml(m.label)}</option>`
    )
    .join("");
}

function renderPresets(presets) {
  if (!presetListEl) return;
  presetListEl.innerHTML = "";
  for (const p of presets || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-secondary preset-btn";
    btn.textContent = p.name;
    btn.title = p.description || "";
    btn.addEventListener("click", async () => {
      hideError(errorEl);
      try {
        await applyAgentPreset(p.id);
        showSuccess(successEl, `Loaded preset: ${p.name}`);
        await loadAgentsPage();
      } catch (err) {
        showError(errorEl, err.message);
      }
    });
    presetListEl.appendChild(btn);
  }
  if (typeof initScrollReveals === "function") initScrollReveals(presetListEl);
}

function renderAgents() {
  agentListEl.innerHTML = "";
  agents.forEach((agent, index) => {
    const card = document.createElement("div");
    card.className = "agent-card";
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="agent-card-head">
        <strong>Agent ${index + 1}</strong>
        <div class="agent-card-actions">
          <button type="button" class="btn-icon move-up" title="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn-icon move-down" title="Move down" ${index === agents.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="btn-icon remove-agent" title="Remove">✕</button>
        </div>
      </div>
      <label>Name <input type="text" class="agent-name" maxlength="40" value="${escapeHtml(agent.name)}" /></label>
      <label>Model
        <select class="agent-model">${modelOptions(agent.model)}</select>
      </label>
      <label>Role / instruction
        <textarea class="agent-role" rows="3" maxlength="500">${escapeHtml(agent.role)}</textarea>
      </label>
    `;
    agentListEl.appendChild(card);
  });
  if (typeof initScrollReveals === "function") initScrollReveals(agentListEl);
}

function readAgentsFromDom() {
  return [...agentListEl.querySelectorAll(".agent-card")].map((card, i) => ({
    id: agents[i]?.id || `agent-${Date.now()}-${i}`,
    name: card.querySelector(".agent-name").value.trim() || `Agent ${i + 1}`,
    model: card.querySelector(".agent-model").value,
    role: card.querySelector(".agent-role").value.trim() || "Help the user.",
  }));
}

agentListEl.addEventListener("click", (e) => {
  const card = e.target.closest(".agent-card");
  if (!card) return;
  const index = Number(card.dataset.index);
  agents = readAgentsFromDom();
  if (e.target.classList.contains("remove-agent")) {
    agents.splice(index, 1);
    renderAgents();
    return;
  }
  if (e.target.classList.contains("move-up") && index > 0) {
    [agents[index - 1], agents[index]] = [agents[index], agents[index - 1]];
    renderAgents();
    return;
  }
  if (e.target.classList.contains("move-down") && index < agents.length - 1) {
    [agents[index + 1], agents[index]] = [agents[index], agents[index + 1]];
    renderAgents();
  }
});

addAgentBtn.addEventListener("click", () => {
  agents = readAgentsFromDom();
  agents.push({
    id: `agent-${Date.now()}`,
    name: "New agent",
    model: models[0]?.id || "glm",
    role: "Describe what this agent should do.",
  });
  renderAgents();
});

saveBtn.addEventListener("click", async () => {
  hideError(errorEl);
  try {
    await updateAgents({
      agents: readAgentsFromDom(),
      agentsEnabled: agentsEnabledEl.checked,
    });
    showSuccess(successEl, "Agents saved.");
    await loadAgentsPage();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

async function loadAgentsPage() {
  const data = await getAgents();
  agents = data.agents;
  models = data.models;
  agentsEnabledEl.checked = data.agentsEnabled;
  renderPresets(data.presets);
  renderAgents();
}

initTheme("dark");
loadAgentsPage().catch((err) => showError(errorEl, err.message));
