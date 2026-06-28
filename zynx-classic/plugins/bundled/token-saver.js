module.exports = {
  id: "token-saver",
  agentPrompt() {
    return "TOKEN SAVER: Be concise. No filler. Short sentences. Skip repetition. Code blocks stay complete.";
  },
  finalResponse(ctx) {
    if (ctx.mode !== "caveman") return ctx.text;
    return ctx.text.replace(/\b(however|therefore|additionally|in order to)\b/gi, "");
  },
};
