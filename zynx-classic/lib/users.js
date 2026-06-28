const fs = require("fs");
const path = require("path");

const USERS_DIR = path.join(__dirname, "..", "data", "users");
const LEGACY_FILE = path.join(__dirname, "..", "data", "memory.json");

function sanitizeUserId(userId) {
  const cleaned = String(userId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  return cleaned.slice(0, 40) || "default";
}

function userDir(userId) {
  return path.join(USERS_DIR, sanitizeUserId(userId));
}

function memoryFile(userId) {
  return path.join(userDir(userId), "memory.json");
}

function ensureUserDir(userId) {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function migrateLegacyMemory() {
  ensureUserDir("default");
  const defaultFile = memoryFile("default");
  if (fs.existsSync(LEGACY_FILE) && !fs.existsSync(defaultFile)) {
    fs.copyFileSync(LEGACY_FILE, defaultFile);
  }
}

migrateLegacyMemory();

module.exports = {
  sanitizeUserId,
  userDir,
  memoryFile,
  ensureUserDir,
  migrateLegacyMemory,
  USERS_DIR,
};
