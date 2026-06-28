const { toCaveman } = require("./responder");

function applyCavemanDict(text, dict = {}) {
  if (!text || !dict || typeof dict !== "object") return text;
  let out = text;
  for (const [from, to] of Object.entries(dict)) {
    if (!from || typeof to !== "string") continue;
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi");
    out = out.replace(re, to);
  }
  return out;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const { cavemanPreserveCode } = require("./ai-quality");

function applyCavemanMode(text, mode, dict) {
  if (mode !== "caveman") return text;
  return applyCavemanDict(cavemanPreserveCode(text), dict);
}

module.exports = { applyCavemanDict, applyCavemanMode };
