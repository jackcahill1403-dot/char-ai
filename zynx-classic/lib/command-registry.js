const CODE_HINT =
  /\b(code|function|implement|fix|bug|refactor|api|endpoint|component|script|test)\b/i;

/** @typedef {{ id: string, usage: string, desc: string, free?: boolean, plugin?: string, always?: boolean }} CommandDef */

/** @type {CommandDef[]} */
const COMMANDS = [
  { id: "help", usage: "!", desc: "List commands you can use", always: true, free: true },
  { id: "help", usage: "!help", desc: "Same as !", always: true, free: true },
  { id: "agents", usage: "!agents", desc: "Turn dev team on", always: true, free: true },
  { id: "agents-task", usage: "!agents <task>", desc: "Run dev team on a task (1 message)", always: true },
  {
    id: "agents-continue",
    usage: "!agents continue <slug> -- <task>",
    desc: "Continue from a saved script",
    always: true,
  },
  { id: "scripts", usage: "!scripts", desc: "List your saved scripts", always: true, free: true },
  { id: "save", usage: "!save <name>", desc: "Save last reply as script", always: true, free: true },
  { id: "run", usage: "!run <name>", desc: "Replay a script (FREE)", always: true, free: true },
  { id: "publish", usage: "!publish <name>", desc: "Publish script globally", always: true, free: true },
  { id: "read", usage: "!read <path>", desc: "Load a project file into context", always: true },
  { id: "remember", usage: "!remember <fact>", desc: "Save a fact for future chats", always: true, free: true },
  { id: "facts", usage: "!facts", desc: "Show long-term memory", always: true, free: true },
  {
    id: "route",
    usage: "!route <message>",
    desc: "Show which model auto-router would pick",
    always: true,
    free: true,
  },
  { id: "search", usage: "!search <query>", desc: "Web search (DuckDuckGo / Tavily)", always: true, free: true },
  { id: "summary", usage: "!summary", desc: "Show session brief for this chat", always: true, free: true },
];

function listAvailableCommands(installedPlugins = []) {
  const enabled = new Set(
    (installedPlugins || []).filter((p) => p.enabled !== false).map((p) => p.id)
  );
  const seen = new Set();
  const out = [];
  for (const cmd of COMMANDS) {
    if (cmd.plugin && !enabled.has(cmd.plugin)) continue;
    const key = cmd.usage;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cmd);
  }
  return out;
}

function formatCommandList(commands) {
  const lines = ["**Commands** (type `!` anytime)", ""];
  for (const c of commands) {
    const free = c.free ? " · FREE" : "";
    lines.push(`- \`${c.usage}\` — ${c.desc}${free}`);
  }
  lines.push("", "Plugin-only features apply when that plugin is installed + enabled.");
  return lines.join("\n");
}

module.exports = { COMMANDS, listAvailableCommands, formatCommandList };
