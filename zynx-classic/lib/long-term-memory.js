const fs = require("fs");
const { userDir, ensureUserDir, sanitizeUserId } = require("./users");

const MAX_FACTS = 40;

function factsFile(userId) {
  return `${userDir(sanitizeUserId(userId))}/facts.json`;
}

function readFacts(userId) {
  const file = factsFile(userId);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(data.facts) ? data.facts : [];
  } catch {
    return [];
  }
}

function writeFacts(userId, facts) {
  ensureUserDir(sanitizeUserId(userId));
  fs.writeFileSync(
    factsFile(userId),
    JSON.stringify({ facts: facts.slice(0, MAX_FACTS) }, null, 2),
    "utf8"
  );
}

function upsertFact(facts, value, category = "note") {
  const cleaned = String(value).trim().slice(0, 200);
  if (!cleaned) return facts;
  const lower = cleaned.toLowerCase();
  if (facts.some((f) => f.value.toLowerCase() === lower)) return facts;
  return [
    { value: cleaned, category, learnedAt: new Date().toISOString() },
    ...facts,
  ].slice(0, MAX_FACTS);
}

function extractFactsFromMessage(text) {
  const found = [];
  const patterns = [
    /(?:remember|note|fyi)[:\s]+(.+)/i,
    /(?:i prefer|i like|i use|i want|my name is|call me|i'm building|i am building|my project is)\s+(.+)/i,
    /(?:always|never)\s+(.+)/i,
    /(?:the plan is|goal is|we decided)\s+(.+)/i,
  ];
  for (const re of patterns) {
    const m = String(text).match(re);
    if (m?.[1]) found.push(m[1].trim().slice(0, 200));
  }
  return found;
}

function learnFromUserMessage(userId, text) {
  const extracted = extractFactsFromMessage(text);
  if (!extracted.length) return readFacts(userId);
  let facts = readFacts(userId);
  for (const v of extracted) facts = upsertFact(facts, v, "auto");
  writeFacts(userId, facts);
  return facts;
}

function addFact(userId, value, category = "user") {
  const facts = upsertFact(readFacts(userId), value, category);
  writeFacts(userId, facts);
  return facts;
}

function factsContextBlock(userId) {
  const facts = readFacts(userId);
  if (!facts.length) return "";
  const lines = facts.slice(0, 25).map((f) => `- ${f.value}`);
  return `\n\n--- Long-term memory ---\n${lines.join("\n")}\n--- end memory ---`;
}

module.exports = {
  readFacts,
  writeFacts,
  learnFromUserMessage,
  addFact,
  extractFactsFromMessage,
  factsContextBlock,
};
