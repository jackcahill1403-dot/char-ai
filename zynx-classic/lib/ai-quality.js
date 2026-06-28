const CODE_HINT =
  /\b(code|function|implement|fix|bug|refactor|api|endpoint|component|script|test)\b/i;

function fenceCount(text) {
  return (String(text).match(/```/g) || []).length;
}

function looksIncompleteCode(text) {
  const s = String(text);
  const fences = fenceCount(s);
  if (fences % 2 !== 0) return true;
  if (/```[\s\S]*$/.test(s) && !s.trimEnd().endsWith("```")) return true;
  if (/\b(function|class|const|let|var|def |import |export )\b[\s\S]{0,200}$/.test(s) && !/[;})\]]\s*$/.test(s.trim())) {
    return true;
  }
  return false;
}

function looksBrokenReply(text) {
  const s = String(text).trim();
  if (!s) return true;
  if (s.length < 20 && looksIncompleteCode(s)) return true;
  return looksIncompleteCode(s);
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
    case "continue":
      return 4096;
    case "planning":
      return 2048;
    case "review":
      return 2048;
    default:
      return 1536;
  }
}

module.exports = {
  looksIncompleteCode,
  looksBrokenReply,
  cavemanPreserveCode,
  cacheEligible,
  tokenBudget,
};
