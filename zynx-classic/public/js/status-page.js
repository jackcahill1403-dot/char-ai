const modelPoolsEl = document.getElementById("model-pools");
const orModelKeysEl = document.getElementById("or-model-keys");
const providerListEl = document.getElementById("provider-list");
const modelGraphEl = document.getElementById("model-graph");
const hfBannerEl = document.getElementById("hf-account-banner");
const orBannerEl = document.getElementById("or-account-banner");
const serverInfoEl = document.getElementById("server-info");
const refreshBtn = document.getElementById("refresh-btn");
const errorEl = document.getElementById("error");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function barClass(row) {
  if (!row.configured) return "no-key";
  if (row.ok) return "ok";
  if (row.sharedStatus && row.reason === "insufficient_balance") return "credits";
  return "fail";
}

function statusLabel(row) {
  if (row.openrouter && !row.configured) return "no OR key";
  if (!row.configured) return "no key";
  if (row.ok) return "ok";
  if (row.sharedStatus && row.reason === "insufficient_balance") return "HF no credits";
  if (row.sharedStatus) return "HF fail";
  if (row.openrouter && row.reason === "rate_limited") return "OR limited";
  return "fail";
}

function renderOrBanner(orAccount) {
  if (!orBannerEl) return;
  if (!orAccount) {
    orBannerEl.hidden = true;
    return;
  }

  orBannerEl.hidden = false;
  const cls = orAccount.ok
    ? "hf-account-banner ok"
    : orAccount.configured
      ? "hf-account-banner warn"
      : "hf-account-banner error";
  orBannerEl.className = cls;

  if (!orAccount.configured) {
    orBannerEl.innerHTML = `
      <strong>OpenRouter — no key</strong>
      <p>Add per-model keys like <code>OPENROUTER_KEY_OR_KIMI=sk-or-…</code> or global <code>OPENROUTER_API_KEYS</code> to <code>.env</code>, then restart. Get keys at <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a>.</p>
      <p>Pick <strong>Kimi K2.6 (OR)</strong>, <strong>GLM 5.2 (OR)</strong>, etc. in Settings — not the HF versions.</p>
    `;
    return;
  }

  if (orAccount.ok) {
    const poolLine = `<p>Each model can use its own OpenRouter key. App limit: <strong>20/hr · 50/day</strong> per model per person.</p>`;
    orBannerEl.innerHTML = `
      <strong>OpenRouter — OK</strong>
      <p>${escapeHtml(orAccount.message)}</p>
      ${poolLine}
    `;
    return;
  }

  const pool = orAccount.keyPool;
  const poolWarn =
    pool?.allExhausted
      ? `<p><strong>All ${pool.total} OpenRouter keys exhausted.</strong> Add credits or more keys in <code>.env</code>, then restart.</p>`
      : pool?.total > 1
        ? `<p>Key pool: ${pool.available}/${pool.total} keys left.</p>`
        : "";

  const detail = orAccount.detail ? `<p class="hf-detail">${escapeHtml(orAccount.detail)}</p>` : "";
  orBannerEl.innerHTML = `
    <strong>OpenRouter — not ready</strong>
    <p>${escapeHtml(orAccount.message)}</p>
    ${poolWarn}
    ${detail}
  `;
}

