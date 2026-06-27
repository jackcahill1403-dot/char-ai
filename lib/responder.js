const { getByCategory, getNames, getPreferences, findRelevant } = require("./learn");

const MODE_PREFIX = {
  normal: "",
  silly: "🎉 OMG ",
  serious: "Acknowledged. ",
};

const MODE_SUFFIX = {
  normal: "",
  silly: " lol!! 🦄",
  serious: " End of response.",
};

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","when","while","of","to","in","on",
  "for","with","without","about","is","are","was","were","be","been","being","i","you",
  "he","she","it","we","they","me","my","your","our","their","this","that","these","those",
  "do","does","did","doing","have","has","had","having","just","really","very","so","too",
  "what","who","where","why","how","which","can","could","should","would","will","wont",
  "tell","know","think","say","said","tell","me","please","give","show","list",
  "dont","im","ive","id","ill","its","whats","get","got","make","made","thing","things",
  "stuff","something","anything","everything","nothing","one","two","three","time","now",
  "here","there","today","tomorrow","yesterday","good","bad","great","nice","cool","lol",
  "haha","hey","hi","hello","bye","thanks","thank","sorry","want","need","like","also",
  "any","all","every","each","other","than","more","most","some","well","okay","ok","yes",
  "no","not","yeah","nope","sure","maybe","kind","sort",
]);

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function keywords(text) {
  const lower = text.toLowerCase();
  const tokens = lower.match(/[a-z][a-z0-9'-]{2,}/g) || [];
  const out = [];
  const seen = new Set();
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    if (t.length < 3) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function scoreEntry(entry, queryKw) {
  const factLower = entry.fact.toLowerCase();
  let score = 0;
  for (const kw of queryKw) {
    if (factLower.includes(kw)) score += 2;
    else {
      const factKw = keywords(entry.fact);
      if (factKw.some((fk) => fk === kw)) score += 1;
    }
  }
  score += (entry.confidence || 0.5) * 0.5;
  return score;
}

function searchMemory(entries, query) {
  const kws = keywords(query);
  if (!kws.length) return [];
  const scored = entries
    .map((e) => ({ entry: e, score: scoreEntry(e, kws) }))
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 4).map((s) => s.entry);
}

function isQuestion(text) {
  return /\?\s*$/.test(text.trim()) || /^(what|who|where|when|why|how|which|do|does|did|can|could|should|would|is|are|was|were)\b/i.test(text.trim());
}

function summarizeMemory(entries) {
  const parts = [];
  const names = getNames(entries);
  const prefs = getPreferences(entries);
  const facts = getByCategory(entries, "fact");
  const rules = getByCategory(entries, "rule");

  if (names.length) parts.push(`your name is ${names[0]}`);
  if (prefs.length) parts.push(...prefs.slice(0, 5));
  if (facts.length) parts.push(...facts.slice(0, 5));
  if (rules.length) parts.push(...rules.slice(0, 3));

  return parts;
}

function answerFromMemory(message, entries) {
  const lower = message.toLowerCase();

  if (
    /what('s| is)\s+(your|ur|its|it'?s)\s+name/.test(lower) ||
    /who are you/.test(lower) ||
    /your name\??$/.test(lower)
  ) {
    return "My name is char.ai.";
  }

  if (/what('s| is) my name/.test(lower)) {
    const names = getNames(entries);
    return names.length
      ? `Your name is ${names[0]}.`
      : "You haven't told me your name yet.";
  }

  if (/what do i like|what('s| are) my favorite|what do i prefer/.test(lower)) {
    const likes = getPreferences(entries).filter((p) => /^Likes /i.test(p));
    return likes.length
      ? `You like ${likes.map((l) => l.replace(/^Likes /i, "")).join(", ")}.`
      : "You haven't shared preferences I consider worth saving yet.";
  }

  if (/what do i (?:dis)?like|what do i hate/.test(lower)) {
    const dislikes = getPreferences(entries).filter((p) => /^Dislikes /i.test(p));
    return dislikes.length
      ? `You dislike ${dislikes.map((d) => d.replace(/^Dislikes /i, "")).join(", ")}.`
      : "No saved dislikes yet.";
  }

  if (/what do you (?:know|remember)|what have you learned|what'?s in your memory/.test(lower)) {
    const parts = summarizeMemory(entries);
    return parts.length
      ? `Useful things I've saved: ${parts.join("; ")}.`
      : "Nothing useful saved yet. Tell me your name, preferences, or say \"remember that...\" — I ignore greetings and jokes.";
  }

  if (/what('s| is) my (?:job|role)|where do i work/.test(lower)) {
    const facts = getByCategory(entries, "fact").filter((f) => /^Works (at|as|on)/i.test(f));
    return facts.length
      ? `You work ${facts[0].replace(/^Works /i, "")}.`
      : "You haven't told me about your job.";
  }

  if (/where do i live|what('s| is) my (?:city|location|home)/.test(lower)) {
    const facts = getByCategory(entries, "fact").filter((f) => /^Lives in /i.test(f));
    return facts.length
      ? `You live in ${facts[0].replace(/^Lives in /i, "")}.`
      : "You haven't told me where you live.";
  }

  if (/what do i (?:use|use for|work with)|what tools/.test(lower)) {
    const facts = getByCategory(entries, "fact").filter((f) => /^Uses /i.test(f));
    return facts.length
      ? `You use ${facts.map((f) => f.replace(/^Uses /i, "")).join(", ")}.`
      : "You haven't told me what tools you use.";
  }

  if (/what are (?:my |the )?rules|what rules/.test(lower)) {
    const rules = getByCategory(entries, "rule");
    return rules.length
      ? `Your rules: ${rules.join("; ")}.`
      : "You haven't set any rules for me yet.";
  }

  return null;
}

function composeAnswerFromMemory(query, matches) {
  if (!matches.length) return null;
  if (matches.length === 1) {
    return `From memory: ${matches[0].fact}.`;
  }
  const facts = matches.map((m) => m.fact);
  return `Here's what I have on that: ${facts.join("; ")}.`;
}

function buildReply(userMessage, mode, entries = [], justSaved = []) {
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  let body;

  const directAnswer = answerFromMemory(text, entries);
  if (directAnswer) {
    body = directAnswer;
  } else if (!text) {
    body = "I didn't catch that. Try typing something.";
  } else if (/^(hi|hello|hey)\b/.test(lower)) {
    const name = getNames(entries)[0];
    body = name
      ? pick([`Hello again, ${name}!`, `Hey ${name}!`, `Hi ${name}!`])
      : pick(["Hello!", "Hey there.", "Hi!"]);
  } else if (lower.includes("help")) {
    body =
      'I save useful stuff (names, preferences, facts, rules) and use it to answer. Try "what do I like?" or "what do you know about me?".';
  } else if (lower.includes("mode")) {
    body = `You're in ${mode} mode. Change it on Settings.`;
  } else if (justSaved.length) {
    const bits = justSaved.map((e) => `${e.category}: "${e.fact}" (${Math.round(e.confidence * 100)}%)`);
    body = `Saved to memory — ${bits.join("; ")}.`;
  } else if (isQuestion(text)) {
    const matches = searchMemory(entries, text);
    if (matches.length) {
      body = composeAnswerFromMemory(text, matches);
    } else {
      body = pick([
        "I don't have anything useful saved on that. Tell me and I'll remember.",
        "Not sure — nothing in memory matches. Teach me and I'll recall it next time.",
        "No saved facts cover that yet.",
      ]);
    }
  } else {
    const matches = searchMemory(entries, text);
    if (matches.length) {
      const relevant = matches.slice(0, 2).map((m) => m.fact);
      body = `That reminds me — I have: ${relevant.join("; ")}.`;
    } else {
      body = pick([
        "Got it.",
        "Noted.",
        "Okay — tell me more if you want me to remember specifics.",
      ]);
    }
  }

  if (mode === "silly") {
    body = body.replace(/\./g, "!!!").toUpperCase();
  }

  if (mode === "serious") {
    body = body.replace(/!/g, ".");
    body = body.replace(/\?/g, ".");
  }

  return `${MODE_PREFIX[mode] || ""}${body}${MODE_SUFFIX[mode] || ""}`;
}

module.exports = { buildReply, searchMemory, keywords };
