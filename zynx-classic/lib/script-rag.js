const STOP = new Set(
  "the a an and or but if then else when while of to in on for with without about is are was were be been being i you he she it we they me my your our their this that these those do does did doing have has had having just really very so too what who where why how which can could should would will".split(
    " "
  )
);

function keywords(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function scoreScript(query, script) {
  const q = new Set(keywords(query));
  if (!q.size) return 0;
  const hay = `${script.name} ${script.content}`.toLowerCase();
  let score = 0;
  for (const w of q) {
    if (hay.includes(w)) score += 1;
  }
  return score;
}

function findRelevantScripts(query, scripts, limit = 2) {
  if (!scripts?.length) return [];
  return [...scripts]
    .map((s) => ({ script: s, score: scoreScript(query, s) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.script);
}

function scriptRagBlock(query, scripts) {
  const hits = findRelevantScripts(query, scripts);
  if (!hits.length) return "";
  const parts = hits.map(
    (s) => `### Past script: ${s.name}\n${String(s.content).slice(0, 1200)}`
  );
  return `\n\n--- Similar saved scripts (reuse patterns if helpful) ---\n${parts.join("\n\n")}\n--- end scripts ---`;
}

module.exports = { findRelevantScripts, scriptRagBlock };