function renderHfBanner(hfAccount, orAccount) {
  if (!hfBannerEl) return;
  if (orAccount?.configured) {
    hfBannerEl.hidden = true;
    return;
  }
  if (!hfAccount) {
    hfBannerEl.hidden = true;
    return;
  }

  hfBannerEl.hidden = false;
  const cls = hfAccount.ok ? "hf-account-banner ok" : hfAccount.configured ? "hf-account-banner warn" : "hf-account-banner error";
  hfBannerEl.className = cls;

  if (!hfAccount.configured) {
    hfBannerEl.innerHTML = `
      <strong>HF token missing</strong>
      <p>Add <code>HF_TOKEN</code> or <code>GLM_API_KEY</code> to <code>.env</code> and restart.</p>
    `;
    return;
  }

  if (hfAccount.ok) {
    hfBannerEl.innerHTML = `
      <strong>HF Inference Providers — OK</strong>
      <p>${escapeHtml(hfAccount.message)}</p>
    `;
    return;
  }

  const detail = hfAccount.detail ? `<p class="hf-detail">${escapeHtml(hfAccount.detail)}</p>` : "";
  const billing =
    hfAccount.reason === "insufficient_balance"
      ? `<p><strong>HF billing does not reset every hour.</strong> That’s prepaid Hugging Face balance — it stays “no credits” until you top up or wait for a monthly allowance (if you have PRO). Your <em>app limits</em> below (20/hr · 50/day) are separate and reset at :00 / midnight.</p>
         <p><strong>No money?</strong> Add <code>OPENROUTER_API_KEY</code> or <code>GEMINI_API_KEY</code> → Settings → pick OR/Gemini models. Turn off dev team on <a href="/agents.html">Agents</a> if agents still use HF.</p>`
      : "";

  hfBannerEl.innerHTML = `
    <strong>HF Inference Providers — ${hfAccount.reason === "insufficient_balance" ? "credits depleted" : "not ready"}</strong>
    <p>${escapeHtml(hfAccount.message)}</p>
    ${detail}
    ${billing}
  `;
}

