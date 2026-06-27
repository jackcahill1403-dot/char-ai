const { get } = require("./env");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// userId -> array of request timestamps (sliding window). In-memory only;
// resets on server restart. Good enough for a small app — swap for Redis
// or a DB-backed store before scaling seriously.
const hits = new Map();

// Periodic cleanup of stale entries so the Map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [userId, times] of hits.entries()) {
    const fresh = times.filter((t) => now - t < DAY_MS);
    if (fresh.length) hits.set(userId, fresh);
    else hits.delete(userId);
  }
}, 10 * 60 * 1000).unref();

function getLimits() {
  const perHour = parseInt(get("RATE_LIMIT_PER_HOUR", "20"), 10);
  const perDay = parseInt(get("RATE_LIMIT_PER_DAY", "50"), 10);
  return {
    perHour: Number.isFinite(perHour) && perHour > 0 ? perHour : 20,
    perDay: Number.isFinite(perDay) && perDay > 0 ? perDay : 50,
  };
}

function freshTimestamps(userId) {
  const now = Date.now();
  const times = (hits.get(userId) || []).filter((t) => now - t < DAY_MS);
  return times;
}

function status(userId) {
  const now = Date.now();
  const times = freshTimestamps(userId);
  const { perHour, perDay } = getLimits();
  const hourCount = times.filter((t) => now - t < HOUR_MS).length;
  const dayCount = times.length;
  const hourRemaining = Math.max(0, perHour - hourCount);
  const dayRemaining = Math.max(0, perDay - dayCount);
  const limited = hourCount >= perHour || dayCount >= perDay;
  const retryAfterSeconds = limited ? computeRetryAfter(times, perHour, perDay) : 0;
  return {
    hourCount,
    dayCount,
    perHour,
    perDay,
    hourRemaining,
    dayRemaining,
    limited,
    retryAfterSeconds,
  };
}

function computeRetryAfter(times, perHour, perDay) {
  const now = Date.now();
  if (times.length >= perDay) {
    return Math.max(1, Math.ceil((times[0] + DAY_MS - now) / 1000));
  }
  const hourTimes = times.filter((t) => now - t < HOUR_MS);
  if (hourTimes.length >= perHour) {
    return Math.max(1, Math.ceil((hourTimes[0] + HOUR_MS - now) / 1000));
  }
  return 0;
}

function record(userId) {
  const now = Date.now();
  const times = freshTimestamps(userId);
  times.push(now);
  hits.set(userId, times);
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.ceil(seconds / 3600)} h`;
}

// Express middleware: reject if over limit, otherwise reserve a slot.
function middleware(req, res, next) {
  const s = status(req.userId);
  if (s.limited) {
    res.setHeader("Retry-After", String(s.retryAfterSeconds));
    return res.status(429).json({
      error: `You've reached the message limit (${s.hourCount}/${s.perHour} this hour, ${s.dayCount}/${s.perDay} today). Try again in ${formatDuration(s.retryAfterSeconds)}.`,
      rateLimit: s,
    });
  }
  record(req.userId);
  next();
}

module.exports = {
  middleware,
  status,
  record,
  getLimits,
  formatDuration,
};
