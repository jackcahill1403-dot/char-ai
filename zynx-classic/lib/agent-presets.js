const fs = require("fs");
const path = require("path");

const PRESETS_FILE = path.join(__dirname, "..", "data", "agent-presets.json");

function loadPresets() {
  if (!fs.existsSync(PRESETS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(PRESETS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function getPreset(id) {
  return loadPresets().find((p) => p.id === id) || null;
}

module.exports = { loadPresets, getPreset };
