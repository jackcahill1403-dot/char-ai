const { upsertEntry, findSimilar } = require("./memory-store");

const MAX_FACT_LEN = 120;

const USELESS_MESSAGE = [
  /^(hi|hello|hey|yo|howdy|sup|hiya|good\s+(morning|afternoon|evening|night))\b/i,
  /^(lol|lmao|haha|hehe|rofl|ok|okay|k|thanks|thank you|bye|goodbye|cool|nice|wow|great)\s*[!?.]*$/i,
  /just (kidding|joking|messin)/i,
  /^(yes|no|yeah|nope|maybe|idk|dunno)\s*[!?.]*$/i,
  /^(test|testing|asdf|qwerty)\s*[!?.]*$/i,
];

const USELESS_FACT = [
  /^(hi|hello|hey|yo|lol|haha|ok|okay|yes|no|test)$/i,
  /^[\W\d]+$/,
];

const EXTRACTION_RULES = [
  { category: "name", trust: "high", match: /(?:my name is|call me)\s+(.+)/i, fact: (m) => m[1] },
  { category: "name", trust: "high", match: /^i'?m\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)$/i, fact: (m) => m[1] },
  { category: "preference", trust: "high", match: /i (?:really )?(?:like|love|enjoy|prefer)\s+(.+)/i, fact: (m) => `Likes ${m[1]}` },
  { category: "preference", trust: "high", match: /i (?:really )?(?:hate|dislike|don'?t like)\s+(.+)/i, fact: (m) => `Dislikes ${m[1]}` },
  { category: "fact", trust: "high", match: /i work (?:as|at|for)\s+(?:a\s+)?(.+)/i, fact: (m) => `Works at ${m[1]}` },
  { category: "fact", trust: "high", match: /i live in\s+(.+)/i, fact: (m) => `Lives in ${m[1]}` },
  { category: "fact", trust: "high", match: /remember (?:that )?(.+)/i, fact: (m) => m[1] },
  { category: "fact", trust: "high", match: /(?:keep in mind|don'?t forget) (?:that )?(.+)/i, fact: (m) => m[1] },
  { category: "rule", trust: "high", match: /(?:always|never)\s+(.+)/i, fact: (m) => m[0] },
  { category: "rule", trust: "high", match: /rule:\s*(.+)/i, fact: (m) => m[1] },
  { category: "rule", trust: "high", match: /when i say\s+(.+?)\s*,?\s*(?:i mean|mean)\s+(.+)/i, fact: (m) => `"${m[1]}" means ${m[2]}` },
  { category: "correction", trust: "medium", match: /(?:no|nope),?\s*(?:i meant|i meant to say|actually)\s+(.+)/i, fact: (m) => m[1] },
  { category: "correction", trust: "medium", match: /actually,?\s+(?:it'?s|i'?m|my name is|call me)\s+(.+)/i, fact: (m) => m[1] },
  { category: "correction", trust: "medium", match: /don'?t (?:call|say)\s+(?:me|that)\s+(.+?)(?:,|\s*—|\s*-|\s*\.|$)\s*(?:call me|i'?m|my name is)\s+(.+)/i, fact: (m) => `Prefers "${m[2]}" not "${m[1]}"` },
  { category: "correction", trust: "medium", match: /that'?s wrong,?\s*(.+)/i, fact: (m) => m[1] },
  { category: "correction", trust: "medium", match: /correction:\s*(.+)/i, fact: (m) => m[1] },
  { category: "fact", trust: "medium", match: /^(?:fyi|note:|for the record:)\s+(.+)/i, fact: (m) => m[1] },
];

function clean(text) {
  return text.trim().replace(/\s+/g, " ").slice(0, MAX_FACT_LEN);
}

function isUselessMessage(message) {
  const text = message.trim();
  if (text.length < 3) return true;
  if (USELESS_MESSAGE.some((re) => re.test(text))) return true;
  if (/^(hi|hello|hey)\b/i.test(text) && text.split(/\s+/).length <= 4) return true;
  return false;
}

function isUsefulFact(fact) {
  const cleaned = clean(fact);
  if (cleaned.length < 2) return false;
  if (USELESS_FACT.some((re) => re.test(cleaned))) return false;
  if (cleaned.split(/\s+/).length === 1 && cleaned.length < 3) return false;
  return true;
}

function countCorrectionRepeats(recentMessages, fact) {
  const lower = fact.toLowerCase();
  let count = 0;
  for (const msg of recentMessages) {
    if (msg.role !== "user") continue;
    const text = msg.content.toLowerCase();
    if (text.includes(lower) && /actually|correction|meant|wrong|don'?t call/i.test(text)) {
      count++;
    }
  }
  return count;
}

function assessCandidate(sourceMessage, candidate, existingEntries, recentMessages) {
  if (isUselessMessage(sourceMessage)) {
    return { save: false, confidence: 0, reason: "useless message" };
  }

  const fact = clean(candidate.fact);
  if (!isUsefulFact(fact)) {
    return { save: false, confidence: 0, reason: "useless fact" };
  }

  let confidence;
  switch (candidate.trust) {
    case "high":
      confidence = 0.92;
      break;
    case "medium":
      confidence = 0.68;
      break;
    default:
      confidence = 0.5;
  }

  if (candidate.category === "correction") {
    const repeats = countCorrectionRepeats(recentMessages, fact);
    if (repeats >= 2) confidence = 0.95;
    else if (repeats === 1) confidence = 0.82;
    else if (confidence < 0.75) {
      return { save: false, confidence, reason: "correction not repeated yet" };
    }
  }

  const similar = findSimilar(existingEntries, fact, candidate.category);
  if (similar) {
    confidence = Math.min(1, Math.max(confidence, similar.confidence + 0.1));
  }

  if (confidence < 0.7) {
    return { save: false, confidence, reason: "confidence too low" };
  }

  return { save: true, confidence, reason: "useful" };
}

function extractCandidates(message) {
  const text = message.trim();
  const results = [];

  for (const rule of EXTRACTION_RULES) {
    const m = text.match(rule.match);
    if (m) {
      results.push({
        category: rule.category,
        fact: clean(rule.fact(m)),
        trust: rule.trust,
      });
    }
  }

  const seen = new Set();
  return results.filter((r) => {
    const key = `${r.category}:${r.fact.toLowerCase()}`;
    if (!r.fact || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyLearning(entries, sourceMessage, recentMessages) {
  if (isUselessMessage(sourceMessage)) return [];

  const candidates = extractCandidates(sourceMessage);
  const added = [];

  for (const candidate of candidates) {
    const assessment = assessCandidate(sourceMessage, candidate, entries, recentMessages);
    if (!assessment.save) continue;

    const entry = upsertEntry(entries, {
      fact: candidate.fact,
      category: candidate.category,
      confidence: assessment.confidence,
      source_message: sourceMessage,
    });
    if (entry) added.push(entry);
  }

  return added;
}

function getByCategory(entries, category) {
  return entries.filter((e) => e.category === category).map((e) => e.fact);
}

function getNames(entries) {
  return getByCategory(entries, "name");
}

function getPreferences(entries) {
  return getByCategory(entries, "preference");
}

function findRelevant(entries, message) {
  const lower = message.toLowerCase();
  return entries.filter((e) => {
    const factLower = e.fact.toLowerCase();
    return lower.includes(factLower) || factLower.split(/\s+/).some((w) => w.length > 4 && lower.includes(w));
  });
}

module.exports = {
  applyLearning,
  getByCategory,
  getNames,
  getPreferences,
  findRelevant,
  isUselessMessage,
  isUsefulFact,
  extractCandidates,
  assessCandidate,
};
