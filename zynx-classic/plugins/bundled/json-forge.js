module.exports = {
  id: "json-forge",
  targetAgents: ["coder-kimi", "coder-glm", "planner"],
  agentPrompt(ctx) {
    return "JSON FORGE: Prefer valid JSON examples. Use consistent field naming (camelCase). Include sample payloads in fenced json blocks.";
  },
};
