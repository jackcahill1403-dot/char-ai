module.exports = {
  id: "test-driver-plus",
  targetAgents: ["tester-gpt", "tester-kimi", "reviewer"],
  agentPrompt() {
    return [
      "TEST DRIVER PLUS:",
      "List manual test steps numbered 1..n.",
      "Include edge cases, regression checks, and expected vs actual.",
      "End with PASS/FAIL table.",
    ].join("\n");
  },
};
