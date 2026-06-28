module.exports = {
  id: "api-builder",
  targetAgents: ["coder-kimi", "coder-glm", "coder", "planner"],
  agentPrompt(ctx) {
    const id = (ctx.agentId || "").toLowerCase();
    if (id === "planner") {
      return "API BUILDER: Plan REST endpoints, request/response shapes, status codes, and auth approach.";
    }
    if (id.includes("coder")) {
      return "API BUILDER: Use clear routes, validation, error JSON { error: string }, and example curl commands.";
    }
    return "";
  },
};
