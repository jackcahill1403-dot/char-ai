module.exports = {
  id: "plan-master",
  targetAgents: ["planner"],
  agentPrompt(ctx) {
    if (ctx.agentId !== "planner" && !ctx.agentName?.toLowerCase().includes("plan")) return "";
    return [
      "PLAN MASTER PLUGIN:",
      "Format: 1) Goal 2) Numbered steps 3) Acceptance criteria 4) Risks/unknowns.",
      "Keep each step actionable. No code.",
    ].join("\n");
  },
};
