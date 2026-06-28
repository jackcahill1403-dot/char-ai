let usageState = null;
let usagePools = [];
let usageFetchedAt = 0;
let usageTickTimer = null;

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

function ensureUsageTimerEl(bar) {
  let timer = document.getElementById("global-usage-bar-timer");
  if (!timer && bar) {
    timer = document.createElement("span");
    timer.id = "global-usage-bar-timer";
    timer.className = "usage-bar-timer";
    bar.appendChild(timer);
  }
  return timer;
}

function resetLabel(rateLimit, secondsLeft) {
  if (!secondsLeft) return "Full quota";
  if (rateLimit.limited) {
    return rateLimit.resetKind === "day" ? "Day reset in" : "Hour reset in";
  }
  return "Fresh 20 in";
}

function poolTitle(pools) {
  if (!pools?.length) return "";
  return pools
    .map((p) => `${p.label}: ${p.hourCount}/${p.perHour} hr · ${p.dayCount}/${p.perDay} day`)
    .join("\n");
}

function renderGlobalUsage(rateLimit, modelPools) {
  const bar = document.getElementById("global-usage-bar");
  const fill = document.getElementById("global-usage-bar-fill");
  const text = document.getElementById("global-usage-bar-text");
  const label = document.querySelector(".usage-bar-label");
  const timer = ensureUsageTimerEl(bar);
  if (!bar || !rateLimit) return;

  usageState = rateLimit;
  usagePools = modelPools || rateLimit.pools || [];
  usageFetchedAt = Date.now();

  bar.hidden = false;
  if (label) label.textContent = rateLimit.devTeam ? "Team pools" : "Model limit";

  const hourPct = Math.min(100, (rateLimit.hourCount / rateLimit.perHour) * 100);
  const dayPct = Math.min(100, (rateLimit.dayCount / rateLimit.perDay) * 100);
  const pct = Math.max(hourPct, dayPct);

  if (fill) {
    fill.style.width = `${pct}%`;
    fill.classList.toggle("limited", rateLimit.limited);
  }
  if (text) {
    text.classList.toggle("limited", rateLimit.limited);
    const name = rateLimit.devTeam ? `${rateLimit.modelIds?.length || usagePools.length} models` : rateLimit.label || "model";
    text.textContent = `${name} · ${rateLimit.hourCount}/${rateLimit.perHour} hr · ${rateLimit.dayCount}/${rateLimit.perDay} day`;
    text.title = poolTitle(usagePools.length ? usagePools : modelPools);
  }

  paintUsageTimer(timer);
  startUsageTick();
}

function secondsLeftNow() {
  if (!usageState) return 0;
  const elapsed = (Date.now() - usageFetchedAt) / 1000;
  return Math.max(0, (usageState.resetsInSeconds || 0) - elapsed);
}

function paintUsageTimer(timer) {
  if (!timer || !usageState) return;
  const left = secondsLeftNow();
  timer.classList.toggle("limited", usageState.limited);
  if (!left && !usageState.hourCount && !usageState.dayCount) {
    timer.textContent = "Full quota";
    return;
  }
  if (!left) {
    timer.textContent = "Refreshing…";
    return;
  }
  timer.textContent = `${resetLabel(usageState, left)} ${formatCountdown(left)}`;
}

function startUsageTick() {
  if (usageTickTimer) clearInterval(usageTickTimer);
  usageTickTimer = setInterval(() => {
    const timer = document.getElementById("global-usage-bar-timer");
    if (!usageState || !timer) return;
    paintUsageTimer(timer);
    const left = secondsLeftNow();
    if (left <= 0 && (usageState.hourCount > 0 || usageState.dayCount > 0 || usageState.limited)) {
      refreshGlobalUsage();
    }
  }, 1000);
}

async function refreshGlobalUsage() {
  try {
    const usage = await getUsage();
    renderGlobalUsage(usage.rateLimit, usage.modelPools);
    if (usage.theme && typeof initTheme === "function") {
      initTheme(usage.theme);
    }
  } catch {
    /* ignore */
  }
}

window.refreshGlobalUsage = refreshGlobalUsage;
document.addEventListener("DOMContentLoaded", refreshGlobalUsage);
