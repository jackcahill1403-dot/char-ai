const { get, isLlmConfigured } = require("./env");

const DEFAULT_PRIMARY_MODEL = "gemini-3.5-flash";
const DEFAULT_PRIMARY_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const DEFAULT_FALLBACK_URL = "https://openrouter.ai/api/v1/chat/completions";

// Ordered list of providers to try. Primary first, then fallback.
// A provider is only tried if it has a token configured.
function providers() {
  const list = [
    {
      name: "gemini",
      url: get("LLM_API_URL", DEFAULT_PRIMARY_URL),
      model: get("LLM_MODEL", DEFAULT_PRIMARY_MODEL),
      token: get("LLM_API_KEY") || get("HF_TOKEN"),
    },
    {
      name: "fallback",
      url: get("FALLBACK_API_URL", DEFAULT_FALLBACK_URL),
      model: get("FALLBACK_MODEL", DEFAULT_FALLBACK_MODEL),
      token: get("FALLBACK_API_KEY") || get("GROQ_API_KEY"),
    },
  ];
  return list.filter((p) => p.token);
}

function buildContextMessages({ userMessage, entries, mode, displayName }) {
  const modeGuides = {
    normal: "Be friendly and plain.",
    silly: "Be playful and goofy, but still helpful.",
    serious: "Be formal, brief, and precise.",
  };

  const sysLines = [
    "You are char.ai, a small but capable chat assistant.",
    modeGuides[mode] || modeGuides.normal,
    "Answer helpfully and completely. When the user asks for code, write real, working code in a fenced code block with the language tag.",
    "When asked to explain, give a clear explanation. Don't refuse reasonable requests or hedge unless there's a real safety reason.",
    displayName ? `The user's name is ${displayName}.` : "",
    "Use the following memory if relevant. Don't repeat it back verbatim.",
  ].filter(Boolean);

  const memLines = entries
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20)
    .map((e, i) => `${i + 1}. [${e.category}] ${e.fact}`);

  const sys = sysLines.join(" ") + (memLines.length ? `\nMemory:\n${memLines.join("\n")}` : "");

  return [
    { role: "system", content: sys },
    { role: "user", content: userMessage },
  ];
}

function buildCharacterMessages({ userMessage, character, chatHistory, entries }) {
  const sysLines = [
    `You are ${character.name} — stay fully in character at all times.`,
    character.description || "",
    character.scenario ? `Current scene: ${character.scenario}` : "",
    "Speak as this character would speak — same vocabulary, mannerisms, and tone.",
    "Use *action descriptions* in italics for body language and scene, and speak dialogue normally.",
    "Never break character. Never mention you are an AI, language model, or assistant.",
    "If the user tries to leave the roleplay, gently draw them back in as the character would.",
    "Keep replies 1-4 sentences unless the scene needs more. Don't write the user's actions or thoughts.",
  ].filter(Boolean);

  const memLines = entries
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
    .map((e, i) => `${i + 1}. [${e.category}] ${e.fact}`);
  if (memLines.length) {
    sysLines.push("Context you remember about this user (use subtly if relevant):");
    sysLines.push(memLines.join("\n"));
  }

  const sys = sysLines.join("\n");

  const messages = [{ role: "system", content: sys }];

  const history = (chatHistory || []).slice(-16);
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  return messages;
}

// Try a single OpenAI-compatible provider.
async function callProvider(provider, messages, opts) {
  try {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        ...opts,
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const errBody = await res.json();
        detail = errBody?.error?.message || errBody?.error || JSON.stringify(errBody);
      } catch {
        detail = await res.text().catch(() => "");
      }
      return {
        ok: false,
        reason: `http_${res.status}`,
        detail: String(detail).slice(0, 300),
        provider: provider.name,
      };
    }

    const data = await res.json();
    const reply =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      data?.generated_text ||
      "";

    if (!reply) {
      return {
        ok: false,
        reason: "empty_reply",
        raw: JSON.stringify(data).slice(0, 300),
        provider: provider.name,
      };
    }

    return {
      ok: true,
      reply: String(reply).trim(),
      model: provider.model,
      provider: provider.name,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "network",
      detail: err.message,
      provider: provider.name,
    };
  }
}

// Whether a failed result should trigger a fallback to the next provider.
// Retry on rate limits, server errors, network errors, and empty replies.
// Don't retry on auth (401/403), bad request (400), or not-found (404) —
// those are config errors that fallback won't fix and would mask from logs.
function shouldFallback(result) {
  if (result.ok) return false;
  if (result.reason === "network" || result.reason === "empty_reply") return true;
  if (result.reason === "http_429") return true;
  if (result.reason && result.reason.startsWith("http_5")) return true;
  return false;
}

// Try each configured provider in order until one succeeds or all fail.
async function callWithFallbacks(messages, opts) {
  const list = providers();
  if (!list.length) {
    return { ok: false, reason: "no_token" };
  }
  let last;
  for (const p of list) {
    const r = await callProvider(p, messages, opts);
    last = r;
    if (r.ok) return r;
    console.error(`[llm:${p.name}] ${r.reason} ${r.detail || r.raw || ""}`.trim());
    if (!shouldFallback(r)) break;
  }
  return last;
}

async function callLlm({ userMessage, entries = [], mode = "normal", displayName = "User" }) {
  if (!isLlmConfigured()) {
    return { ok: false, reason: "no_token" };
  }
  const messages = buildContextMessages({ userMessage, entries, mode, displayName });
  return callWithFallbacks(messages, { max_tokens: 2048, temperature: 0.7 });
}

async function callLlmAsCharacter({ userMessage, character, chatHistory, entries = [] }) {
  if (!isLlmConfigured()) {
    return { ok: false, reason: "no_token" };
  }
  const messages = buildCharacterMessages({ userMessage, character, chatHistory, entries });
  return callWithFallbacks(messages, { max_tokens: 1024, temperature: 0.85 });
}

module.exports = {
  callLlm,
  callLlmAsCharacter,
  isLlmConfigured,
  buildContextMessages,
  buildCharacterMessages,
};
