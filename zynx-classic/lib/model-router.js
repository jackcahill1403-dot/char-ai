const CODE_RE =
  /\b(code|function|class|implement|fix|bug|refactor|api|endpoint|component|css|html|script|npm|node|python|typescript|javascript|react|express|sql|database|test|debug)\b/i;
const PLAN_RE =
  /\b(plan|design|architect|strategy|roadmap|steps|how should|approach|break down|acceptance criteria)\b/i;
const REVIEW_RE = /\b(review|audit|security|vulnerab|owasp|ship|no-ship|verdict)\b/i;
const QUICK_RE = /^(hi|hello|hey|thanks|ok|yes|no|what is|who|when|where)\b/i;

const OR_CANDIDATES = {
  planning: ["or-qwen36", "or-kimi", "or-glm"],
  coding: ["or-kimi-code", "or-glm", "or-qwen36", "or-flash", "or-deepseek-v4"],
  review: ["or-gpt-oss", "or-kimi", "or-flash"],
  quick: ["or-kimi", "or-flash"],
  general: ["or-kimi", "or-kimi-code", "or-glm"],
  "long-task": ["or-kimi-code", "or-glm", "or-qwen36"],
};

function classifyReason(message) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  if (PLAN_RE.test(lower) || /\bplan\b/.test(lower)) return "planning";
  if (CODE_RE.test(lower) || /```/.test(text)) return "coding";
  if (REVIEW_RE.test(lower)) return "review";
  if (QUICK_RE.test(lower) && text.length < 80) return "quick";
  if (text.length > 400) return "long-task";
  return "general";
}

function routeModel(message, { openrouter = true, userId } = {}) {
  const reason = classifyReason(message);

  if (!openrouter) {
    if (reason === "planning") return { modelId: "hf-qwen36", reason };
    if (reason === "coding") return { modelId: "hf-kimi-code", reason };
    return { modelId: "glm", reason };
  }

  const candidates = OR_CANDIDATES[reason] || OR_CANDIDATES.general;
  let best = candidates[0];
  let bestScore = -Infinity;

  const { modelBias } = require("./route-feedback");
  const { listModels } = require("./models");
  const { isModelLimited } = require("./model-availability");
  const configured = new Set(listModels().filter((m) => m.configured).map((m) => m.id));

  for (const id of candidates) {
    if (!configured.has(id)) continue;
    if (userId && isModelLimited(userId, id)) continue;
    let score = candidates.length - candidates.indexOf(id);
    if (userId) score += modelBias(userId, id, reason) * 2;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }

  if (bestScore === -Infinity) {
    for (const id of candidates) {
      if (!configured.has(id)) continue;
      let score = candidates.length - candidates.indexOf(id);
      if (userId) score += modelBias(userId, id, reason) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
  }

  return { modelId: best, reason };
}

module.exports = { routeModel, classifyReason };
