const { get } = require("./env");

const WEB_HINT =
  /\b(latest|current version|today|right now|as of|202[4-9]|release notes|changelog|what is new|recent news|documentation for)\b/i;

function looksLikeWebQuery(text) {
  return WEB_HINT.test(String(text)) || /\?\s*$/.test(String(text).trim()) && text.length > 40;
}

async function searchDuckDuckGo(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  const snippets = [];

  if (data.AbstractText) {
    snippets.push({ title: data.Heading || "Summary", body: data.AbstractText, url: data.AbstractURL });
  }
  for (const t of data.RelatedTopics || []) {
    if (t.Text) snippets.push({ title: "Related", body: t.Text, url: t.FirstURL });
    if (t.Topics) {
      for (const sub of t.Topics.slice(0, 3)) {
        if (sub.Text) snippets.push({ title: "Related", body: sub.Text, url: sub.FirstURL });
      }
    }
    if (snippets.length >= 5) break;
  }
  return snippets.slice(0, 5);
}

async function searchTavily(query) {
  const key = get("TAVILY_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: 5, include_answer: true }),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const data = await res.json();
  const snippets = [];
  if (data.answer) snippets.push({ title: "Answer", body: data.answer, url: "" });
  for (const r of data.results || []) {
    snippets.push({ title: r.title || "Result", body: r.content || "", url: r.url || "" });
  }
  return snippets.slice(0, 6);
}

async function searchWeb(query) {
  const q = String(query || "").trim().slice(0, 200);
  if (!q) return { snippets: [], source: "none" };

  try {
    const tavily = await searchTavily(q);
    if (tavily?.length) return { snippets: tavily, source: "tavily" };
  } catch {
    /* fall through */
  }

  const ddg = await searchDuckDuckGo(q);
  return { snippets: ddg, source: "duckduckgo" };
}

function formatSearchResults(query, { snippets, source }) {
  if (!snippets.length) {
    return `No web results for **${query}**. Try rephrasing or add \`TAVILY_API_KEY\` to .env for richer search.`;
  }
  const lines = [`**Web search** (${source}): ${query}`, ""];
  for (const s of snippets) {
    const link = s.url ? ` — ${s.url}` : "";
    lines.push(`- **${s.title}**${link}\n  ${String(s.body).slice(0, 400)}`);
  }
  return lines.join("\n");
}

function webSearchBlock(query) {
  return searchWeb(query).then(({ snippets, source }) => {
    if (!snippets.length) return "";
    const body = snippets
      .map((s) => `- ${s.title}: ${String(s.body).slice(0, 350)}${s.url ? ` (${s.url})` : ""}`)
      .join("\n");
    return `\n\n--- Web search (${source}) ---\n${body}\n--- end search ---`;
  });
}

module.exports = { searchWeb, formatSearchResults, webSearchBlock, looksLikeWebQuery };
