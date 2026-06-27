const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");

const cache = {};

function parseEnv(contents) {
  const out = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnv() {
  if (cache.loaded) return cache.env;
  let env = {};
  if (fs.existsSync(ENV_FILE)) {
    try {
      env = parseEnv(fs.readFileSync(ENV_FILE, "utf8"));
    } catch {
      env = {};
    }
  }
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
  cache.loaded = true;
  cache.env = env;
  return env;
}

function get(key, fallback = "") {
  loadEnv();
  return process.env[key] !== undefined ? process.env[key] : fallback;
}

function isLlmConfigured() {
  return Boolean(get("LLM_API_KEY") || get("HF_TOKEN"));
}

module.exports = { loadEnv, get, isLlmConfigured };
