const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const POOL_FILE = path.join(DATA_DIR, "fact-pool.json");
const TEMPLATES_FILE = path.join(DATA_DIR, "fact-templates.json");

let staticPool = [];
let templateBank = {};

function load() {
  try {
    staticPool = JSON.parse(fs.readFileSync(POOL_FILE, "utf8"));
  } catch {
    staticPool = [];
  }
  try {
    templateBank = JSON.parse(fs.readFileSync(TEMPLATES_FILE, "utf8"));
  } catch {
    templateBank = {};
  }
}

load();

function pick(arr) {
  if (!arr || !arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fillTemplate(template, words) {
  let out = template;
  for (const key of Object.keys(words)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), words[key]);
  }
  return out;
}

function generateFromTemplate() {
  const categories = Object.keys(templateBank);
  if (!categories.length) return null;
  const category = pick(categories);
  const cfg = templateBank[category];
  if (!cfg || !cfg.templates) return null;

  const template = pick(cfg.templates);
  const words = {};
  for (const key of Object.keys(cfg)) {
    if (key === "templates") continue;
    const value = pick(cfg[key]);
    if (!value) continue;
    if (key === "subject" || key === "event" || key === "figure") {
      words[key] = capitalize(value);
    } else {
      words[key] = value;
    }
  }

  const fact = fillTemplate(template, words);
  return fact.replace(/\s+/g, " ").trim();
}

function generateFromStatic() {
  if (!staticPool.length) return null;
  return pick(staticPool);
}

function generateFact() {
  const roll = Math.random();
  if (roll < 0.5) {
    const t = generateFromTemplate();
    if (t && t.length >= 8 && t.length <= 140) return t;
  }
  return generateFromStatic();
}

function poolSize() {
  return { static: staticPool.length, categories: Object.keys(templateBank).length };
}

module.exports = { generateFact, poolSize };
