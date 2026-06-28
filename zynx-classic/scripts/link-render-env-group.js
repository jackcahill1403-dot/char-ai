#!/usr/bin/env node
/**
 * Link a Render environment group to the Atlas web service.
 *
 * Usage:
 *   node scripts/link-render-env-group.js evg-xxx
 *   node scripts/link-render-env-group.js evg-xxx srv-yyy
 *
 * Set in zynx-classic/.env:
 *   RENDER_API_KEY=rnd_...
 *   RENDER_SERVICE_ID=srv_...   (optional — auto-finds service named "atlas")
 */

const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function api(apiKey, method, urlPath, body) {
  const res = await fetch(`https://api.render.com/v1${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Render API ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function findAtlasServiceId(apiKey) {
  let cursor;
  for (let page = 0; page < 20; page++) {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const data = await api(apiKey, "GET", `/services${q}`);
    const rows = Array.isArray(data) ? data : data.services || [];
    for (const row of rows) {
      const s = row.service || row;
      const name = (s.name || "").toLowerCase();
      if (name === "atlas" || name.includes("atlas")) {
        return s.id;
      }
    }
    cursor = data.cursor;
    if (!cursor) break;
  }
  return null;
}

async function main() {
  const envGroupId = process.argv[2];
  let serviceId = process.argv[3];
  const fileEnv = parseEnvFile(ENV_FILE);
  const apiKey = process.env.RENDER_API_KEY || fileEnv.RENDER_API_KEY;

  if (!envGroupId || !envGroupId.startsWith("evg-")) {
    console.error("Usage: node scripts/link-render-env-group.js evg-xxxxxxxx");
    process.exit(1);
  }
  if (!apiKey) {
    console.error("Add RENDER_API_KEY=rnd_... to zynx-classic/.env");
    process.exit(1);
  }

  serviceId = serviceId || process.env.RENDER_SERVICE_ID || fileEnv.RENDER_SERVICE_ID;
  if (!serviceId) {
    console.log('Looking for Render service named "atlas"...');
    serviceId = await findAtlasServiceId(apiKey);
  }
  if (!serviceId) {
    console.error('Could not find Atlas service. Pass service id: node scripts/link-render-env-group.js evg-... srv-...');
    process.exit(1);
  }

  console.log(`Linking ${envGroupId} → service ${serviceId}...`);
  const result = await api(
    apiKey,
    "POST",
    `/env-groups/${envGroupId}/services/${serviceId}`
  );
  const group = result.envGroup || result;
  console.log("Linked OK.");
  if (group.name) console.log("  Group:", group.name);
  if (group.envVars?.length) {
    console.log("  Vars in group:", group.envVars.map((v) => v.key || v.envVar?.key).filter(Boolean).join(", "));
  }
  console.log("Render will redeploy the service.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
