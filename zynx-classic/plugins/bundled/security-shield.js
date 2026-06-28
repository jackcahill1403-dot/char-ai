module.exports = {
  id: "security-shield",
  targetAgents: ["reviewer"],
  agentPrompt(ctx) {
    if (ctx.agentId !== "reviewer" && !ctx.agentName?.toLowerCase().includes("review")) return "";
    return [
      "SECURITY SHIELD PLUGIN:",
      "Check: injection, XSS, auth gaps, secrets in code, unsafe file/network ops.",
      "Flag severity: low/med/high. Suggest concrete fixes.",
    ].join("\n");
  },
};
