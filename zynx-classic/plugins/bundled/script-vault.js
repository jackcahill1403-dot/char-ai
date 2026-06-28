module.exports = {
  id: "script-vault",
  finalResponse(ctx) {
    const hint = ctx.autoSavedAs
      ? `\n\n---\nScript Saver: auto-saved as \`${ctx.autoSavedAs}\`. !run ${ctx.autoSavedAs} (free). !publish ${ctx.autoSavedAs} for global.`
      : "\n\n---\nScript Saver: install enabled → every reply auto-saves. !run name (free).";
    if (ctx.text.includes("Script Saver:")) return ctx.text;
    return ctx.text + hint;
  },
};
