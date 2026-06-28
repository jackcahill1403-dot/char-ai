const { listModels, hfKey, openrouterConfigured } = require("./models");
const { keyPoolStatus, allModelKeyPools } = require("./openrouter-keys");
const { APP_NAME } = require("./branding");
const { callProvider } = require("./llm");
const { modeSystemPrompt } = require("./responder");
const { friendlyLlmError, parseProviderErrorBody } = require("./errors");
const { allModelPools, secondsUntilNextClockHour, secondsUntilNextClockDay, clockHourBucket, clockDayBucket } = require("./rate-limiter");
const { readGlobalScripts } = require("./scripts");
const { DEFAULT_OR_MODEL } = require("./openrouter-models");
const { readMemory } = require("./memory");

const SHARED_HF_REASONS = new Set([
  "no_key",
  "insufficient_balance",
  "auth_failed",
  "rate_limited",
]);

function tierCatalogScore(tier) {
  return Math.max(10, 110 - (tier || 5) * 10);
}

function buildRow(m, probe, { shared = false } = {}) {
  const ok = Boolean(probe?.ok);
  const latencyMs = ok ? probe.latencyMs : null;
  const tierScore = tierCatalogScore(m.tier);
  const latencyScore = ok ? Math.max(8, 100 - Math.min(probe.latencyMs / 40, 92)) : 0;
  const score = ok ? Math.round(tierScore * 0.55 + latencyScore * 0.45) : tierScore;

  let message;
  if (ok) {
    message = `${probe.latencyMs}ms`;
  } else if (shared && probe?.reason === "insufficient_balance") {
    message = "HF billing depleted — use OpenRouter models in Settings";
  } else if (shared && probe?.reason === "no_key") {
    message = "No HF token in .env";
  } else if (shared && probe?.reason === "auth_failed") {
    message = "HF token auth failed (shared)";
  } else if (shared && probe?.reason === "rate_limited") {
    message = "HF rate limited (shared account)";
  } else if (m.openrouter && probe?.reason === "no_key") {
    message = "Add OPENROUTER_API_KEY to .env";
  } else if (probe) {
    message = friendlyLlmError(probe.reason, probe.detail, m.id);
  } else {
    message = "Not probed";
  }

  return {
    id: m.id,
    label: m.label,
    model: m.model,
    hf: m.hf,
    openrouter: m.openrouter,
    free: m.free,
    tier: m.tier,
    hint: m.hint,
    configured: m.configured,
    ok,
    latencyMs,
    score,
    catalogScore: tierScore,
    reason: ok ? null : probe?.reason || "not_probed",
    sharedStatus: shared,
    message,
  };
}

async function probeHfAccount() {
  const models = listModels().filter((m) => m.hf);
  const configured = Boolean(hfKey());

  if (!configured) {
    return {
      configured: false,
      ok: false,
      reason: "no_key",
      message: "No HF token — optional if using OpenRouter",
      detail: "",
      latencyMs: null,
      probeModel: null,
    };
  }

  const probeTarget =
    models.find((m) => m.id === "glm") ||
    models.find((m) => m.tier === 1) ||
    models[0];

  const start = Date.now();
  const result = await callProvider(
    probeTarget.id,
    [{ role: "user", content: "Reply with exactly: ok" }],
    modeSystemPrompt("normal", "probe"),
    "normal"
  );
  const latencyMs = Date.now() - start;
  const { message: detail } = parseProviderErrorBody(result.detail);

  if (result.ok) {
    return {
      configured: true,
      ok: true,
      reason: null,
      message: `HF Inference Providers OK (${latencyMs}ms via ${probeTarget.label})`,
      detail: detail || "ok",
      latencyMs,
      probeModel: probeTarget.id,
    };
  }

  return {
    configured: true,
    ok: false,
    reason: result.reason,
    httpStatus: result.httpStatus,
    message: friendlyLlmError(result.reason, result.detail, probeTarget.id),
    detail: detail || result.detail || "",
    latencyMs: null,
    probeModel: probeTarget.id,
  };
}

async function probeOpenRouterAccount() {
  const pool = keyPoolStatus(DEFAULT_OR_MODEL);
  if (!pool.configured) {
    return {
      configured: false,
      ok: false,
      reason: "no_key",
      message: "No OpenRouter key — add OPENROUTER_API_KEY to .env",
      detail: "",
      latencyMs: null,
      probeModel: null,
    };
  }

  const start = Date.now();
  const result = await callProvider(
    DEFAULT_OR_MODEL,
    [{ role: "user", content: "Reply with exactly: ok" }],
    modeSystemPrompt("normal", "probe"),
    "normal"
  );
  const latencyMs = Date.now() - start;
  const { message: detail } = parseProviderErrorBody(result.detail);

  if (result.ok) {
    return {
      configured: true,
      ok: true,
      reason: null,
      message: `OpenRouter OK (${latencyMs}ms via ${DEFAULT_OR_MODEL}, key ${result.orKeySlot || pool.activeIndex || "?"}/${pool.total})`,
      detail: detail || "ok",
      latencyMs,
      probeModel: DEFAULT_OR_MODEL,
      keyPool: keyPoolStatus(DEFAULT_OR_MODEL),
      modelKeyPools: allModelKeyPools(),
    };
  }

  return {
    configured: true,
    ok: false,
    reason: result.reason,
    httpStatus: result.httpStatus,
    message: friendlyLlmError(result.reason, result.detail, DEFAULT_OR_MODEL),
    detail: detail || result.detail || "",
    latencyMs: null,
    probeModel: DEFAULT_OR_MODEL,
    keyPool: keyPoolStatus(DEFAULT_OR_MODEL),
    modelKeyPools: allModelKeyPools(),
  };
}

