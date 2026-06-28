const { APP_NAME } = require("./branding");

function messagesToMarkdown(messages, displayName = "User") {
  const lines = [`# ${APP_NAME} chat export`, "", `Exported: ${new Date().toISOString()}`, ""];
  for (const msg of messages) {
    const who = msg.role === "user" ? displayName : APP_NAME;
    const badge = msg.llm ? formatLlmBadge(msg.llm) : "";
    lines.push(`## ${who}${badge ? ` ${badge}` : ""}`, "");
    lines.push(msg.content || "", "");
    if (msg.timestamp) lines.push(`*${msg.timestamp}*`, "");
    lines.push("---", "");
  }
  return lines.join("\n");
}

function formatLlmBadge(llm) {
  const parts = [];
  if (llm.cached) parts.push("cached");
  if (llm.free) parts.push("free");
  if (llm.pipeline) parts.push("dev-team");
  if (llm.provider) parts.push(String(llm.provider));
  if (llm.autoSavedAs) parts.push(`script:${llm.autoSavedAs}`);
  return parts.length ? `[${parts.join(", ")}]` : "";
}

module.exports = { messagesToMarkdown };
