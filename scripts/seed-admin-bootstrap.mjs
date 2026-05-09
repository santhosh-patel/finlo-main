#!/usr/bin/env node
/**
 * Calls `seed-admin` with the first-install bootstrap header.
 *
 * Dashboard: set `SEED_ADMINS` + `SEED_BOOTSTRAP_SECRET` on the `seed-admin` function, then redeploy.
 *
 * This script needs (any of):
 *   • `SEED_BOOTSTRAP_SECRET` in `.env` / `.env.local` (same value as Dashboard), or
 *   • `npm run seed-admin -- --bootstrap-secret=YOUR_SECRET`, or
 *   • `export SEED_BOOTSTRAP_SECRET=...` before running.
 *
 * Supabase URL + publishable key: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
 * or `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function parseEnvLine(raw) {
  let line = String(raw).replace(/^\uFEFF/, "").replace(/\s+$/, "");
  line = line.trim();
  if (!line || line.startsWith("#")) return null;
  if (line.startsWith("export ")) line = line.slice(7).trim();
  const eq = line.indexOf("=");
  if (eq <= 0) return null;
  const key = line.slice(0, eq).trim();
  let val = line.slice(eq + 1).trim();
  if (!key) return null;
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  return { key, val };
}

function applyEnvLines(text) {
  for (const raw of text.split(/\r?\n/)) {
    const pair = parseEnvLine(raw);
    if (!pair) continue;
    const cur = process.env[pair.key];
    if (cur === undefined || cur === "") {
      process.env[pair.key] = pair.val;
    }
  }
}

function loadDotEnvFile(absPath) {
  if (!existsSync(absPath)) return;
  const text = readFileSync(absPath, "utf8");
  applyEnvLines(text);
}

function loadDotEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    loadDotEnvFile(join(root, name));
  }
  // Optional convention for tooling-only vars
  loadDotEnvFile(join(root, "supabase", ".env"));
}

function parseBootstrapFromArgv(argv) {
  /** @type {string | undefined} */
  let out;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--bootstrap-secret=")) {
      const v = a.slice("--bootstrap-secret=".length);
      if (v !== "") out = v;
    } else if (a === "--bootstrap-secret") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out = next;
        i++;
      }
    }
  }
  return out;
}

loadDotEnvFiles();

const cliBootstrap = parseBootstrapFromArgv(process.argv.slice(2));
const publishable =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  "";
const baseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const bootstrap = (cliBootstrap ?? process.env.SEED_BOOTSTRAP_SECRET ?? "").trim();

function exitWithHints(title) {
  console.error(title);
  console.error("");
  console.error("Provide the same bootstrap string as Dashboard → Edge Functions → seed-admin → SEED_BOOTSTRAP_SECRET:");
  console.error('  • Add SEED_BOOTSTRAP_SECRET=value to `.env` (gitignored), or');
  console.error("  • npm run seed-admin -- --bootstrap-secret=YOUR_VALUE");
  console.error("");
  console.error("Supabase keys (publishable anon only — never service role):");
  console.error("  • .env: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY");
  console.error("  • or SUPABASE_URL + SUPABASE_ANON_KEY");
  process.exit(1);
}

if (!baseUrl) {
  exitWithHints("Missing VITE_SUPABASE_URL or SUPABASE_URL.");
}

if (!publishable) {
  exitWithHints("Missing VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY.");
}

if (!bootstrap) {
  exitWithHints("Missing SEED_BOOTSTRAP_SECRET (empty or unset).");
}

const url = `${baseUrl}/functions/v1/seed-admin`;

/** @type {Response} */
let res;
try {
  res = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: {
      Authorization: `Bearer ${publishable}`,
      apikey: publishable,
      "Content-Type": "application/json",
      "x-seed-bootstrap-secret": bootstrap,
    },
    body: "{}",
  });
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("Request failed:", msg);
  console.error("");
  console.error(`Target: ${url}`);
  console.error("Check network/VPN/firewall or that VITE_SUPABASE_URL is correct.");
  process.exit(1);
}

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  console.error("Non-JSON response:", res.status, text.slice(0, 800));
  process.exit(1);
}

console.log(JSON.stringify(json, null, 2));

const errMsg = typeof json?.error === "string" ? json.error : "";

if (!res.ok) {
  console.error("");
  console.error(`HTTP ${res.status}. Fix Dashboard secrets / deploy, or see messages above.`);
  if (/Unexpected token|Internal Server|non-JSON|DOCTYPE/i.test(errMsg)) {
    console.error("");
    console.error("Often fixable by:");
    console.error('  • SEED_ADMINS must be ONE line JSON: [{"email":"...","password":"...","name":"...","role":"admin"}]');
    console.error("  • Redeploy the seed-admin Edge Function after changing secrets.");
    console.error("  • Confirm the Supabase project is not paused and migrations (user_roles table) ran.");
    console.error("  • Verify VITE_SUPABASE_URL matches the project hosting this function.");
  }
  if (errMsg.includes("Bootstrap disabled")) {
    console.error("Bootstrap only works when zero admins exist; sign in as admin and use Admin → Run seed-admin.");
  }
  process.exit(1);
}

if (json.ok === false) {
  process.exit(1);
}