async function probeModelEntry(m, hfProbe) {
  const useSharedHf =
    m.hf &&
    hfProbe.configured &&
    !hfProbe.ok &&
    SHARED_HF_REASONS.has(hfProbe.reason);

  if (useSharedHf) {
    return buildRow(m, hfProbe, { shared: true });
  }

  if (!m.configured) {
    return buildRow(m, { ok: false, reason: "no_key" });
  }

  const start = Date.now();
  const result = await callProvider(
    m.id,
    [{ role: "user", content: "Reply with exactly: ok" }],
    modeSystemPrompt("normal", "probe"),
    "normal"
  );
  return buildRow(m, {
    ok: result.ok,
    reason: result.reason,
    detail: result.detail,
    latencyMs: Date.now() - start,
  });
}

async function probeAllModels() {
  const catalog = listModels();
  const useOpenRouter = openrouterConfigured();

  const openRouterAccount = await probeOpenRouterAccount();

  let hfAccount;
  if (useOpenRouter) {
    hfAccount = {
      configured: Boolean(hfKey()),
      ok: null,
      skipped: true,
      reason: "skipped",
      message: "Not probed — OpenRouter is your primary provider",
      detail: "",
      latencyMs: null,
      probeModel: null,
    };
  } else {
    hfAccount = await probeHfAccount();
  }

  const probeCatalog = useOpenRouter ? catalog.filter((m) => m.openrouter) : catalog;
  const hfProbe = useOpenRouter
    ? { configured: false, ok: false, reason: "skipped" }
    : hfAccount;

  const rows = await Promise.all(probeCatalog.map((m) => probeModelEntry(m, hfProbe)));

  return {
    primaryProvider: useOpenRouter ? "openrouter" : hfAccount.configured ? "huggingface" : "none",
    hfAccount,
    openRouterAccount,
    models: rows
      .filter(Boolean)
      .sort((a, b) => {
        if (a.ok !== b.ok) return a.ok ? -1 : 1;
        if (a.openrouter !== b.openrouter) return a.openrouter ? -1 : 1;
        if (a.score !== b.score) return b.score - a.score;
        return (a.tier || 99) - (b.tier || 99);
      }),
  };
}

async function getFullStatus(userId = "default") {
  const { primaryProvider, hfAccount, openRouterAccount, models: modelComparison } =
    await probeAllModels();
  const globalScripts = readGlobalScripts();
  const mem = readMemory(userId);
  const runPipeline = mem.agentsEnabled && mem.agents?.length;
  const activeModelIds = runPipeline
    ? [...new Set(mem.agents.map((a) => a.model).filter(Boolean))]
    : [mem.settings.model || DEFAULT_OR_MODEL];
  const allPools = allModelPools(userId);
  const orPrimary = primaryProvider === "openrouter";
  const modelPools = allPools.filter((p) => {
    if (orPrimary && !p.modelId.startsWith("or-")) return false;
    return p.hourCount > 0 || p.dayCount > 0 || activeModelIds.includes(p.modelId);
  });
  return {
    app: APP_NAME,
    ok: true,
    timestamp: new Date().toISOString(),
    primaryProvider,
    hfAccount,
    openRouterAccount,
    providers: modelComparison,
    modelComparison,
    activeModelIds,
    clock: {
      serverTime: new Date().toISOString(),
      hourBucket: clockHourBucket(),
      dayBucket: clockDayBucket(),
      hourResetSeconds: secondsUntilNextClockHour(),
      dayResetSeconds: secondsUntilNextClockDay(),
    },
    rateLimit: allPools,
    modelPools,
    globalScriptCount: globalScripts.length,
    env: {
      port: process.env.PORT || 3848,
      hasHfToken: Boolean(hfKey()),
      hasOpenRouterKey: openrouterConfigured(),
      openRouterKeyPool: keyPoolStatus(DEFAULT_OR_MODEL),
      openRouterModelKeyPools: allModelKeyPools(),
      hasDiscordSecret: Boolean(process.env.DISCORD_WEBHOOK_SECRET),
      hasDiscordOutbound: Boolean(process.env.DISCORD_OUTBOUND_WEBHOOK_URL),
    },
  };
}

module.exports = {
  getFullStatus,
  probeModel: probeModelEntry,
  probeAllModels,
  probeHfAccount,
  probeOpenRouterAccount,
};
