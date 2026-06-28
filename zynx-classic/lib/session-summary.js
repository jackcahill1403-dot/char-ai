const { getActiveConversation } = require("./conversations");
const { callModel } = require("./llm");
const { RECENT_FULL } = require("./chat-context");

const KEEP_RECENT = RECENT_FULL;

function needsSummary(conv) {
  const msgs = conv?.messages || [];
  const olderCount = msgs.length - KEEP_RECENT;
  if (olderCount <= 0) return false;
  return conv.summaryUpTo !== olderCount;
}

async function summarizeMessages(messages, displayName, priorSummary = "") {
  const transcript = messages
    .map((m) => `${m.role}: ${String(m.content).replace(/\s+/g, " ").slice(0, 900)}`)
    .join("\n");

  const prior = priorSummary
    ? `Previous session brief (merge and update, drop stale details):\n${priorSummary}\n\nNew messages to fold in:\n`
    : "";

  const result = await callModel(
    "or-flash",
    [
      {
        role: "user",
        content: `${prior}Summarize this conversation for future AI context. Keep: user goals, decisions, names, file paths, code approach, bugs, preferences, open questions. Under 500 words. No fluff.\n\n${transcript}`,
      },
    ],
    "normal",
    displayName || "User",
    { taskType: "planning" }
  );

  return result.ok ? result.content.trim() : null;
}

async function maybeUpdateSessionSummary(mem, displayName) {
  const conv = getActiveConversation(mem);
  if (!conv || !needsSummary(conv)) return conv?.summary || "";

  const msgs = conv.messages;
  const older = msgs.slice(0, msgs.length - KEEP_RECENT);
  const summary = await summarizeMessages(older, displayName, conv.summary || "");
  if (summary) {
    conv.summary = summary;
    conv.summaryUpTo = older.length;
    conv.summaryAt = new Date().toISOString();
  }
  return conv.summary || "";
}

function getSessionSummary(mem) {
  return getActiveConversation(mem)?.summary || "";
}

module.exports = {
  KEEP_RECENT,
  needsSummary,
  maybeUpdateSessionSummary,
  getSessionSummary,
};
