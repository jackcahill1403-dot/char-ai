const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { get } = require("./env");

// Base working directory for relative paths + commands. Absolute paths allowed (whole-PC).
function baseDir() {
  return get("AGENT_CWD") || process.cwd();
}

function resolvePath(p) {
  if (!p) throw new Error("path is required");
  return path.isAbsolute(p) ? p : path.resolve(baseDir(), p);
}

const MAX_READ = 200_000; // 200 KB
const CMD_TIMEOUT = 60_000; // 60 s

// ── Tool schemas (OpenAI function-calling format) ──────────────
const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file from disk and return its contents.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with the given contents. Creates parent folders as needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
          content: { type: "string", description: "Full file contents to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List the entries (files and folders) in a directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative directory path. Defaults to working dir." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command and return stdout/stderr. Runs on the user's PC.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_path",
      description: "Delete a file or folder (recursive). Irreversible.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative path to delete" },
        },
        required: ["path"],
      },
    },
  },
];

// Which tools change the machine — used by the UI to mark danger level.
const MUTATING = new Set(["write_file", "run_command", "delete_path"]);

// ── Executors ──────────────────────────────────────────────────
const EXECUTORS = {
  read_file(args) {
    const full = resolvePath(args.path);
    const stat = fs.statSync(full);
    if (stat.size > MAX_READ) {
      const buf = fs.readFileSync(full, "utf8").slice(0, MAX_READ);
      return `${buf}\n\n[truncated at ${MAX_READ} bytes — file is ${stat.size} bytes]`;
    }
    return fs.readFileSync(full, "utf8");
  },

  write_file(args) {
    const full = resolvePath(args.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, String(args.content ?? ""), "utf8");
    return `Wrote ${Buffer.byteLength(String(args.content ?? ""))} bytes to ${full}`;
  },

  list_dir(args) {
    const full = resolvePath(args.path || ".");
    const entries = fs.readdirSync(full, { withFileTypes: true });
    return entries
      .map((e) => `${e.isDirectory() ? "[dir] " : "      "}${e.name}`)
      .join("\n") || "(empty)";
  },

  run_command(args) {
    if (!args.command) throw new Error("command is required");
    const cwd = args.cwd ? resolvePath(args.cwd) : baseDir();
    try {
      const out = execSync(args.command, {
        cwd,
        timeout: CMD_TIMEOUT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      return out.trim() || "(no output — command succeeded)";
    } catch (err) {
      const stdout = err.stdout ? String(err.stdout) : "";
      const stderr = err.stderr ? String(err.stderr) : "";
      return `Command failed (exit ${err.status ?? "?"}):\n${stdout}${stderr}`.trim() || err.message;
    }
  },

  delete_path(args) {
    const full = resolvePath(args.path);
    fs.rmSync(full, { recursive: true, force: true });
    return `Deleted ${full}`;
  },
};

function executeTool(name, args) {
  const exec = EXECUTORS[name];
  if (!exec) throw new Error(`Unknown tool: ${name}`);
  return exec(args || {});
}

module.exports = { TOOL_SCHEMAS, MUTATING, executeTool, baseDir };
