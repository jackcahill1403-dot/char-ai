module.exports = {
  id: "pr-format",
  finalResponse(ctx) {
    if (ctx.devTeam && ctx.text.length > 200 && !ctx.text.includes("## PR Summary")) {
      return `## PR Summary\n_Auto-formatted by PR Format plugin_\n\n${ctx.text}`;
    }
    return ctx.text;
  },
};
