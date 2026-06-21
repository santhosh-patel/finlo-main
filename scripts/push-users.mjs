#!/usr/bin/env node
/**
 * Creates users via Supabase Auth Admin API + inserts profiles/roles.
 * Requires SUPABASE_SERVICE_ROLE_KEY and a user list from env or CLI.
 *
 * Usage:
 *   SEED_ADMINS='[{"email":"admin@example.com","password":"...","name":"Admin","role":"admin"}]' \
 *     node scripts/push-users.mjs
 *   node scripts/push-users.mjs --users-file=./users.local.json
 *   node scripts/push-users.mjs --service-key=YOUR_KEY
 *
 * Never commit real credentials. Keep user lists in gitignored files or env vars.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function parseUsersJson(raw, source) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      console.error(`${source} must be a JSON array of user objects.`);
      process.exit(1);
    }
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${source} is not valid JSON: ${msg}`);
    process.exit(1);
  }
}

function loadUsers(argv) {
  for (const arg of argv) {
    if (arg.startsWith("--users=")) {
      return parseUsersJson(arg.slice("--users=".length), "--users");
    }
    if (arg.startsWith("--users-file=")) {
      const path = arg.slice("--users-file=".length);
      const abs = path.startsWith("/") ? path : join(process.cwd(), path);
      if (!existsSync(abs)) {
        console.error(`Users file not found: ${abs}`);
        process.exit(1);
      }
      return parseUsersJson(readFileSync(abs, "utf8"), `--users-file (${abs})`);
    }
  }

  const fromEnv = process.env.SEED_ADMINS ?? process.env.PUSH_USERS ?? "";
  if (fromEnv.trim()) {
    return parseUsersJson(fromEnv, "SEED_ADMINS / PUSH_USERS");
  }

  console.error("No users configured.");
  console.error("");
  console.error("Provide a JSON array via one of:");
  console.error('  • SEED_ADMINS env var (or in gitignored `.env`)');
  console.error('  • node scripts/push-users.mjs --users=\'[{"email":"...","password":"...","name":"...","role":"admin"}]\'');
  console.error("  • node scripts/push-users.mjs --users-file=./users.local.json");
  process.exit(1);
}

loadEnv();

let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--service-key=")) serviceKey = arg.slice("--service-key=".length);
}

const baseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const USERS = loadUsers(process.argv.slice(2));

if (!baseUrl) { console.error("Missing VITE_SUPABASE_URL in .env"); process.exit(1); }
if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Add it to .env or pass --service-key=YOUR_KEY");
  console.error("Find it: Supabase Dashboard → Settings → API → service_role (secret)");
  process.exit(1);
}

async function apiCall(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: text }; }
  return { ok: res.ok, status: res.status, json };
}

async function apiGet(path) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: text }; }
  return { ok: res.ok, json };
}

async function restPost(table, body) {
  const res = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function restDelete(table, query) {
  const res = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
  });
  return { ok: res.ok, status: res.status };
}

console.log(`Target: ${baseUrl}`);
console.log(`Creating ${USERS.length} user(s)...\n`);

for (const u of USERS) {
  console.log(`→ ${u.email} (${u.role})`);

  const listRes = await apiGet(`/auth/v1/admin/users?page=1&per_page=1000`);
  let userId = null;

  if (listRes.ok && Array.isArray(listRes.json?.users)) {
    const existing = listRes.json.users.find(
      (x) => x.email?.toLowerCase() === u.email.toLowerCase()
    );
    if (existing) {
      userId = existing.id;
      console.log(`  Found existing user: ${userId.slice(0, 8)}…`);
      const upRes = await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: u.password,
          email_confirm: true,
          user_metadata: { display_name: u.name },
        }),
      });
      if (!upRes.ok) {
        const t = await upRes.text();
        console.error(`  ✗ Failed to update: ${t}`);
        continue;
      }
      console.log(`  ✓ Password updated`);
    }
  }

  if (!userId) {
    const createRes = await apiCall("/auth/v1/admin/users", {
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { display_name: u.name },
    });
    if (!createRes.ok) {
      console.error(`  ✗ Create failed: ${JSON.stringify(createRes.json)}`);
      continue;
    }
    userId = createRes.json?.id;
    if (!userId) {
      console.error(`  ✗ No user id returned`);
      continue;
    }
    console.log(`  ✓ Created: ${userId.slice(0, 8)}…`);
  }

  const profRes = await restPost("profiles", {
    user_id: userId,
    email: u.email,
    display_name: u.name,
  });
  if (!profRes.ok && profRes.status !== 409) {
    console.error(`  ⚠ Profile upsert: ${profRes.status} ${profRes.text}`);
  } else {
    console.log(`  ✓ Profile set`);
  }

  await restDelete("user_roles", `user_id=eq.${userId}`);
  const roleRes = await restPost("user_roles", { user_id: userId, role: u.role });
  if (!roleRes.ok && roleRes.status !== 409) {
    console.error(`  ⚠ Role insert: ${roleRes.status} ${roleRes.text}`);
  } else {
    console.log(`  ✓ Role: ${u.role}`);
  }

  console.log("");
}

console.log("Done! You can now sign in and change passwords from the UI.");
