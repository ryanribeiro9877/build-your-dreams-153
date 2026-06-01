#!/usr/bin/env node
// DEPRECATED: Use scripts/manage-secrets.mjs set (or npm run secrets:set) instead.
/**
 * Aplica secrets da edge function a partir de supabase/.env.local (UTF-8 sem BOM).
 * Requer: npx supabase login
 * Uso: node scripts/set-edge-secrets.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, "supabase", ".env.local");
const projectRef = "tsltxvswzdnlmvljpryh";

if (!fs.existsSync(envPath)) {
  console.error("Crie supabase/.env.local com RESEND_API_KEY, INVITE_EMAIL_FROM, SITE_URL.");
  process.exit(1);
}

const text = fs.readFileSync(envPath).toString("utf8").replace(/^\uFEFF/, "");
const cleanPath = path.join(root, "supabase", ".temp", "secrets-clean.env");
fs.mkdirSync(path.dirname(cleanPath), { recursive: true });

const extra = [
  "",
  "# Cloudflare Turnstile (teste — troque em produção)",
  "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
].join("\n");

fs.writeFileSync(cleanPath, text.trimEnd() + extra + "\n", "utf8");

console.log("Aplicando secrets em", projectRef, "...");
execSync(`npx supabase secrets set --env-file "${cleanPath}" --project-ref ${projectRef}`, {
  stdio: "inherit",
  cwd: root,
});
console.log("OK. Rode: npx supabase functions deploy invite-employee verify-turnstile --project-ref", projectRef);
