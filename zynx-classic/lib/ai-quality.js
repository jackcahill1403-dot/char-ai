const CODE_HINT =
  /\b(code|function|implement|fix|bug|refactor|api|endpoint|component|script|test)\b/i;

const FILLER_RE =
  /^(sure|ok|okay|got it|noted|understood|certainly|of course|happy to help|absolutely|great question)[.!?\s]*$/i;
const COMPLEX_TASKS = new Set(["coding", "planning", "review", "dev-team", "long-task"]);

function fenceCount(text) {
  return (String(text).match(/```/g) || []).length;
}

function looksIncompleteCode(text) {
  const s = String(text);
  return fenceCount(s) % 2 !== 0;
}

function looksBrokenReply(text) {
  const s = String(text).trim();
  if (!s) return true;
  return looksIncompleteCode(s);
}

function looksLowQuality(text, taskType) {
  const s = String(text).trim();
  if (!s) return true;
  if (FILLER_RE.test(s)) return true;
  if (COMPLEX_TASKS.has(taskType) && s.length < 80) return true;
  return false;
}

function cavemanPreserveCode(text) {
  const { toCaveman } = require("./responder");
  const s = String(text);
  const parts = s.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => (i % 2 === 1 ? part : toCaveman(part))).join("");
}

function cacheEligible(text) {
  const lower = String(text).toLowerCase();
  if (CODE_HINT.test(lower)) return false;
  if (/```/.test(text)) return false;
  if (/\b(implement|write|build|create|fix|refactor)\b/.test(lower)) return false;
  return true;
}

function tokenBudget(taskType) {
  switch (taskType) {
    case "coding":
    case "dev-team":
      return 6144;
    case "continue":
      return 4096;
    case "planning":
      return 3500;
    case "review":
      return 3000;
    default:
      return 2500;
  }
}

module.exports = {
  looksIncompleteCode,
  looksBrokenReply,
  looksLowQuality,
  cavemanPreserveCode,
  cacheEligible,
  tokenBudget,
};
