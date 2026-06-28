const fs = require("fs");
const path = require("path");

const ROOT_ENV = path.join(__dirname, "..", "..", ".env");
const LOCAL_ENV = path.join(__dirname, "..", ".env");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function loadEnv() {
  parseEnvFile(ROOT_ENV);
  parseEnvFile(LOCAL_ENV);
  if (!process.env.GLM_API_KEY && process.env.HF_TOKEN) {
    process.env.GLM_API_KEY = process.env.HF_TOKEN;
  }
  if (!process.env.HF_TOKEN && process.env.GLM_API_KEY) {
    process.env.HF_TOKEN = process.env.GLM_API_KEY;
  }
}

function get(key, fallback = "") {
  return process.env[key] !== undefined ? process.env[key] : fallback;
}

module.exports = { loadEnv, get };
