module.exports = {
  id: "code-expert",
  targetAgents: ["coder"],
  agentPrompt(ctx) {
    if (ctx.agentId !== "coder" && !ctx.agentName?.toLowerCase().includes("coder")) return "";
    return [
      "CODE EXPERT PLUGIN:",
      "- Prefer small focused functions.",
      "- Handle empty input and errors.",
      "- Add brief inline comments only where logic is non-obvious.",
      "- Include how to run the code at the end.",
    ].join("\n");
  },
};
