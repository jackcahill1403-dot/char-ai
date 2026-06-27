const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const QUEUE_FILE = path.join(DATA_DIR, "feed-queue.json");
const CONFIG_FILE = path.join(DATA_DIR, "feed-config.json");

const DEFAULT_CONFIG = { running: false, intervalSec: 30, lastRunAt: null };
const MAX_QUEUE = 100;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readQueue() {
  ensureDataDir();
  if (!fs.existsSync(QUEUE_FILE)) {
    writeQueue([]);
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  ensureDataDir();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2), "utf8");
}

function readConfig() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    writeConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return {
      running: Boolean(data.running),
      intervalSec: Number.isFinite(data.intervalSec) && data.intervalSec >= 5
        ? data.intervalSec
        : 30,
      lastRunAt: data.lastRunAt || null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(cfg) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

function enqueue(entry) {
  const items = readQueue();
  if (items.length >= MAX_QUEUE) items.shift();
  items.push({ ...entry, queuedAt: new Date().toISOString() });
  writeQueue(items);
  return items;
}

function dequeue() {
  const items = readQueue();
  const [next, ...rest] = items;
  writeQueue(rest);
  return { next, remaining: rest };
}

function clearQueue() {
  writeQueue([]);
  return [];
}

class AutoFeeder {
  constructor({ upsertEntry, readMemoryStore, writeMemoryStore, isUsefulFact }) {
    this.upsertEntry = upsertEntry;
    this.readMemoryStore = readMemoryStore;
    this.writeMemoryStore = writeMemoryStore;
    this.isUsefulFact = isUsefulFact;
    this.timer = null;
  }

  start(intervalSec) {
    this.stop();
    const cfg = readConfig();
    if (Number.isFinite(intervalSec) && intervalSec >= 5) {
      cfg.intervalSec = intervalSec;
    }
    cfg.running = true;
    writeConfig(cfg);
    this.timer = setInterval(() => this.tick(), cfg.intervalSec * 1000);
    if (this.timer.unref) this.timer.unref();
    return cfg;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const cfg = readConfig();
    cfg.running = false;
    writeConfig(cfg);
    return cfg;
  }

  restore() {
    const cfg = readConfig();
    if (cfg.running) {
      this.timer = setInterval(() => this.tick(), cfg.intervalSec * 1000);
      if (this.timer.unref) this.timer.unref();
    }
    return cfg;
  }

  tick() {
    try {
      const { next, remaining } = dequeue();
      if (!next) {
        return { ingested: false, reason: "queue empty" };
      }

      if (!this.isUsefulFact(next.fact)) {
        return { ingested: false, reason: "useless", entry: next };
      }

      const memory = this.readMemoryStore();
      const entry = this.upsertEntry(memory.entries, {
        fact: next.fact,
        category: next.category,
        confidence: next.confidence ?? 0.85,
        source_message: next.source_message || next.fact,
      });
      this.writeMemoryStore(memory);

      const cfg = readConfig();
      cfg.lastRunAt = new Date().toISOString();
      writeConfig(cfg);

      return { ingested: true, entry, remaining };
    } catch (err) {
      return { ingested: false, reason: "error", error: err.message };
    }
  }

  status() {
    const cfg = readConfig();
    const queue = readQueue();
    return { ...cfg, queue };
  }
}

module.exports = {
  AutoFeeder,
  enqueue,
  readQueue,
  clearQueue,
  readConfig,
  writeConfig,
};
