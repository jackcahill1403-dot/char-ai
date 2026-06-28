const MODE_STYLE = {
  normal: { prefix: "", suffix: "" },
  silly: { prefix: "🎉 ", suffix: " lol!! 🦄" },
  serious: { prefix: "Acknowledged. ", suffix: "" },
  caveman: { prefix: "", suffix: "" },
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function toCaveman(text) {
  let s = text
    .replace(/\b(I am|I'm)\b/gi, "me")
    .replace(/\b(you are|you're)\b/gi, "u")
    .replace(/\b(the|a|an)\b/gi, "")
    .replace(/\b(just|really|basically|actually|simply|certainly|sure)\b/gi, "")
    .replace(/\b(because|therefore|however)\b/gi, "→")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (s.length > 120) {
    const cut = s.slice(0, 117).replace(/\s+\S*$/, "");
    s = cut + "...";
  }
  return s || "ok.";
}

function buildReply(userMessage, mode) {
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  let body;

  if (!text) {
    body = mode === "caveman" ? "say something." : "I didn't catch that. Try typing something.";
  } else if (/^(hi|hello|hey)\b/.test(lower)) {
    body =
      mode === "caveman"
        ? pick(["hey.", "yo.", "hi."])
        : mode === "silly"
          ? pick(["HELLOOO!!!", "HEY HEY HEY!!!", "HIHIHI!!!"])
          : pick(["Hello!", "Hey there.", "Hi!"]);
  } else if (lower.includes("help")) {
    body =
      mode === "caveman"
        ? "chat here. settings → mode + model. HF_TOKEN in .env."
        : "Simple chat app. Pick a mode and model in Settings. Put `HF_TOKEN` in `.env`.";
  } else if (lower.includes("mode")) {
    body =
      mode === "caveman"
        ? `mode = ${mode}. settings change.`
        : `You're in **${mode}** mode. Change it on Settings.`;
  } else if (isQuestion(text)) {
    body =
      mode === "caveman"
        ? "no LLM key → mock only. add HF_TOKEN in .env."
        : pick([
            "No LLM key set — I'm on mock replies. Add an API key in `.env`.",
            "Mock brain only. Configure a model key to get real answers.",
          ]);
  } else {
    body =
      mode === "caveman"
        ? pick(["got.", "noted.", "ok."])
        : pick(["Got it.", "Noted.", "Okay."]);
  }

  if (mode === "silly" && body === body.toLowerCase()) {
    body = body.replace(/\./g, "!!!").toUpperCase();
  }
  if (mode === "serious") {
    body = body.replace(/!/g, ".");
  }
  if (mode === "caveman") {
    body = toCaveman(body);
  }

  const style = MODE_STYLE[mode] || MODE_STYLE.normal;
  return `${style.prefix}${body}${style.suffix}`;
}

function isQuestion(text) {
  return /\?\s*$/.test(text.trim());
}

const { projectContextBlock } = require("./project-context");
const { APP_NAME } = require("./branding");

function modeSystemPrompt(mode, displayName, extraContext = "", opts = {}) {
  const { taskType } = opts;
  const needsCoT = ["coding", "planning", "review", "dev-team", "long-task"].includes(taskType);

  const base = `You are ${APP_NAME}, a precise technical assistant specialising in software development. User: ${displayName || "User"}.

Output rules:
- Get to the point. Never open with "Sure!", "Great question!", "Certainly!", "Of course!" or similar filler.
- Always use fenced code blocks with the correct language tag (\`\`\`js, \`\`\`python, \`\`\`bash …). Output complete, working code — no pseudocode, no TODOs, no placeholder comments unless explicitly asked.
- For bugs: identify root cause → show the fix → include corrected working code.
- Use ## headers only when the response has 3 or more distinct sections. Short answers need no headers.
- When uncertain, say so and state your assumptions clearly — do not guess.
- Reuse context from prior messages and memory when relevant.${needsCoT ? "\n- Think through this problem step by step before writing your final answer." : ""}${projectContextBlock()}${extraContext}`;

  const modes = {
    normal: `${base}\nTone: direct and friendly.`,
    silly: `${base}\nTone: playful, energetic, occasional emoji — keep technical content accurate.`,
    serious: `${base}\nTone: formal and terse. No emoji. No pleasantries.`,
    caveman: `${base}\nTone: ultra-terse. Drop articles and filler words. Fragments OK. Technical terms exact. Code unchanged.`,
  };
  return modes[mode] || modes.normal;
}

module.exports = { buildReply, modeSystemPrompt, toCaveman };