function renderModelGraph(models, orAccount) {
  if (!modelGraphEl) return;
  const graphModels = (models || []).filter((m) => m.openrouter);
  if (!graphModels.length) {
    modelGraphEl.innerHTML = '<p class="hint">No OpenRouter models in catalog.</p>';
    return;
  }

  const orMissing = orAccount && !orAccount.configured;
  const maxScore = Math.max(...graphModels.map((m) => m.score || m.catalogScore || 0), 1);
  const okLatencies = graphModels.filter((m) => m.ok && m.latencyMs).map((m) => m.latencyMs);
  const maxLatency = okLatencies.length ? Math.max(...okLatencies) : 1;

  const rows = graphModels
    .map((m) => {
      const baseScore = m.ok ? m.score : m.catalogScore || m.score;
      const width = Math.max(12, Math.round((baseScore / maxScore) * 100));
      const latencyPct = m.ok && m.latencyMs ? Math.round((1 - m.latencyMs / maxLatency) * 100) : 0;
      const metaMsg = m.ok
        ? `${m.latencyMs}ms`
        : !m.configured
          ? "Add OPENROUTER_API_KEY to .env"
          : escapeHtml(m.message || "—");
      return `
        <div class="model-graph-row" style="--bar-width: ${width}%; --latency-width: ${latencyPct}%;">
          <div class="model-graph-head">
            <span class="model-graph-name">${escapeHtml(m.label)}</span>
            <span class="badge ${barClass(m)}">${statusLabel(m)}</span>
          </div>
          <div class="model-graph-track" title="${m.ok ? `Score ${m.score}/100` : `Catalog tier ${m.tier}`}">
            <div class="model-graph-bar ${barClass(m)}"></div>
            ${m.ok ? `<div class="model-graph-latency" title="Latency ${m.latencyMs}ms"></div>` : ""}
          </div>
          <div class="model-graph-meta">
            <span>${metaMsg}</span>
            <span>tier ${m.tier} · ${escapeHtml(m.model || m.id)}</span>
          </div>
        </div>
      `;
    })
    .join("");

  const intro = orMissing
    ? `<p class="hint model-graph-section-hint">Add <code>OPENROUTER_API_KEY</code> to <code>.env</code> — get a key at <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a>.</p>`
    : orAccount?.ok
      ? `<p class="hint model-graph-section-hint">Live probes via OpenRouter — Kimi, GLM, Qwen, GPT-OSS, DeepSeek. Each model: 20/hr · 50/day app limit.</p>`
      : `<p class="hint model-graph-section-hint">OpenRouter key set but account not ready — see banner above.</p>`;

  modelGraphEl.innerHTML = `
    <div class="model-graph-chart">
      ${intro}
      ${rows}
    </div>
    <div class="model-graph-legend">
      <span><i class="legend-swatch ok"></i> Live probe OK</span>
      <span><i class="legend-swatch fail"></i> Probe failed</span>
      <span><i class="legend-swatch no-key"></i> Missing API key</span>
    </div>
  `;

  if (typeof initScrollReveals === "function") initScrollReveals(modelGraphEl);
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  if (s <= 0) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function poolResetHint(pool) {
  if (!pool.limited && pool.hourCount === 0 && pool.dayCount === 0) return "Full quota";
  if (pool.limited && pool.resetKind === "day") {
    return `Day reset in ${formatCountdown(pool.dayResetSeconds)}`;
  }
  if (pool.limited) {
    return `Hour reset in ${formatCountdown(pool.hourResetSeconds)}`;
  }
  if (pool.hourCount > 0) {
    return `Fresh 20 in ${formatCountdown(pool.hourResetSeconds)}`;
  }
  return "Full quota";
}

let statusFetchedAt = 0;
let statusClock = null;
let statusRefreshTimer = null;

function renderModelPools(pools, orAccount, clock) {
  if (!modelPoolsEl) return;

  if (clock) {
    statusClock = clock;
    statusFetchedAt = Date.now();
  }

  const noticeEl = document.getElementById("model-pools-notice");
  if (noticeEl) {
    if (orAccount?.ok) {
      noticeEl.hidden = false;
      noticeEl.className = "model-pools-notice ok";
      noticeEl.innerHTML = `
        <strong>OpenRouter active</strong>
        <p>Each model below is your <strong>app limit</strong> (20/hr · 50/day). Switch models freely — GLM empty ≠ Kimi empty.</p>
      `;
    } else if (!orAccount?.configured) {
      noticeEl.hidden = false;
      noticeEl.className = "model-pools-notice warn";
      noticeEl.innerHTML = `
        <strong>No OpenRouter key yet</strong>
        <p>Add per-model keys (<code>OPENROUTER_KEY_OR_KIMI</code>, etc.) or <code>OPENROUTER_API_KEYS</code> to <code>.env</code>, then restart the server.</p>
      `;
    } else {
      noticeEl.hidden = true;
      noticeEl.innerHTML = "";
    }
  }

  if (!pools?.length) {
    modelPoolsEl.innerHTML = '<p class="hint">No usage yet on your active models.</p>';
    return;
  }

  const clockHint = statusClock
    ? `<p class="hint model-pools-clock">Server hour bucket: <code>${escapeHtml(statusClock.hourBucket)}</code> · hour resets at :00 in ${formatCountdown(Math.max(0, (statusClock.hourResetSeconds || 0) - (Date.now() - statusFetchedAt) / 1000))}</p>`
    : "";

  modelPoolsEl.innerHTML = `${clockHint}${pools
    .map((p) => {
      const hourPct = Math.min(100, (p.hourCount / p.perHour) * 100);
      const dayPct = Math.min(100, (p.dayCount / p.perDay) * 100);
      const pct = Math.max(hourPct, dayPct);
      const limited = p.limited ? " limited" : "";
      return `
        <div class="model-pool-row${limited}">
          <div class="model-pool-head">
            <strong>${escapeHtml(p.label)}</strong>
            <span class="model-pool-count">${p.hourCount}/${p.perHour} hr · ${p.dayCount}/${p.perDay} day</span>
          </div>
          <div class="usage-bar-track model-pool-track">
            <div class="usage-bar-fill${limited}" style="width:${pct}%"></div>
          </div>
          <p class="hint model-pool-reset">${poolResetHint(p)}</p>
        </div>
      `;
    })
    .join("")}`;

  startStatusPoolTick();

  if (typeof initScrollReveals === "function") initScrollReveals(modelPoolsEl);
}

function renderModelKeyPools(pools, orAccount) {
  const section = document.getElementById("or-keys-section");
  if (!orModelKeysEl) return;

  if (!orAccount?.configured) {
    if (section) section.hidden = true;
    return;
  }
  if (section) section.hidden = false;

  const list = pools || orAccount?.modelKeyPools || [];
  if (!list.length) {
    orModelKeysEl.innerHTML = '<p class="hint">No key pools configured.</p>';
    return;
  }

  orModelKeysEl.innerHTML = list
    .map((p) => {
      const name = escapeHtml(p.label || p.modelId || "Model");
      const source =
        p.source === "dedicated"
          ? `<span class="msg-badge">dedicated</span> <code>${escapeHtml(p.envVar || "")}</code>`
          : `<span class="msg-badge">global</span> <code>OPENROUTER_API_KEYS</code>`;
      const keys =
        p.total > 0
          ? `<strong>${p.available}/${p.total}</strong> keys available${p.activeIndex ? ` · using #${p.activeIndex}` : ""}`
          : "no key";
      const warn = p.allExhausted ? ' <span class="msg-badge">exhausted</span>' : "";
      return `
        <div class="model-pool-row${p.allExhausted ? " limited" : ""}">
          <div class="model-pool-head">
            <strong>${name}</strong>
            <span class="model-pool-count">${keys}${warn}</span>
          </div>
          <p class="hint">${source}</p>
        </div>
      `;
    })
    .join("");
}

function startStatusPoolTick() {
  if (statusRefreshTimer) clearInterval(statusRefreshTimer);
  statusRefreshTimer = setInterval(() => {
    if (!statusClock || !modelPoolsEl) return;
    const left = Math.max(0, (statusClock.hourResetSeconds || 0) - (Date.now() - statusFetchedAt) / 1000);
    const clockEl = modelPoolsEl.querySelector(".model-pools-clock");
    if (clockEl) {
      clockEl.innerHTML = `Server hour bucket: <code>${escapeHtml(statusClock.hourBucket)}</code> · hour resets at :00 in ${formatCountdown(left)}`;
    }
    for (const row of modelPoolsEl.querySelectorAll(".model-pool-reset")) {
      /* countdown text refreshed on full reload */
    }
    if (left <= 0) {
      loadStatus().catch(() => {});
    }
  }, 1000);
}

function renderProviderList(models, orAccount) {
  providerListEl.innerHTML = "";
  const list = orAccount?.configured ? (models || []).filter((m) => m.openrouter) : models || [];
  for (const p of list) {
    const row = document.createElement("div");
    row.className = "script-card";
    row.innerHTML = `
      <div class="script-card-head">
        <strong>${escapeHtml(p.label)}</strong>
        <span class="badge ${p.ok ? "ok" : "no"}">${statusLabel(p)}</span>
      </div>
      <p class="hint">${escapeHtml(p.model || p.id)}</p>
      ${p.message ? `<p>${escapeHtml(p.message)}</p>` : ""}
    `;
    providerListEl.appendChild(row);
  }
  if (typeof initScrollReveals === "function") initScrollReveals(providerListEl);
}

async function loadStatus() {
  hideError(errorEl);
  if (modelGraphEl) {
    modelGraphEl.innerHTML = '<p class="hint">Probing OpenRouter models…</p>';
  }
  refreshBtn.disabled = true;

  const data = await getStatus();
  const models = data.modelComparison || data.providers || [];

  renderHfBanner(data.hfAccount, data.openRouterAccount);
  renderOrBanner(data.openRouterAccount);
  renderModelGraph(models, data.openRouterAccount);
  renderModelPools(data.modelPools || [], data.openRouterAccount, data.clock);
  renderModelKeyPools(data.env?.openRouterModelKeyPools, data.openRouterAccount);
  renderProviderList(models, data.openRouterAccount);

  const countEl = document.getElementById("model-graph-count");
  if (countEl) countEl.textContent = String(models.length);

  serverInfoEl.textContent = JSON.stringify(
    {
      app: data.app,
      timestamp: data.timestamp,
      primaryProvider: data.primaryProvider,
      hfAccount: data.hfAccount,
      openRouterAccount: data.openRouterAccount,
      rateLimit: data.rateLimit,
      globalScripts: data.globalScriptCount,
      modelCount: models.length,
      env: data.env,
    },
    null,
    2
  );

  refreshBtn.disabled = false;
}

refreshBtn.addEventListener("click", () => loadStatus().catch((e) => showError(errorEl, e.message)));

initTheme("light");
loadStatus().catch((e) => showError(errorEl, e.message));
