// Nexa plugins — toggleable capability packs. Each enabled plugin appends
// focused instructions to the system prompt, sharpening Nexa for that workflow.
const PLUGINS = [
  {
    id: "better-files",
    name: "Better File Management",
    blurb: "Folder structures, naming conventions, and cleanup plans.",
    icon: "📁",
    addon:
      "FILE MANAGEMENT: When organising files or folders, propose a clear directory tree, a consistent naming convention (e.g. YYYY-MM-DD_project_topic), and a concrete step-by-step cleanup/migration plan. Call out duplicates, stale files, and where things belong.",
  },
  {
    id: "calendar",
    name: "Calendar & Time-Blocking",
    blurb: "Turn tasks into scheduled time blocks with deadlines.",
    icon: "🗓️",
    addon:
      "SCHEDULING: Convert tasks into time blocks across a day or week. Estimate durations, sequence by priority and energy, leave buffers, and flag deadline risks. Present as a simple schedule table (time · task · duration).",
  },
  {
    id: "meetings",
    name: "Meeting Mode",
    blurb: "Agendas, minutes, and tracked action items.",
    icon: "📝",
    addon:
      "MEETINGS: Produce tight agendas (topic · owner · minutes) and, from notes, structured minutes with decisions and an action-item table (action · owner · due). Keep it skimmable.",
  },
  {
    id: "kanban",
    name: "Kanban Boards",
    blurb: "Lay work out as Backlog / Doing / Done columns.",
    icon: "📊",
    addon:
      "KANBAN: When tracking work in progress, present it as board columns — Backlog, To do, Doing, Blocked, Done — as a markdown table or grouped lists. Each card is a short verb phrase.",
  },
  {
    id: "gtd",
    name: "GTD / Inbox Zero",
    blurb: "Capture, clarify, and sort a brain-dump the GTD way.",
    icon: "✅",
    addon:
      "GTD: Process brain-dumps using Getting Things Done — Capture, Clarify (is it actionable?), Organise (Next action / Project / Waiting-for / Someday / Reference), and surface the single next action per project.",
  },
  {
    id: "templates",
    name: "Plan Templates",
    blurb: "Reusable templates for sprints, launches, and routines.",
    icon: "🧩",
    addon:
      "TEMPLATES: Offer reusable, fill-in templates for recurring workflows (weekly sprint, project launch, daily routine, retro). Keep placeholders in [brackets] so the user can copy and adapt them.",
  },
];

function listPlugins(enabledIds = []) {
  const set = new Set(enabledIds);
  return PLUGINS.map((p) => ({
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    icon: p.icon,
    enabled: set.has(p.id),
  }));
}

function validPluginIds() {
  return PLUGINS.map((p) => p.id);
}

function pluginPromptBlock(enabledIds = []) {
  const set = new Set(enabledIds);
  const active = PLUGINS.filter((p) => set.has(p.id));
  if (!active.length) return "";
  return "\n\nActive plugins (apply when relevant):\n" + active.map((p) => `- ${p.addon}`).join("\n");
}

module.exports = { PLUGINS, listPlugins, validPluginIds, pluginPromptBlock };
