const fs = require("fs");
const path = require("path");
const {
  readMemoryStore,
  writeMemoryStore,
  upsertEntry,
} = require("../lib/memory-store");

const SEED_FILE = path.join(__dirname, "..", "data", "seed.json");

function loadSeed() {
  const raw = fs.readFileSync(SEED_FILE, "utf8");
  return JSON.parse(raw);
}

function run() {
  const seed = loadSeed();
  const userId = process.argv.includes("--user")
    ? process.argv[process.argv.indexOf("--user") + 1]
    : "default";
  const memory = readMemoryStore(userId);
  const before = memory.entries.length;

  let added = 0;
  let updated = 0;

  for (const item of seed) {
    const fact = String(item.fact || "").trim();
    const category = String(item.category || "").trim().toLowerCase();
    const confidence = Number(item.confidence) || 0.8;

    if (!fact || !category) continue;

    const existed = memory.entries.some(
      (e) => e.category === category && e.fact.toLowerCase() === fact.toLowerCase()
    );

    upsertEntry(memory.entries, {
      fact,
      category,
      confidence,
      source_message: "seed dataset",
    });

    if (existed) updated++;
    else added++;
  }

  writeMemoryStore(userId, memory);

  console.log(`Seed (user=${userId}): ${added} added, ${updated} updated, ${memory.entries.length} total (was ${before}).`);
}

if (require.main === module) {
  run();
}

module.exports = { run, loadSeed };
