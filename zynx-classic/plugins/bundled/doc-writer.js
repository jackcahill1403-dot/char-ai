module.exports = {
  id: "doc-writer",
  targetAgents: ["planner", "tester-gpt", "tester-kimi", "reviewer"],
  agentPrompt() {
    return [
      "DOC WRITER:",
      "Use clear headings, bullet lists, and short paragraphs.",
      "Include a TL;DR at the top when output is long.",
    ].join("\n");
  },
};
