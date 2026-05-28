#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, "supabase", ".env.local");
const projectRef = "tsltxvswzdnlmvljpryh";

if (!fs.existsSync(envPath)) {
  console.error("Arquivo ausente: supabase/.env.local");
  process.exit(1);
}

const text = fs.readFileSync(envPath).toString("utf8").replace(/^\uFEFF/, "");
const env = {};
for (const line of text.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const required = ["RESEND_API_KEY", "INVITE_EMAIL_FROM", "SITE_URL"];
for (const k of required) {
  if (!env[k]?.trim()) {
    console.error(`Variável ausente em supabase/.env.local: ${k}`);
    process.exit(1);
  }
}

const turnstile = env.TURNSTILE_SECRET_KEY?.trim() || "1x0000000000000000000000000000000AA";
const cleanPath = path.join(root, "supabase", ".temp", "secrets-clean.env");
fs.mkdirSync(path.dirname(cleanPath), { recursive: true });
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
