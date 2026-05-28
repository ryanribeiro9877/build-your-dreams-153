#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, "supabase", ".env.local");
const text = fs.readFileSync(envPath).toString("utf8").replace(/^\uFEFF/, "");
const env = {};
for (const line of text.split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith("#")) continue;
  const i = s.indexOf("=");
  if (i < 0) continue;
  const k = s.slice(0, i).trim();
  let v = s.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const esc = (s) => s.replace(/'/g, "''");
const rows = [
  ["RESEND_API_KEY", env.RESEND_API_KEY],
  ["INVITE_EMAIL_FROM", env.INVITE_EMAIL_FROM],
  ["SITE_URL", env.SITE_URL],
  ["TURNSTILE_SECRET_KEY", env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA"],
];

for (const [k, v] of rows) {
  if (!v?.trim()) {
    console.error(`Missing ${k} in supabase/.env.local`);
    process.exit(1);
  }
}

const sql = rows
  .map(
    ([k, v]) =>
      `INSERT INTO public.edge_runtime_secrets (key, value) VALUES ('${esc(k)}', '${esc(v.trim())}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();`,
  )
  .join("\n");

fs.writeFileSync(path.join(root, "supabase", ".temp", "edge-secrets-upsert.sql"), sql, "utf8");
console.log("Wrote supabase/.temp/edge-secrets-upsert.sql");
