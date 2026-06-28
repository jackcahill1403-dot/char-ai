const { getProvider } = require("./models");

function providerLabel(id) {
  if (!id) return "Provider";
  try {
    return getProvider(id).label || id;
  } catch {
    return id;
  }
}

function parseProviderErrorBody(detail) {
  const raw = String(detail || "").trim();
  if (!raw) return { message: "", code: "" };
  try {
    const data = JSON.parse(raw);
    const err = data?.error;
    if (typeof err === "string") return { message: err, code: "" };
    if (err && typeof err === "object") {
      return {
        message: String(err.message || err.msg || "").trim(),
        code: String(err.code || err.type || "").trim(),
      };
    }
    if (data.message) return { message: String(data.message), code: "" };
  } catch {
    /* plain text body */
  }
  return { message: raw.slice(0, 300), code: "" };
}

function classifyHttpError(status, detail) {
  const { message, code } = parseProviderErrorBody(detail);
  const m = message.toLowerCase();
  const c = code.toLowerCase();

  if (
    m.includes("insufficient balance") ||
    m.includes("insufficient quota") ||
    m.includes("exceeded your current quota") ||
    m.includes("billing") ||
    m.includes("payment") ||
    m.includes("credit") ||
    c.includes("insufficient")
  ) {
    return "insufficient_balance";
  }
  if (m.includes("rate limit") || m.includes("too many requests") || status === 429) {
    return "rate_limited";
  }
  if (status === 401 || status === 403 || m.includes("invalid api key") || m.includes("authentication")) {
    return "auth_failed";
  }
  if (m.includes("model") && (m.includes("not found") || m.includes("does not exist") || m.includes("invalid"))) {
    return "invalid_model";
  }
  if (status === 402) return "insufficient_balance";
  return `http_${status}`;
}

function friendlyLlmError(reason, detail, providerId) {
  const label = providerLabel(providerId);
  const { message } = parseProviderErrorBody(detail);
  const m = message.toLowerCase();

  if (reason === "no_key") {
    if (providerId?.startsWith("or-") || providerId === "openrouter") {
      return `${label}: add OPENROUTER_API_KEY to .env — free at openrouter.ai (any email or Google).`;
    }
    if (providerId === "gemini") {
      return `${label}: add GEMINI_API_KEY to .env — free at aistudio.google.com/apikey.`;
    }
    return `${label}: no API key. Add it in Atlas <code>.env</code> and restart.`;
  }
  if (reason === "insufficient_balance" || m.includes("insufficient balance")) {
    if (providerId && !String(providerId).startsWith("hf-") && providerId !== "glm") {
      return `${label}: out of credits or quota — check provider dashboard.`;
    }
    return `${label}: Hugging Face credits depleted. Can't pay? Settings → OpenRouter or Gemini (free). Turn off dev team on Agents page.`;
  }
  if (reason === "rate_limited" || reason === "http_429") {
    if (m.includes("insufficient balance")) {
      return `${label}: account out of credits. Top up or switch model in Agents.`;
    }
    return `${label}: rate limited — wait a few minutes or switch model.`;
  }
  if (reason === "auth_failed" || reason === "http_401" || reason === "http_403") {
    if (m.includes("inference providers")) {
      return `${label}: Hugging Face token needs “Inference Providers” → huggingface.co/settings/tokens`;
    }
    return `${label}: auth failed — check API key in .env.`;
  }
  if (reason === "invalid_model" || reason === "http_404") {
    return `${label}: model name invalid. Check HF_MODEL_* overrides or HF_CUSTOM_MODEL in .env.`;
  }
  if (reason === "http_400" && m.includes("insufficient")) {
    return `${label}: account out of credits. Top up or switch model in Agents.`;
  }
  if (reason === "network") {
    if (providerId === "ollama") {
      return `${label}: can't reach Ollama — install from ollama.com, run \`ollama pull llama3.2\`, keep it running.`;
    }
    return `${label}: network error — check internet and API URL in .env.`;
  }
  if (reason === "empty_reply") {
    return `${label}: empty reply — try again or another model.`;
  }
  if (message) {
    return `${label}: ${message.slice(0, 160)}`;
  }
  return `${label}: ${reason || "request failed"}`;
}

module.exports = {
  friendlyLlmError,
  parseProviderErrorBody,
  classifyHttpError,
  providerLabel,
};
