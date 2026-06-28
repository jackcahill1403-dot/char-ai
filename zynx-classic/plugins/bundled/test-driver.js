module.exports = {
  id: "test-driver",
  targetAgents: ["coder"],
  agentPrompt(ctx) {
    if (ctx.agentId !== "coder" && !ctx.agentName?.toLowerCase().includes("coder")) return "";
    return [
      "TEST DRIVER PLUGIN:",
      "Include tests (unit or integration) OR exact manual test steps.",
      "Show expected output for at least one happy path.",
    ].join("\n");
  },
};
