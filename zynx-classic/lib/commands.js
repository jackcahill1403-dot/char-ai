const DEV_TEAM_ON_REPLY =
  "Dev team ON. Planner → Coders → Merger → Testers. Type `!` for commands.";

function parseAgentsCommand(content) {
  const trimmed = content.trim();
  if (!/^!agents(\s|$)/i.test(trimmed)) return null;
  let rest = trimmed.replace(/^!agents\s*/i, "").trim();

  const continueMatch = rest.match(/^continue\s+(\S+)\s*(?:--|—)\s*([\s\S]+)$/i);
  if (continueMatch) {
    return {
      task: continueMatch[2].trim(),
      continueFrom: continueMatch[1].trim(),
    };
  }

  return { task: rest };
}

function parseScriptCommand(content) {
  const trimmed = content.trim();
  const m = trimmed.match(/^!(save|run|publish|scripts)(?:\s+([\s\S]+))?$/i);
  if (!m) return null;
  return {
    action: m[1].toLowerCase(),
    arg: (m[2] || "").trim(),
  };
}

function parseHelpCommand(content) {
  const t = content.trim();
  if (t === "!" || /^!help\s*$/i.test(t)) return { action: "help" };
  return null;
}

function parseMetaCommand(content) {
  const trimmed = content.trim();

  const help = parseHelpCommand(trimmed);
  if (help) return help;

  const read = trimmed.match(/^!read\s+(\S.+)$/i);
  if (read) return { action: "read", arg: read[1].trim() };

  const remember = trimmed.match(/^!remember\s+([\s\S]+)$/i);
  if (remember) return { action: "remember", arg: remember[1].trim() };

  if (/^!facts\s*$/i.test(trimmed)) return { action: "facts" };

  const route = trimmed.match(/^!route\s+([\s\S]+)$/i);
  if (route) return { action: "route", arg: route[1].trim() };

  const search = trimmed.match(/^!search\s+([\s\S]+)$/i);
  if (search) return { action: "search", arg: search[1].trim() };

  if (/^!summary\s*$/i.test(trimmed)) return { action: "summary" };

  return null;
}

module.exports = {
  parseAgentsCommand,
  parseScriptCommand,
  parseHelpCommand,
  parseMetaCommand,
  DEV_TEAM_ON_REPLY,
};
