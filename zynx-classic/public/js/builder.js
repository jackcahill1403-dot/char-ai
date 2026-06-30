const logEl = document.getElementById("agent-log");
const formEl = document.getElementById("agent-form");
const inputEl = document.getElementById("agent-input");
const sendBtn = document.getElementById("agent-send");
const stopBtn = document.getElementById("agent-stop");
const statusEl = document.getElementById("agent-status");
const errorEl = document.getElementById("error");
const cwdEl = document.getElementById("agent-cwd");

// Full OpenAI-style message history the agent reasons over.
let convo = [];
let running = false;
let cancelled = false;
const MAX_STEPS = 25;

function esc(t) {
  return String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function clearEmpty() {
  logEl.querySelector(".agent-empty")?.remove();
}

function addCard(html, cls = "") {
  clearEmpty();
  const li = document.createElement("li");
  li.className = `agent-card ${cls}`.trim();
  li.innerHTML = html;
  logEl.appendChild(li);
  li.scrollIntoView({ behavior: "smooth", block: "end" });
  return li;
}

function addUser(text) {
  addCard(`<div class="agent-role">You</div><div class="agent-text">${esc(text)}</div>`, "is-user");
}

function addAssistant(text) {
  addCard(
    `<div class="agent-role">Atlas</div><div class="agent-text md-body">${formatMessageContent(text)}</div>`,
    "is-assistant"
  );
}

function setRunning(on) {
  running = on;
  sendBtn.disabled = on;
  inputEl.disabled = on;
  stopBtn.hidden = !on;
  statusEl.textContent = on ? "Thinking…" : "";
}

// Pretty label + body for a proposed tool call
function describeTool(name, args) {
  switch (name) {
    case "read_file":
      return { title: `Read file`, body: esc(args.path), danger: false };
    case "list_dir":
      return { title: `List directory`, body: esc(args.path || "."), danger: false };
    case "write_file":
      return {
        title: `Write file`,
        body: `${esc(args.path)}\n\n${esc(String(args.content ?? "").slice(0, 1200))}${String(args.content ?? "").length > 1200 ? "\n…" : ""}`,
        danger: true,
      };
    case "run_command":
      return { title: `Run command`, body: `$ ${esc(args.command)}${args.cwd ? `\n(in ${esc(args.cwd)})` : ""}`, danger: true };
    case "delete_path":
      return { title: `Delete`, body: esc(args.path), danger: true };
    default:
      return { title: name, body: esc(JSON.stringify(args)), danger: true };
  }
}

// Show approval card, resolve true/false on click
function askApproval(name, args) {
  return new Promise((resolve) => {
    const { title, body, danger } = describeTool(name, args);
    const li = addCard(
      `<div class="agent-tool-head ${danger ? "is-danger" : ""}">
         <span class="agent-tool-name">${esc(title)}</span>
         <span class="agent-tool-tag">${danger ? "needs approval" : "read-only"}</span>
       </div>
       <pre class="agent-tool-body">${body}</pre>
       <div class="agent-tool-actions">
         <button type="button" class="btn-send agent-approve">Approve</button>
         <button type="button" class="btn-ghost btn-sm agent-reject">Reject</button>
       </div>`,
      "is-tool"
    );
    const finish = (ok) => {
      li.querySelector(".agent-tool-actions").innerHTML = `<span class="agent-tool-verdict">${ok ? "✓ approved" : "✕ rejected"}</span>`;
      resolve(ok);
    };
    li.querySelector(".agent-approve").addEventListener("click", () => finish(true));
    li.querySelector(".agent-reject").addEventListener("click", () => finish(false));
  });
}

function addToolResult(name, output, ok) {
  addCard(
    `<div class="agent-result-head">${ok ? "Result" : "Error"} · <code>${esc(name)}</code></div>
     <pre class="agent-result-body ${ok ? "" : "is-error"}">${esc(String(output).slice(0, 6000))}</pre>`,
    "is-result"
  );
}

async function runLoop() {
  for (let step = 0; step < MAX_STEPS; step++) {
    if (cancelled) {
      statusEl.textContent = "Stopped.";
      return;
    }
    statusEl.textContent = "Thinking…";
    let data;
    try {
      data = await api("/api/agent/step", { method: "POST", body: JSON.stringify({ messages: convo }) });
    } catch (err) {
      showError(errorEl, err.message);
      return;
    }
    const msg = data.message;
    convo.push(msg);

    const calls = msg.tool_calls || [];
    if (!calls.length) {
      if (msg.content) addAssistant(msg.content);
      statusEl.textContent = "Done.";
      return;
    }

    // Model may narrate before calling a tool
    if (msg.content && msg.content.trim()) addAssistant(msg.content);

    for (const call of calls) {
      if (cancelled) {
        statusEl.textContent = "Stopped.";
        return;
      }
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      const name = call.function.name;

      statusEl.textContent = "Waiting for your approval…";
      const ok = await askApproval(name, args);
      if (!ok) {
        convo.push({ role: "tool", tool_call_id: call.id, content: "User rejected this action. Do not retry it; consider an alternative or ask the user." });
        continue;
      }

      statusEl.textContent = `Running ${name}…`;
      let exec;
      try {
        exec = await api("/api/agent/execute", { method: "POST", body: JSON.stringify({ name, arguments: args }) });
      } catch (err) {
        exec = { ok: false, output: `Error: ${err.message}` };
      }
      addToolResult(name, exec.output, exec.ok);
      convo.push({ role: "tool", tool_call_id: call.id, content: String(exec.output).slice(0, 8000) });
    }
  }
  statusEl.textContent = `Stopped after ${MAX_STEPS} steps.`;
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (running) return;
  const task = inputEl.value.trim();
  if (!task) return;
  hideError(errorEl);
  addUser(task);
  convo.push({ role: "user", content: task });
  inputEl.value = "";
  cancelled = false;
  setRunning(true);
  try {
    await runLoop();
  } finally {
    setRunning(false);
  }
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

stopBtn.addEventListener("click", () => {
  cancelled = true;
  statusEl.textContent = "Stopping…";
});

(async () => {
  try {
    const info = await api("/api/agent/info");
    if (cwdEl) cwdEl.textContent = info.cwd;
    initTheme(info.theme);
  } catch {
    if (cwdEl) cwdEl.textContent = "(unknown)";
  }
  if (typeof initTheme === "function") initTheme();
})();
