const fs = require("fs");
const { userDir, ensureUserDir, sanitizeUserId } = require("./users");

function feedbackFile(userId) {
  return `${userDir(sanitizeUserId(userId))}/route-feedback.json`;
}

function readFeedback(userId) {
  const file = feedbackFile(userId);
  if (!fs.existsSync(file)) return { scores: {} };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { scores: data.scores && typeof data.scores === "object" ? data.scores : {} };
  } catch {
    return { scores: {} };
  }
}

function writeFeedback(userId, data) {
  ensureUserDir(sanitizeUserId(userId));
  fs.writeFileSync(feedbackFile(userId), JSON.stringify(data, null, 2), "utf8");
}

function feedbackKey(modelId, reason) {
  return `${modelId || "unknown"}|${reason || "general"}`;
}

function recordFeedback(userId, { modelId, reason, vote }) {
  const data = readFeedback(userId);
  const key = feedbackKey(modelId, reason);
  if (!data.scores[key]) data.scores[key] = { up: 0, down: 0, modelId, reason };
  if (vote > 0) data.scores[key].up += 1;
  else if (vote < 0) data.scores[key].down += 1;
  data.scores[key].lastAt = new Date().toISOString();
  writeFeedback(userId, data);
  return data.scores[key];
}

function modelBias(userId, modelId, reason) {
  const { scores } = readFeedback(userId);
  let bias = 0;
  for (const row of Object.values(scores)) {
    if (row.modelId !== modelId) continue;
    const total = row.up + row.down;
    if (total < 2) continue;
    const ratio = (row.up - row.down) / total;
    const weight = reason && row.reason === reason ? 1.5 : row.reason === "general" ? 0.5 : 0.25;
    bias += ratio * weight;
  }
  return Math.max(-2, Math.min(2, bias));
}

function feedbackSummary(userId) {
  const { scores } = readFeedback(userId);
  return Object.entries(scores)
    .map(([key, row]) => ({
      key,
      ...row,
      score: row.up - row.down,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

module.exports = { recordFeedback, modelBias, feedbackSummary, readFeedback };
