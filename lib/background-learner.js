const {
  extractCandidates,
  assessCandidate,
  isUselessMessage,
  isUsefulFact,
} = require("./learn");

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","when","while","of","to","in","on",
  "for","with","without","about","is","are","was","were","be","been","being","i","you",
  "he","she","it","we","they","me","my","your","our","their","this","that","these","those",
  "do","does","did","doing","have","has","had","having","just","really","very","so","too",
  "like","want","need","gonna","wanna","yeah","yes","no","not","okay","ok","sure","well",
  "what","who","where","why","how","which","can","could","should","would","will","wont",
  "dont","dont","im","ive","id","ill","its","whats","get","got","make","made","thing",
  "things","stuff","something","anything","everything","nothing","one","two","three","time",
  "now","here","there","today","tomorrow","yesterday","good","bad","great","nice","cool",
  "lol","haha","hey","hi","hello","bye","please","thanks","thank","sorry","tell","know",
  "think","says","said","say","going","went","put","take","took","lets","let","us","also",
  "still","even","much","more","most","some","any","all","every","each","other","than",
]);

const MIN_TOPIC_LEN = 4;
const MIN_TOPIC_REPEATS = 2;
const RECENT_WINDOW = 60;

const CASUAL_RULES = [
  { category: "fact", match: /i'?m (?:working|building|writing|making|learning|trying|exploring|reading|studying)\s+(?:on\s+|a\s+|an\s+|the\s+)?(.+)/i, fact: (m) => `Working on ${m[1]}` },
  { category: "fact", match: /i (?:use|am using|switched to|moved to|migrating to)\s+(.+)/i, fact: (m) => `Uses ${m[1]}` },
  { category: "fact", match: /i'?m on\s+(.+)/i, fact: (m) => `Currently on ${m[1]}` },
  { category: "fact", match: /i'?ve been\s+(?:doing|working|reading|learning|using|trying|building)\s+(.+)/i, fact: (m) => `Has been doing ${m[1]}` },
  { category: "fact", match: /today i\s+(.+)/i, fact: (m) => `Today: ${m[1]}` },
  { category: "fact", match: /i need to\s+(.+)/i, fact: (m) => `Needs to ${m[1]}` },
  { category: "fact", match: /i have to\s+(.+)/i, fact: (m) => `Has to ${m[1]}` },
  { category: "fact", match: /i'?m (?:into|interested in)\s+(.+)/i, fact: (m) => `Interested in ${m[1]}` },
  { category: "fact", match: /my (?:dog|cat|pet|car|bike|project|team|company|side\s+project)\s+(?:is|was|has|named)?\s*(.+)/i, fact: (m) => `My ${m[0].split(/\s+/).slice(1,3).join(" ")}: ${m[1]}` },
  { category: "preference", match: /i (?:usually|always|typically|prefer|tend to)\s+(.+)/i, fact: (m) => `Prefers to ${m[1]}` },
  { category: "preference", match: /i (?:can'?t stand|don'?t enjoy|don'?t love|avoid)\s+(.+)/i, fact: (m) => `Avoids ${m[1]}` },
  { category: "fact", match: /i'?m a\s+(.+)/i, fact: (m) => `Is a ${m[1]}` },
  { category: "fact", match: /i work on\s+(.+)/i, fact: (m) => `Works on ${m[1]}` },
  { category: "fact", match: /i'?m trying\s+(?:to\s+)?(.+)/i, fact: (m) => `Trying ${m[1]}` },
];

function tokens(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9'-]{3,}/g) || []);
}

function extractCasual(message) {
  const results = [];
  const text = message.trim();
  for (const rule of CASUAL_RULES) {
    const m = text.match(rule.match);
    if (m) {
      const fact = rule.fact(m).trim().replace(/\s+/g, " ").slice(0, 120);
      if (fact && isUsefulFact(fact)) {
        results.push({ category: rule.category, fact, trust: "medium" });
      }
    }
  }
  return results;
}

function extractRecurringTopics(messages, windowSize = RECENT_WINDOW) {
  const recent = messages.slice(-windowSize).filter((m) => m.role === "user");
  const counts = new Map();
  const examples = new Map();

  for (const msg of recent) {
    if (isUselessMessage(msg.content)) continue;
    const seen = new Set();
    for (const tok of tokens(msg.content)) {
      if (STOPWORDS.has(tok)) continue;
      if (tok.length < MIN_TOPIC_LEN) continue;
      if (seen.has(tok)) continue;
      seen.add(tok);
      counts.set(tok, (counts.get(tok) || 0) + 1);
      if (!examples.has(tok)) examples.set(tok, msg.content);
    }
  }

  const recurring = [];
  for (const [topic, count] of counts) {
    if (count >= MIN_TOPIC_REPEATS) {
      recurring.push({ topic, count, example: examples.get(topic) });
    }
  }
  return recurring.sort((a, b) => b.count - a.count);
}

function factAlreadyCovered(entries, topic) {
  const lower = topic.toLowerCase();
  return entries.some((e) => e.fact.toLowerCase().includes(lower));
}

function scanMessages({ messages, entries, sinceIdx = 0 }) {
  const newMessages = messages.slice(sinceIdx);
  const saved = [];
  const skipped = [];

  for (let i = 0; i < newMessages.length; i++) {
    const msg = newMessages[i];
    if (msg.role !== "user") continue;
    if (isUselessMessage(msg.content)) continue;

    const explicit = extractCandidates(msg.content);
    for (const candidate of explicit) {
      const assessment = assessCandidate(msg.content, candidate, entries, messages);
      if (!assessment.save) {
        skipped.push({ reason: assessment.reason, fact: candidate.fact });
        continue;
      }
      saved.push({
        fact: candidate.fact,
        category: candidate.category,
        confidence: assessment.confidence,
        source_message: msg.content,
        origin: "chat:explicit",
      });
    }

    const casual = extractCasual(msg.content);
    for (const candidate of casual) {
      const assessment = assessCandidate(msg.content, candidate, entries, messages);
      if (!assessment.save) {
        skipped.push({ reason: assessment.reason, fact: candidate.fact });
        continue;
      }
      const dup = saved.some(
        (s) => s.fact.toLowerCase() === candidate.fact.toLowerCase()
      );
      if (dup) continue;
      saved.push({
        fact: candidate.fact,
        category: candidate.category,
        confidence: assessment.confidence,
        source_message: msg.content,
        origin: "chat:casual",
      });
    }
  }

  const recurring = extractRecurringTopics(messages);
  for (const { topic, count, example } of recurring) {
    if (factAlreadyCovered(entries, topic)) continue;

    const confidence = Math.min(0.9, 0.55 + count * 0.1);
    if (confidence < 0.7) continue;

    const alreadyQueued = saved.some(
      (s) => s.category === "fact" && s.fact.toLowerCase().includes(topic)
    );
    if (alreadyQueued) continue;

    saved.push({
      fact: `User mentions "${topic}" repeatedly`,
      category: "fact",
      confidence,
      source_message: example,
      origin: "chat:recurring",
    });
  }

  return { saved, skipped, nextIdx: messages.length };
}

module.exports = {
  scanMessages,
  extractRecurringTopics,
  extractCasual,
  RECENT_WINDOW,
  MIN_TOPIC_REPEATS,
};
