const {
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
  "dont","im","ive","id","ill","its","whats","get","got","make","made","thing","things",
  "stuff","something","anything","everything","nothing","one","two","three","time","now",
  "here","there","today","tomorrow","yesterday","good","bad","great","nice","cool","lol",
  "haha","hey","hi","hello","bye","please","thanks","thank","sorry","tell","know","think",
  "says","said","say","going","went","put","take","took","lets","let","us","also","still",
  "even","much","more","most","some","any","all","every","each","other","than",
]);

const MIN_TOPIC_LEN = 4;
const FREQUENT_THRESHOLD = 4;
const VERY_FREQUENT_THRESHOLD = 8;

function tokens(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9'-]{3,}/g) || []);
}

function countTopics(messages) {
  const counts = new Map();
  const examples = new Map();
  for (const msg of messages) {
    if (msg.role !== "user") continue;
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
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count, example: examples.get(topic) }))
    .sort((a, b) => b.count - a.count);
}

function factExists(entries, factText) {
  const lower = factText.toLowerCase();
  return entries.some((e) => e.fact.toLowerCase() === lower);
}

function factCoversTopic(entries, topic) {
  const lower = topic.toLowerCase();
  return entries.some((e) => e.fact.toLowerCase().includes(lower));
}

function reflect({ messages, entries }) {
  const generated = [];
  const topics = countTopics(messages);

  for (const { topic, count, example } of topics) {
    if (count < FREQUENT_THRESHOLD) continue;
    if (factCoversTopic(entries, topic)) continue;

    const confidence = Math.min(0.9, 0.6 + count * 0.04);
    const intensity = count >= VERY_FREQUENT_THRESHOLD ? "frequently" : "often";

    const fact = `User ${intensity} discusses ${topic}`;
    if (factExists(entries, fact)) continue;

    generated.push({
      fact,
      category: "fact",
      confidence,
      source_message: `reflection over ${count} mentions (e.g. "${example.slice(0, 80)}")`,
      origin: "reflection:topic-frequency",
    });
  }

  const preferenceFacts = entries.filter((e) => e.category === "preference");
  if (preferenceFacts.length >= 3 && !factExists(entries, "User has clear preferences about how replies should look")) {
    generated.push({
      fact: "User has clear preferences about how replies should look",
      category: "fact",
      confidence: 0.7,
      source_message: `reflection over ${preferenceFacts.length} saved preferences`,
      origin: "reflection:preference-cluster",
    });
  }

  const ruleFacts = entries.filter((e) => e.category === "rule");
  if (ruleFacts.length >= 3 && !factExists(entries, "User has set behavioral rules for the assistant")) {
    generated.push({
      fact: "User has set behavioral rules for the assistant",
      category: "fact",
      confidence: 0.7,
      source_message: `reflection over ${ruleFacts.length} saved rules`,
      origin: "reflection:rule-cluster",
    });
  }

  const topTopics = topics.slice(0, 5).map((t) => t.topic).filter((t) => !factCoversTopic(entries, t));
  if (topTopics.length >= 3 && !factExists(entries, `User's main interests: ${topTopics.join(", ")}`)) {
    generated.push({
      fact: `User's main interests: ${topTopics.join(", ")}`,
      category: "fact",
      confidence: 0.65,
      source_message: "reflection over top recurring topics",
      origin: "reflection:top-interests",
    });
  }

  return generated.filter((g) => isUsefulFact(g.fact));
}

module.exports = { reflect, countTopics };
