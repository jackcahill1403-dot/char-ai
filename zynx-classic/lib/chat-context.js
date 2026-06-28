const RECENT_FULL = 28;
const OLDER_SNIPPET = 12;
const SNIPPET_LEN = 350;

function buildChatMessages(memMessages, { userMessage, sessionSummary } = {}) {
  const all = Array.isArray(memMessages) ? memMessages : [];
  const recent = all.slice(-RECENT_FULL).map((m) => ({ role: m.role, content: m.content }));
  const older = all.slice(0, -RECENT_FULL);

  const parts = [];

  if (sessionSummary) {
    parts.push({
      role: "system",
      content: `Session brief (earlier in this chat — treat as authoritative context):\n${sessionSummary}`,
    });
  } else if (older.length) {
    const bullets = older
      .slice(-OLDER_SNIPPET)
      .map((m) => `${m.role}: ${String(m.content).replace(/\s+/g, " ").slice(0, SNIPPET_LEN)}`);
    parts.push({
      role: "system",
      content: `Earlier messages (${older.length} total, snippets — ask user to recap if unsure):\n${bullets.join("\n")}`,
    });
  }

  for (const m of recent) parts.push(m);
  if (userMessage && !recent.some((m) => m.role === "user" && m.content === userMessage)) {
    parts.push({ role: "user", content: userMessage });
  }
  return parts;
}

module.exports = { buildChatMessages, RECENT_FULL };
