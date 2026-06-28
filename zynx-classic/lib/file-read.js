const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MAX_BYTES = 48000;

function resolveSafePath(relative) {
  const cleaned = String(relative || "")
    .trim()
    .replace(/^[/\\]+/, "")
    .replace(/\.\./g, "");
  const full = path.resolve(ROOT, cleaned);
  if (!full.startsWith(ROOT)) {
    throw new Error("Path must stay inside the project.");
  }
  return full;
}

function readProjectFile(relative) {
  const full = resolveSafePath(relative);
  if (!fs.existsSync(full)) throw new Error(`File not found: ${relative}`);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) throw new Error("Path is a directory, not a file.");
  const buf = fs.readFileSync(full);
  if (buf.length > MAX_BYTES) {
    return {
      path: relative,
      truncated: true,
      content: buf.slice(0, MAX_BYTES).toString("utf8") + "\n\n… (truncated)",
    };
  }
  return { path: relative, truncated: false, content: buf.toString("utf8") };
}

module.exports = { readProjectFile, resolveSafePath, PROJECT_ROOT: ROOT };
