const { getProvider, hfFallbackOrder, freeFallbackOrder } = require("./models");
const { siblingFallbackOrder, isOpenRouterModel } = require("./model-fallback");
const { get } = require("./env");
const { classifyHttpError, parseProviderErrorBody } = require("./errors");
const { modeSystemPrompt } = require("./responder");
const {
  getActiveKeyEntry,
  shouldRotateKey,
  markKeyExhausted,
  listKeysForModel,
} = require("./openrouter-keys");
const { APP_NAME } = require("./branding");

function shouldTryFallback(reason) {
  return [
    "no_key",
    "insufficient_balance",
    "auth_failed",
    "invalid_model",
    "empty_reply",
    "rate_limited",
    "network",
  ].includes(reason);
}

function buildFallbackOrder(preferredId) {
  const preferred = getProvider(preferredId);
  const hfIds = hfFallbackOrder();
  const freeIds = freeFallbackOrder();
  const siblings = siblingFallbackOrder(preferredId);

  if (isOpenRouterModel(preferredId)) {
    const rest = [...hfIds, ...freeIds].filter(
      (id) => id !== preferredId && !siblings.includes(id)
    );
    return [preferredId, ...siblings, ...rest];
  }

  if (preferred.free) {
    return [preferredId, ...freeIds.filter((id) => id !== preferredId)];
  }
  if (preferred.hf) {
    return [preferredId, ...hfIds.filter((id) => id !== preferredId), ...freeIds];
  }
  return [preferredId, ...hfIds, ...freeIds.filter((id) => id !== preferredId)];
}

const { tokenBudget } = require("./ai-quality");

async function fetchProviderStream(p, key, body, onStream) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (p.openrouter) {
    headers["HTTP-Referer"] = get("OPENROUTER_REFERRER") || "http://localhost:3848";
    headers["X-Title"] = get("OPENROUTER_APP_TITLE") || APP_NAME;
  }

  let res;
  try {
    res = await fetch(p.url(), {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, stream: true }),
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: err.message, provider: p.id, model: p.model() };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const reason = classifyHttpError(res.status, errText);
    const { message } = parseProviderErrorBody(errText);
    return {
      ok: false,
      reason,
      httpStatus: res.status,
      detail: message || errText.slice(0, 300),
      provider: p.id,
      model: p.model(),
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) {
          full += delta;
          onStream(delta);
        }
      } catch {
        /* skip */
      }
    }
  }

  if (!full.trim()) {
    return { ok: false, reason: "empty_reply", provider: p.id, model: p.model() };
  }
  return { ok: true, content: full.trim(), provider: p.id, model: p.model(), streamed: true };
}

async function fetchProviderOnce(p, key, body, onStream) {
  if (onStream && p.openrouter) {
    return fetchProviderStream(p, key, body, onStream);
  }

  const headers = { "Content-Type": "application/json" };
  if (!p.noAuth && key) {
    headers.Authorization = `Bearer ${key}`;
  }
  if (p.openrouter) {
    headers["HTTP-Referer"] = get("OPENROUTER_REFERRER") || "http://localhost:3848";
    headers["X-Title"] = get("OPENROUTER_APP_TITLE") || APP_NAME;
  }

  let res;
  try {
    res = await fetch(p.url(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "network",
      detail: err.message,
      provider: p.id,
      model: p.model(),
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const reason = classifyHttpError(res.status, errText);
    const { message } = parseProviderErrorBody(errText);
    return {
      ok: false,
      reason,
      httpStatus: res.status,
      detail: message || errText.slice(0, 300),
      provider: p.id,
      model: p.model(),
    };
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    return { ok: false, reason: "empty_reply", provider: p.id, model: p.model() };
  }
  return { ok: true, content: reply, provider: p.id, model: p.model() };
}

async function callOpenRouterProvider(p, body, onStream) {
  const modelId = p.id;
  const pool = listKeysForModel(modelId);
  if (!pool.keys.length) {
    return { ok: false, reason: "no_key", provider: p.id, model: p.model() };
  }

  const tried = new Set();
  let last = null;

  while (tried.size < pool.keys.length) {
    const entry = getActiveKeyEntry(modelId);
    if (!entry || tried.has(entry.index)) break;
    tried.add(entry.index);

    const result = await fetchProviderOnce(p, entry.key, body, onStream);
    if (result.ok) {
      return {
        ...result,
        orKeySlot: entry.index + 1,
        orKeyTotal: entry.total,
        orKeySource: entry.source,
        orKeyModel: modelId,
      };
    }

    last = result;
    if (shouldRotateKey(result.reason)) {
      markKeyExhausted(modelId, entry.index);
      continue;
    }
    break;
  }

  return (
    last || {
      ok: false,
      reason: "insufficient_balance",
      detail: `All OpenRouter keys exhausted for ${modelId}`,
      provider: p.id,
      model: p.model(),
    }
  );
}

async function callProvider(providerId, messages, system, mode, opts = {}) {
  const p = getProvider(providerId);
  const taskType = opts.taskType || "general";
  const maxTokens = opts.maxTokens || tokenBudget(taskType);

  const body = {
    model: p.model(),
    messages: [{ role: "system", content: system }, ...messages],
    max_tokens: maxTokens,
    temperature: taskType === "coding" ? 0.35 : 0.6,
  };

  if (p.openrouter) {
    return callOpenRouterProvider(p, body, opts.onStream);
  }

  const key = p.apiKey();
  if (!p.noAuth && !key) {
    return { ok: false, reason: "no_key", provider: p.id, model: p.model() };
  }

  return fetchProviderOnce(p, key, body, opts.onStream);
}

async function callProviderWithFallback(preferredId, messages, system, mode, opts = {}) {
  const order = [...new Set(buildFallbackOrder(preferredId))];
  const onFallback = opts.onFallback;

  let last = null;
  for (const id of order) {
    const result = await callProvider(id, messages, system, mode, opts);
    if (result.ok) {
      if (id !== preferredId && onFallback) {
        onFallback({ from: preferredId, to: id });
      }
      return {
        ...result,
        requestedProvider: preferredId,
        fallback: id !== preferredId,
        fallbackFrom: id !== preferredId ? preferredId : undefined,
        fallbackTo: id !== preferredId ? id : undefined,
      };
    }
    last = result;
    if (!shouldTryFallback(result.reason)) break;
  }
  return last;
}

async function callModel(providerId, messages, mode, displayName, opts = {}) {
  const extra = opts.extraContext || "";
  const system = modeSystemPrompt(mode, displayName, extra);
  return callProviderWithFallback(providerId, messages, system, mode, opts);
}

async function callAgent(providerId, messages, agentRole, mode, displayName, agentName, opts = {}) {
  const extra = opts.extraContext || "";
  const system = [
    modeSystemPrompt(mode, displayName, extra),
    "",
    `Agent name: ${agentName}`,
    `Your job: ${agentRole}`,
    "You are one step in a multi-agent pipeline. Use prior agent outputs in the user message. Stay in your role only. Output complete files in fenced blocks when coding.",
  ].join("\n");
  return callProviderWithFallback(providerId, messages, system, mode, {
    ...opts,
    taskType: opts.taskType || "dev-team",
  });
}

module.exports = { callModel, callAgent, callProvider, callProviderWithFallback };
