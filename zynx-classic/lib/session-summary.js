const fs = require("fs");
const { getActiveConversation } = require("./conversations");
const { callModel } = require("./llm");

const SUMMARY_AFTER = 20;
const KEEP_RECENT = 14;

function needsSummary(conv) {
  const msgs = conv?.messages || [];
  if (msgs.length < SUMMARY_AFTER) return false;
  const olderCount = msgs.length - KEEP_RECENT;
  return olderCount > 0 && conv.summaryUpTo !== olderCount;
}

async function summarizeMessages(messages, displayName) {
  const transcript = messages
    .map((m) => `${m.role}: ${String(m.content).replace(/\s+/g, " ").slice(0, 600)}`)
    .join("\n");

  const result = await callModel(
    "or-flash",
    [
      {
        role: "user",
        content: `Summarize this conversation for future AI context. Keep: user goals, decisions made, file names, code approach, bugs, open questions. Under 350 words. No fluff.\n\n${transcript}`,
      },
    ],
    "caveman",
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
  const summary = await summarizeMessages(older, displayName);
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
  SUMMARY_AFTER,
  KEEP_RECENT,
  needsSummary,
  maybeUpdateSessionSummary,
  getSessionSummary,
};
