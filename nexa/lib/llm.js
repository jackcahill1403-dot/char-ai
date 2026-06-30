const { get } = require("./env");
const { getModel, keyForModel } = require("./models");
const { systemPrompt } = require("./responder");
const { APP_NAME } = require("./branding");

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

function stripThink(content) {
  const thinking = [];
  const clean = String(content).replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    thinking.push(inner.trim());
    return "";
  });
  return { clean: clean.trim(), thinking: thinking.length ? thinking.join("\n\n") : null };
}

// Call an OpenRouter model. onStream(delta) => streaming; omit for one-shot.
async function callModel(modelId, messages, { displayName, customPrompt, plugins, onStream } = {}) {
  const m = getModel(modelId);
  const key = keyForModel(modelId);
  if (!key) {
    return { ok: false, reason: "no_key", detail: `No OpenRouter key for ${m.label}. Set ${m.keyEnv} or OPENROUTER_API_KEY.` };
  }

  const body = {
    model: m.model,
    messages: [{ role: "system", content: systemPrompt(displayName, customPrompt, plugins) }, ...messages],
    temperature: 0.4,
    max_tokens: 3000,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": get("OPENROUTER_REFERRER") || "http://localhost:3849",
    "X-Title": get("OPENROUTER_APP_TITLE") || APP_NAME,
  };

  if (onStream) {
    return streamCall(m, headers, body, onStream);
  }

  let res;
  try {
    res = await fetch(OR_URL, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (err) {
    return { ok: false, reason: "network", detail: err.message };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: "http_error", httpStatus: res.status, detail: text.slice(0, 300) };
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) return { ok: false, reason: "empty_reply", detail: "No content returned." };
  const { clean, thinking } = stripThink(reply);
  return { ok: true, content: clean, thinking, model: m.model, modelId };
}

async function streamCall(m, headers, body, onStream) {
  let res;
  try {
    res = await fetch(OR_URL, { method: "POST", headers, body: JSON.stringify({ ...body, stream: true }) });
  } catch (err) {
    return { ok: false, reason: "network", detail: err.message };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: "http_error", httpStatus: res.status, detail: text.slice(0, 300) };
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
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
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

  if (!full.trim()) return { ok: false, reason: "empty_reply", detail: "No content streamed." };
  const { clean, thinking } = stripThink(full.trim());
  return { ok: true, content: clean, thinking, model: m.model, modelId: body.__id, streamed: true };
}

module.exports = { callModel };
