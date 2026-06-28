const { listModels } = require("./models");
const { sanitizeUserId } = require("./users");

// Per-user, per-model — full reset on the clock (server local time).
const MODEL_PER_HOUR = 20;
const MODEL_PER_DAY = 50;

const hits = new Map();

function clockHourBucket() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  return `${y}-${mo}-${da}T${h}`;
}

function clockDayBucket() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function hourKey(userId, modelId) {
  return `user:${sanitizeUserId(userId)}:model:${modelId}:h:${clockHourBucket()}`;
}

function dayKey(userId, modelId) {
  return `user:${sanitizeUserId(userId)}:model:${modelId}:d:${clockDayBucket()}`;
}

function getCount(key) {
  return hits.get(key) || 0;
}

function secondsUntilNextClockHour() {
  const now = Date.now();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return Math.max(1, Math.ceil((next - now) / 1000));
}

function secondsUntilNextClockDay() {
  const now = Date.now();
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return Math.max(1, Math.ceil((next - now) / 1000));
}

setInterval(() => {
  const hour = clockHourBucket();
  const day = clockDayBucket();
  for (const key of hits.keys()) {
    if (key.includes(":h:") && !key.endsWith(`:h:${hour}`)) hits.delete(key);
    if (key.includes(":d:") && !key.endsWith(`:d:${day}`)) hits.delete(key);
  }
}, 10 * 60 * 1000).unref();

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.ceil(seconds / 3600)} h`;
}

function modelLabel(modelId) {
  const m = listModels().find((x) => x.id === modelId);
  return m?.label?.replace(/\s*\(HF\)\s*$/, "") || modelId;
}

function buildPoolStatus(userId, modelId) {
  const hourCount = getCount(hourKey(userId, modelId));
  const dayCount = getCount(dayKey(userId, modelId));
  const hourRemaining = Math.max(0, MODEL_PER_HOUR - hourCount);
  const dayRemaining = Math.max(0, MODEL_PER_DAY - dayCount);
  const limited = hourCount >= MODEL_PER_HOUR || dayCount >= MODEL_PER_DAY;
  const hourResetSeconds = secondsUntilNextClockHour();
  const dayResetSeconds = secondsUntilNextClockDay();
  const hitDayCap = dayCount >= MODEL_PER_DAY;
  const hitHourCap = hourCount >= MODEL_PER_HOUR;
  const retryAfterSeconds = limited ? (hitDayCap ? dayResetSeconds : hourResetSeconds) : 0;
  const resetsInSeconds = limited ? retryAfterSeconds : hourResetSeconds;
  const resetKind = limited ? (hitDayCap ? "day" : "hour") : "hour";

  return {
    modelId,
    label: modelLabel(modelId),
    perModel: true,
    perUser: true,
    clockReset: true,
    enabled: true,
    perHour: MODEL_PER_HOUR,
    perDay: MODEL_PER_DAY,
    hourCount,
    dayCount,
    hourRemaining,
    dayRemaining,
    limited,
    hourResetSeconds,
    dayResetSeconds,
    retryAfterSeconds,
    resetsInSeconds,
    resetKind,
  };
}

function allModelPools(userId = "default") {
  return listModels().map((m) => buildPoolStatus(userId, m.id));
}

function statusForModels(userId, modelIds, { devTeam = false } = {}) {
  const ids = [...new Set((modelIds || []).filter(Boolean))];
  if (!ids.length) return buildPoolStatus(userId, listModels()[0]?.id || "or-kimi");

  const pools = ids.map((id) => buildPoolStatus(userId, id));
  if (pools.length === 1) {
    return { ...pools[0], devTeam: false, modelIds: ids, pools };
  }

  const limited = pools.filter((p) => p.limited);
  const worst = limited[0] || pools.reduce((a, b) => (a.hourRemaining < b.hourRemaining ? a : b));
  const totalHour = pools.reduce((s, p) => s + p.hourCount, 0);
  const totalDay = pools.reduce((s, p) => s + p.dayCount, 0);

  return {
    ...worst,
    devTeam: devTeam || ids.length > 1,
    modelIds: ids,
    pools,
    label: devTeam || ids.length > 1 ? `Dev team (${ids.length} models)` : worst.label,
    hourCount: worst.hourCount,
    dayCount: worst.dayCount,
    hourRemaining: Math.min(...pools.map((p) => p.hourRemaining)),
    dayRemaining: Math.min(...pools.map((p) => p.dayRemaining)),
    limited: limited.length > 0,
    limitedModels: limited.map((p) => p.label),
    totalHourUsed: totalHour,
    totalDayUsed: totalDay,
  };
}

function status(userId, modelId) {
  if (modelId) return buildPoolStatus(userId, modelId);
  return buildPoolStatus(userId, "or-kimi");
}

function recordModels(userId, modelIds) {
  for (const id of new Set(modelIds)) {
    const hk = hourKey(userId, id);
    const dk = dayKey(userId, id);
    hits.set(hk, getCount(hk) + 1);
    hits.set(dk, getCount(dk) + 1);
  }
}

function checkCavemanLimit(userId, modelIds, { devTeam = false } = {}) {
  const ids = [...new Set((modelIds || []).filter(Boolean))];
  if (!ids.length) {
    return { ok: false, error: "No model selected.", rateLimit: status(userId) };
  }

  const pools = ids.map((id) => buildPoolStatus(userId, id));
  const blocked = pools.filter((p) => p.limited);

  if (devTeam) {
    if (blocked.length < ids.length) {
      return {
        ok: true,
        rateLimit: statusForModels(userId, ids, { devTeam: true }),
        skippedLimited: blocked.map((p) => p.modelId),
      };
    }
  } else if (!blocked.length) {
    return {
      ok: true,
      rateLimit: statusForModels(userId, ids, { devTeam }),
    };
  } else {
    const { pickAvailableModel } = require("./model-availability");
    const fallback = pickAvailableModel(userId, ids[0]);
    if (fallback) {
      return {
        ok: true,
        rateLimit: statusForModels(userId, [fallback], { devTeam }),
        routedFrom: ids[0],
        routedTo: fallback,
      };
    }
  }

  const first = blocked[0] || pools[0];
  const names = blocked.map((p) => p.label).join(", ");
  const when = first.resetKind === "day" ? "midnight" : "top of the hour";
  return {
    ok: false,
    error: devTeam
      ? `Dev team blocked — every agent model is out of quota (${names}). Resets at ${when} in ${formatDuration(first.retryAfterSeconds)}. Use !agents off and pick another model, or wait for reset.`
      : `Your limit hit — ${names} (${first.hourCount}/${MODEL_PER_HOUR} hr · ${first.dayCount}/${MODEL_PER_DAY} day). Resets at ${when} in ${formatDuration(first.retryAfterSeconds)}. Pick another model in the header.`,
    rateLimit: statusForModels(userId, ids, { devTeam }),
    retryAfterSeconds: first.retryAfterSeconds,
    limitedModels: blocked.map((p) => p.modelId),
  };
}

module.exports = {
  status,
  buildPoolStatus,
  allModelPools,
  statusForModels,
  checkCavemanLimit,
  recordModels,
  formatDuration,
  clockHourBucket,
  clockDayBucket,
  secondsUntilNextClockHour,
  secondsUntilNextClockDay,
  MODEL_PER_HOUR,
  MODEL_PER_DAY,
};
