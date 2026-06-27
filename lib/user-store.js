const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const ACCOUNTS_DIR = path.join(DATA_DIR, "accounts");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeUserId(id) {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function accountFile(userId) {
  const id = sanitizeUserId(userId);
  if (!id) return null;
  return path.join(ACCOUNTS_DIR, `${id}.json`);
}

function getAccount(userId) {
  const file = accountFile(userId);
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
}

function makeSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function writeAccount(account) {
  ensureDir(ACCOUNTS_DIR);
  const file = accountFile(account.userId);
  fs.writeFileSync(file, JSON.stringify(account, null, 2), "utf8");
}

function register({ userId, password, displayName, avatar }) {
  const id = sanitizeUserId(userId);
  if (!id) throw new Error("Username must contain letters, numbers, _ or -.");
  if (id.length < 2) throw new Error("Username must be at least 2 characters.");
  if (id.length > 40) throw new Error("Username too long.");
  if (!password || password.length < 4) throw new Error("Password must be at least 4 characters.");
  if (getAccount(id)) throw new Error("That username is already taken.");

  const salt = makeSalt();
  const account = {
    userId: id,
    displayName: (displayName || id).slice(0, 40),
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    avatar: (avatar || "🙂").slice(0, 200000),
    createdAt: new Date().toISOString(),
  };
  writeAccount(account);
  return publicView(account);
}

function login({ userId, password }) {
  const id = sanitizeUserId(userId);
  const account = getAccount(id);
  if (!account) throw new Error("No account with that username.");
  const hash = hashPassword(password, account.passwordSalt);
  if (hash !== account.passwordHash) throw new Error("Wrong password.");
  return publicView(account);
}

function updateProfile(userId, updates) {
  const account = getAccount(userId);
  if (!account) throw new Error("Account not found.");

  if (typeof updates.displayName === "string") {
    const name = updates.displayName.trim();
    account.displayName = (name || account.userId).slice(0, 40);
  }
  if (typeof updates.avatar === "string") {
    const av = updates.avatar.trim();
    if (av) account.avatar = av.slice(0, 200000);
  }
  if (typeof updates.password === "string" && updates.password.length >= 4) {
    const salt = makeSalt();
    account.passwordSalt = salt;
    account.passwordHash = hashPassword(updates.password, salt);
  }
  writeAccount(account);
  return publicView(account);
}

function publicView(account) {
  return {
    userId: account.userId,
    displayName: account.displayName,
    avatar: account.avatar,
    createdAt: account.createdAt,
  };
}

function listAccounts() {
  if (!fs.existsSync(ACCOUNTS_DIR)) return [];
  const out = [];
  for (const file of fs.readdirSync(ACCOUNTS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const acc = JSON.parse(fs.readFileSync(path.join(ACCOUNTS_DIR, file), "utf8"));
      out.push(publicView(acc));
    } catch {
      /* skip */
    }
  }
  return out;
}

module.exports = {
  sanitizeUserId,
  register,
  login,
  getAccount,
  updateProfile,
  listAccounts,
  publicView,
};
