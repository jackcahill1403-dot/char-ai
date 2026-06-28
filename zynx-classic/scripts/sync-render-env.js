#!/usr/bin/env node
/**
 * Sync OpenRouter env vars from zynx-classic/.env to a Render web service.
 *
 * Usage (PowerShell):
 *   $env:RENDER_API_KEY="rnd_..."
 *   $env:RENDER_SERVICE_ID="srv_..."
 *   node scripts/sync-render-env.js
 *
 * Get API key: https://dashboard.render.com/u/settings#api-keys
 * Service ID: Render dashboard → your service → URL contains srv-xxx or Settings
 */

const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error("Missing .env at", filePath);
    process.exit(1);
  }
  const out = {};
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

function openRouterVars(all) {
  const out = {};
  for (const [key, val] of Object.entries(all)) {
    if (!val) continue;
    if (key === "OPENROUTER_APP_TITLE" || key.startsWith("OPENROUTER_") || key === "TAVILY_API_KEY" || key === "GEMINI_API_KEY") {
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const all = parseEnvFile(ENV_FILE);
  const apiKey = process.env.RENDER_API_KEY || all.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID || all.RENDER_SERVICE_ID;
  if (!apiKey || !serviceId) {
    console.error("Add to zynx-classic/.env (or set env vars):");
    console.error("  RENDER_API_KEY=rnd_...");
    console.error("  RENDER_SERVICE_ID=srv_...");
    process.exit(1);
  }

  const vars = openRouterVars(all);
  const keys = Object.keys(vars);
  if (!keys.length) {
    console.error("No OPENROUTER_* keys found in .env");
    process.exit(1);
  }

  console.log(`Syncing ${keys.length} env vars to Render service ${serviceId}...`);

  for (const key of keys) {
    const res = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ envVar: { key, value: vars[key] } }),
    });

    if (res.status === 409 || res.status === 400) {
      const listRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      const list = await listRes.json();
      const existing = (list || []).find((row) => row.envVar?.key === key);
      if (existing?.envVar?.id) {
        const putRes = await fetch(
          `https://api.render.com/v1/services/${serviceId}/env-vars/${existing.envVar.id}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ value: vars[key] }),
          }
        );
        if (!putRes.ok) {
          const err = await putRes.text();
          console.error(`FAIL update ${key}:`, putRes.status, err);
          process.exit(1);
        }
        console.log(`  updated ${key}`);
        continue;
      }
    }

    if (!res.ok) {
      const err = await res.text();
      console.error(`FAIL ${key}:`, res.status, err);
      process.exit(1);
    }
    console.log(`  added ${key}`);
  }

  console.log("Done. Render will redeploy automatically.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
