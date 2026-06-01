#!/usr/bin/env node
/**
 * Unified edge-function secret management.
 *
 * Subcommands:
 *   push  - Parse supabase/.env.local, validate required keys, and push
 *           a clean env file to Supabase secrets (selective + validated).
 *   set   - Push the entire supabase/.env.local (plus a default Turnstile
 *           test key) to Supabase secrets in one shot.
 *   sync  - Generate a SQL upsert file that writes secrets into the
 *           public.edge_runtime_secrets table (for DB-side access).
 *
 * Usage:
 *   node scripts/manage-secrets.mjs <push|set|sync>
 *   npm run secrets:push
 *   npm run secrets:set
 *   npm run secrets:sync
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, "supabase", ".env.local");
const projectRef = process.env.SUPABASE_PROJECT_ID;
if (!projectRef) {
  console.error("ERROR: SUPABASE_PROJECT_ID environment variable is required.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readEnvFile() {
  if (!fs.existsSync(envPath)) {
    console.error("Arquivo ausente: supabase/.env.local");
    console.error("Crie com RESEND_API_KEY, INVITE_EMAIL_FROM, SITE_URL.");
    process.exit(1);
  }
  const text = fs.readFileSync(envPath).toString("utf8").replace(/^﻿/, "");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return { env, rawText: text };
}

function ensureTempDir() {
  const dir = path.join(root, "supabase", ".temp");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// push — selective push with validation
// ---------------------------------------------------------------------------

function cmdPush() {
  const { env } = readEnvFile();

  const required = ["RESEND_API_KEY", "INVITE_EMAIL_FROM", "SITE_URL"];
  for (const k of required) {
    if (!env[k]?.trim()) {
      console.error(`Variavel ausente em supabase/.env.local: ${k}`);
      process.exit(1);
    }
  }

  const turnstile = env.TURNSTILE_SECRET_KEY?.trim() || "1x0000000000000000000000000000000AA";
  const tempDir = ensureTempDir();
  const cleanPath = path.join(tempDir, "secrets-clean.env");
  fs.writeFileSync(
    cleanPath,
    [
      `RESEND_API_KEY=${env.RESEND_API_KEY.trim()}`,
      `INVITE_EMAIL_FROM=${env.INVITE_EMAIL_FROM.trim()}`,
      `SITE_URL=${env.SITE_URL.trim()}`,
      `TURNSTILE_SECRET_KEY=${turnstile}`,
    ].join("\n") + "\n",
    "utf8",
  );

  console.log("Aplicando secrets no projeto", projectRef, "...");
  execSync(`npx supabase secrets set --env-file "${cleanPath}" --project-ref ${projectRef}`, {
    stdio: "inherit",
    cwd: root,
  });
  console.log("Secrets aplicados com sucesso.");
}

// ---------------------------------------------------------------------------
// set — bulk push of entire .env.local
// ---------------------------------------------------------------------------

function cmdSet() {
  const { rawText } = readEnvFile();

  const tempDir = ensureTempDir();
  const cleanPath = path.join(tempDir, "secrets-clean.env");

  const extra = [
    "",
    "# Cloudflare Turnstile (teste — troque em producao)",
    "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
  ].join("\n");

  fs.writeFileSync(cleanPath, rawText.trimEnd() + extra + "\n", "utf8");

  console.log("Aplicando secrets em", projectRef, "...");
  execSync(`npx supabase secrets set --env-file "${cleanPath}" --project-ref ${projectRef}`, {
    stdio: "inherit",
    cwd: root,
  });
  console.log(
    "OK. Rode: npx supabase functions deploy invite-employee verify-turnstile --project-ref",
    projectRef,
  );
}

// ---------------------------------------------------------------------------
// sync — generate SQL upsert for edge_runtime_secrets table
// ---------------------------------------------------------------------------

function cmdSync() {
  const { env } = readEnvFile();

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

  const tempDir = ensureTempDir();
  const outPath = path.join(tempDir, "edge-secrets-upsert.sql");
  fs.writeFileSync(outPath, sql, "utf8");
  console.log("Wrote", outPath);
}

// ---------------------------------------------------------------------------
// CLI dispatcher
// ---------------------------------------------------------------------------

const subcommand = process.argv[2];

const commands = { push: cmdPush, set: cmdSet, sync: cmdSync };

if (!subcommand || !commands[subcommand]) {
  console.log(`
manage-secrets.mjs — Unified edge-function secret management

Usage:
  node scripts/manage-secrets.mjs <command>

Commands:
  push   Parse .env.local, validate required keys (RESEND_API_KEY,
         INVITE_EMAIL_FROM, SITE_URL), and push a clean env file to
         Supabase secrets.
  set    Push the entire .env.local (plus default Turnstile test key)
         to Supabase secrets in one shot.
  sync   Generate a SQL upsert file that writes secrets into the
         public.edge_runtime_secrets table for DB-side access.

npm shortcuts:
  npm run secrets:push
  npm run secrets:set
  npm run secrets:sync
`.trimStart());
  process.exit(subcommand ? 1 : 0);
}

commands[subcommand]();
