const { get } = require("./env");
const { getProvider } = require("./models");
const { TOOL_SCHEMAS } = require("./agent-tools");
const { APP_NAME } = require("./branding");
const {
  getActiveKeyEntry,
  shouldRotateKey,
  markKeyExhausted,
  listKeysForModel,
} = require("./openrouter-keys");
const { classifyHttpError, parseProviderErrorBody } = require("./errors");

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are ${APP_NAME}, an autonomous coding agent running on the user's PC. You can read, write, and delete files and run shell commands through the provided tools.

Rules:
- Work step by step. Use ONE tool at a time, then wait for its result before the next step.
- Before editing a file, read it first unless you are creating a new one.
- Prefer minimal, targeted changes. Explain briefly what you are doing.
- When the task is complete, reply with a short summary and NO further tool calls.
- Paths may be absolute or relative to the working directory. Commands run in a real shell — be careful.
- If a tool result shows an error, diagnose and adapt; do not repeat the same failing call.`;

async function rawOpenRouterCall(modelId, body) {
  const pool = listKeysForModel(modelId);
  if (!pool.keys.length) {
    return { ok: false, reason: "no_key", detail: `No OpenRouter key for ${modelId}` };
  }

  const provider = getProvider(modelId);
  const url = get("OPENROUTER_API_URL") || OR_URL;
  const tried = new Set();
  let last = null;

  while (tried.size < pool.keys.length) {
    const entry = getActiveKeyEntry(modelId);
    if (!entry || tried.has(entry.index)) break;
    tried.add(entry.index);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${entry.key}`,
          "HTTP-Referer": get("OPENROUTER_REFERRER") || "http://localhost:3848",
          "X-Title": get("OPENROUTER_APP_TITLE") || APP_NAME,
        },
        body: JSON.stringify({ ...body, model: provider.model() }),
      });
    } catch (err) {
      last = { ok: false, reason: "network", detail: err.message };
      continue;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const reason = classifyHttpError(res.status, errText);
      const { message } = parseProviderErrorBody(errText);
      last = { ok: false, reason, httpStatus: res.status, detail: message || errText.slice(0, 300) };
      if (shouldRotateKey(reason)) {
        markKeyExhausted(modelId, entry.index);
        continue;
      }
      break;
    }

    const data = await res.json();
    const message = data?.choices?.[0]?.message;
    if (!message) {
      last = { ok: false, reason: "empty_reply", detail: "No message in response" };
      continue;
    }
    return { ok: true, message };
  }

  return last || { ok: false, reason: "insufficient_balance", detail: "All keys exhausted" };
}

// One step of the agent loop: feed conversation, get back the assistant message
// (which may contain tool_calls). Does NOT execute anything.
async function agentStep(modelId, messages) {
  const body = {
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    tools: TOOL_SCHEMAS,
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: 4096,
  };
  return rawOpenRouterCall(modelId, body);
}

module.exports = { agentStep };
