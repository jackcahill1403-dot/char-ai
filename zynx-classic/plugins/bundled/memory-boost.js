module.exports = {
  id: "memory-boost",
  userMessage(ctx) {
    const history = ctx.chatHistory || [];
    if (!history.length) return ctx.userMessage;
    const lines = history
      .slice(-8)
      .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
      .join("\n");
    return `Recent chat context:\n${lines}\n\nCurrent request:\n${ctx.userMessage}`;
  },
};
