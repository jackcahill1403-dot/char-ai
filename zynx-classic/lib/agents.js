const { listModels, openrouterConfigured } = require("./models");
const { friendlyLlmError } = require("./errors");
const { applyCavemanMode } = require("./caveman-dict");

const HF_DEFAULT_AGENTS = [
  {
    id: "planner",
    name: "Planner",
    model: "hf-qwen36",
    role: "Plan only — numbered steps, acceptance criteria, risks, assumptions. No code. Max clarity.",
  },
  {
    id: "coder-kimi",
    name: "Coder (Kimi 2.7)",
    model: "hf-kimi-code",
    role: "Write complete production code from the plan. Full files in fenced blocks. Handle edge cases. Include brief setup notes.",
  },
  {
    id: "coder-glm",
    name: "Coder (GLM 5.2)",
    model: "glm",
    role: "Write complete production code — different approach from Kimi. Best implementation in fenced blocks. Note trade-offs.",
  },
  {
    id: "tester-gpt",
    name: "Tester (GPT-OSS)",
    model: "hf-gpt-oss",
    role: "QA tester. Bugs, edge cases, security. Numbered test cases + PASS/FAIL table + ship/no-ship verdict.",
  },
  {
    id: "tester-kimi",
    name: "Tester (Kimi 2.6)",
    model: "hf-kimi",
    role: "QA lead. Review both coder outputs + merger. Missing tests, UX issues, final ship/no-ship with reasons.",
  },
];

const OR_DEFAULT_AGENTS = [
  {
    id: "planner",
    name: "Planner",
    model: "or-qwen36",
    role: "Plan only — numbered steps, acceptance criteria, risks, assumptions. No code. Max clarity.",
  },
  {
    id: "coder-kimi",
    name: "Coder (Kimi 2.7)",
    model: "or-kimi-code",
    role: "Write complete production code from the plan. Full files in fenced blocks. Handle edge cases. Include brief setup notes.",
  },
  {
    id: "coder-glm",
    name: "Coder (GLM 5.2)",
    model: "or-glm",
    role: "Write complete production code — different approach from Kimi. Best implementation in fenced blocks. Note trade-offs.",
  },
  {
    id: "tester-gpt",
    name: "Tester (GPT-OSS)",
    model: "or-gpt-oss",
    role: "QA tester. Bugs, edge cases, security. Numbered test cases + PASS/FAIL table + ship/no-ship verdict.",
  },
  {
    id: "tester-kimi",
    name: "Tester (Kimi 2.6)",
    model: "or-kimi",
    role: "QA lead. Review both coder outputs + merger. Missing tests, UX issues, final ship/no-ship with reasons.",
  },
];

const DEFAULT_AGENTS = HF_DEFAULT_AGENTS;

function defaultAgents() {
  const template = openrouterConfigured() ? OR_DEFAULT_AGENTS : HF_DEFAULT_AGENTS;
  return template.map((a) => ({ ...a }));
}

function defaultAgentModelFallback() {
  return openrouterConfigured() ? "or-glm" : "glm";
}

function normalizeAgents(agents) {
  if (!Array.isArray(agents) || !agents.length) return defaultAgents();
  const validIds = new Set(listModels().map((m) => m.id));
  return agents
    .map((a, i) => ({
      id: String(a.id || `agent-${i}`).slice(0, 40),
      name: String(a.name || `Agent ${i + 1}`).slice(0, 40),
      model: validIds.has(a.model) ? a.model : defaultAgentModelFallback(),
      role: String(a.role || "Help the user.").slice(0, 500),
    }))
    .slice(0, 8);
}

function formatPipelineReply(steps) {
  const parts = ["**Dev team complete — counted as 1 message.**", ""];
  for (const step of steps) {
    const label = `${step.name} (${step.modelLabel})`;
    if (step.failed) {
      parts.push(`### ${label} — FAILED\n${step.error || step.reason || "unknown error"}`);
    } else if (step.ok) {
      parts.push(`### ${label}\n${step.content}`);
    } else {
      parts.push(`### ${label}\n(mock — ${step.reason || "no key"})`);
    }
  }
  return parts.join("\n\n");
}

function emitPipeline(events, event) {
  if (typeof events === "function") events(event);
}

async function runOneAgent(agent, context, opts) {
  const { applyAgentPrompts, plugins, mode, displayName, modelLabels, customRole, pipelineEvents } =
    opts;
  const { callAgent } = require("./llm");

  emitPipeline(pipelineEvents, {
    type: "step_start",
    id: agent.id,
    name: agent.name,
    model: agent.model,
    modelLabel: modelLabels[agent.model] || agent.model,
  });

  const role = applyAgentPrompts(
    customRole || agent.role,
    { agentId: agent.id, agentName: agent.name, mode, displayName },
    plugins
  );

  let streamed = "";
  const result = await callAgent(
    agent.model,
    [{ role: "user", content: context }],
    role,
    mode,
    displayName,
    agent.name,
    {
      ...(opts.llmOpts || {}),
      onFallback: (fb) => emitPipeline(pipelineEvents, { type: "fallback", ...fb }),
      onStream: pipelineEvents
        ? (delta) => {
            streamed += delta;
            emitPipeline(pipelineEvents, {
              type: "step_delta",
              id: agent.id,
              delta,
            });
          }
        : undefined,
    }
  );

  if (!result.ok) {
    const error = friendlyLlmError(result.reason, result.detail, result.provider);
    const step = {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      modelLabel: modelLabels[agent.model] || agent.model,
      ok: false,
      failed: true,
      error,
      reason: result.reason,
      content: "",
      provider: result.provider,
    };
    emitPipeline(pipelineEvents, { type: "step_done", ...step });
    return step;
  }

  const step = {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    modelLabel: modelLabels[agent.model] || agent.model,
    ok: true,
    failed: false,
    mock: false,
    content: result.content,
    provider: result.provider,
    fallback: result.fallback,
    fallbackFrom: result.fallbackFrom,
    fallbackTo: result.fallbackTo,
    requestedProvider: result.requestedProvider,
  };
  emitPipeline(pipelineEvents, { type: "step_done", ...step });
  return step;
}

