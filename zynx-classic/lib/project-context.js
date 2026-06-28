const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MAX_CHARS = 4000;

function readProjectContext() {
  const file = path.join(ROOT, "PROJECT.md");
  if (!fs.existsSync(file)) return "";
  try {
    return fs.readFileSync(file, "utf8").trim().slice(0, MAX_CHARS);
  } catch {
    return "";
  }
}

function projectContextBlock() {
  const text = readProjectContext();
  if (!text) return "";
  return `\n\n--- Project context (PROJECT.md) ---\n${text}\n--- end project context ---`;
}

module.exports = { readProjectContext, projectContextBlock, PROJECT_FILE: path.join(ROOT, "PROJECT.md") };