function appendStepContext(ctx, step) {
  if (step.content) return `${ctx}\n\n--- ${step.name} ---\n${step.content}`;
  if (step.failed) return `${ctx}\n\n--- ${step.name} FAILED ---\n${step.error}`;
  return ctx;
}

function isStandardDevTeam(agents) {
  const ids = agents.map((a) => a.id).join(",");
  return ids === "planner,coder-kimi,coder-glm,tester-gpt,tester-kimi";
}

async function runStandardDevTeam(boostedMessage, agents, baseOpts) {
  const steps = [];
  const [planner, coderKimi, coderGlm, testerGpt, testerKimi] = agents;
  const base = `Original user request:\n${boostedMessage}`;

  const planStep = await runOneAgent(planner, base, baseOpts);
  steps.push(planStep);

  let ctx = appendStepContext(base, planStep);

  const [kimiCodeStep, glmCodeStep] = await Promise.all([
    runOneAgent(coderKimi, ctx, baseOpts),
    runOneAgent(coderGlm, ctx, baseOpts),
  ]);
  steps.push(kimiCodeStep, glmCodeStep);

  ctx = appendStepContext(ctx, kimiCodeStep);
  ctx = appendStepContext(ctx, glmCodeStep);

  const mergerAgent = {
    id: "merger",
    name: "Merger",
    model: coderKimi.model,
    role: "Merge both coder outputs into ONE best implementation. Single coherent solution — no duplicate files. Keep strongest parts from each. Output final code in fenced blocks + 3-line summary of choices.",
  };
  const mergeStep = await runOneAgent(mergerAgent, ctx, baseOpts);
  steps.push(mergeStep);
  ctx = appendStepContext(ctx, mergeStep);

  const testPrompt = `${ctx}\n\nMerged code ready. Test and review.`;
  const [gptTestStep, kimiTestStep] = await Promise.all([
    runOneAgent(testerGpt, testPrompt, baseOpts),
    runOneAgent(testerKimi, testPrompt, baseOpts),
  ]);
  steps.push(gptTestStep, kimiTestStep);

  return steps;
}

async function runAgentPipeline({
  userMessage,
  agents,
  mode,
  displayName,
  plugins = [],
  chatHistory = [],
  cavemanDict = {},
  extraContext = "",
  pipelineEvents,
}) {
  const { applyUserMessage, applyFinalResponse } = require("./plugins");
  const { listModels } = require("./models");

  emitPipeline(pipelineEvents, { type: "pipeline_start", agents: agents.map((a) => a.name) });

  const boostedMessage = applyUserMessage(userMessage, { mode, displayName, chatHistory }, plugins);
  const modelLabels = Object.fromEntries(listModels().map((m) => [m.id, m.label]));
  const baseOpts = {
    applyAgentPrompts: require("./plugins").applyAgentPrompts,
    plugins,
    mode,
    displayName,
    modelLabels,
    pipelineEvents,
    llmOpts: {
      extraContext,
      taskType: "dev-team",
    },
  };

  let steps;
  if (isStandardDevTeam(agents)) {
    steps = await runStandardDevTeam(boostedMessage, agents, baseOpts);
  } else {
    steps = [];
    let rollingContext = `Original user request:\n${boostedMessage}`;
    for (const agent of agents) {
      const step = await runOneAgent(agent, rollingContext, baseOpts);
      steps.push(step);
      rollingContext = appendStepContext(rollingContext, step);
    }
  }

  let content = formatPipelineReply(steps);
  content = applyCavemanMode(content, mode, cavemanDict);
  content = applyFinalResponse(content, { mode, displayName, devTeam: true }, plugins);

  const anyReal = steps.some((s) => s.ok);
  const last = steps[steps.length - 1];

  emitPipeline(pipelineEvents, { type: "pipeline_done", stepCount: steps.length });

  return {
    ok: anyReal || Boolean(last),
    content,
    pipeline: true,
    countsAsOneMessage: true,
    steps,
    provider: steps.find((s) => s.ok)?.model || last?.model,
    model: "multi-agent",
  };
}

module.exports = {
  DEFAULT_AGENTS,
  HF_DEFAULT_AGENTS,
  OR_DEFAULT_AGENTS,
  defaultAgents,
  defaultAgentModelFallback,
  normalizeAgents,
  runAgentPipeline,
  formatPipelineReply,
};
