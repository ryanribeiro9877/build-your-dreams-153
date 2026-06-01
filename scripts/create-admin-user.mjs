/**
 * Cria (ou atualiza senha / confirma e-mail) do usuário admin e garante role admin em user_roles.
 * Requer SUPABASE_SERVICE_ROLE_KEY no .env (Project Settings → API → service_role — não commitar).
 *
 * Uso: node scripts/create-admin-user.mjs
 * Opcional: SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node scripts/create-admin-user.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    let text = readFileSync(p, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

/** Lê `role` do JWT (anon / service_role) sem validar assinatura. */
function jwtRole(token) {
  const t = String(token).trim();
  const parts = t.split(".");
  if (parts.length !== 3) return null;
  const pad = (s) => s + "=".repeat((4 - (s.length % 4)) % 4);
  const b64url = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  try {
    const json = Buffer.from(pad(b64url), "base64").toString("utf8");
    const payload = JSON.parse(json);
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

loadDotEnv();

const url = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ""
).trim();
const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const email = process.env.SEED_ADMIN_EMAIL?.trim();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password) {
  console.error("ERROR: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables are required.");
  process.exit(1);
}

async function findUserByEmail(adminClient, target) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  if (!url) {
    throw new Error("Defina VITE_SUPABASE_URL (ou SUPABASE_URL) no .env.");
  }
  if (!serviceRole) {
    throw new Error(
      "Adicione SUPABASE_SERVICE_ROLE_KEY ao .env (Supabase Dashboard → Project Settings → API → service_role secret)."
    );
  }

  const role = jwtRole(serviceRole);
  if (!role) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não parece um JWT válido (três partes separadas por ponto). Verifique se copiou a chave inteira, sem espaços a mais no início/fim."
    );
  }
  if (role === "anon") {
    throw new Error(
      'Esta chave é a "anon" / "public" (mesma do VITE_SUPABASE_PUBLISHABLE_KEY). A API Admin exige a chave **service_role** (secret), no bloco "Project API keys" abaixo da anon.'
    );
  }
  if (role !== "service_role") {
    throw new Error(`JWT com role "${role}". Use a chave service_role do mesmo projeto da URL.`);
  }

  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    /* ignore */
  }
  const jwtRef = jwtPayloadRef(serviceRole);
  if (host.endsWith(".supabase.co") && jwtRef) {
    const refFromUrl = host.replace(/\.supabase\.co$/i, "");
    if (refFromUrl !== jwtRef) {
      throw new Error(
        `URL do projeto (${refFromUrl}) não bate com o "ref" do JWT (${jwtRef}). Use URL e service_role do mesmo projeto.`
      );
    }
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "create-admin-user-script" } },
  });

  let userId;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Administrador" },
  });

  if (createErr) {
    const msg = createErr.message || "";
    if (msg.toLowerCase().includes("invalid api key")) {
      throw new Error(
        'Supabase respondeu "Invalid API key". Confira: (1) chave **service_role** completa, (2) mesmo projeto que VITE_SUPABASE_URL, (3) sem aspas duplicadas no .env, (4) linha sem espaço antes do nome da variável.'
      );
    }
    if (!/already|registered|exists/i.test(msg)) {
      throw new Error(`Falha ao criar usuário: ${createErr.message}`);
    }
    const existing = await findUserByEmail(admin, email);
    if (!existing) {
      throw new Error(`Usuário parece existir mas não foi encontrado na listagem: ${msg}`);
    }
    userId = existing.id;
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      throw new Error(`Falha ao atualizar senha/confirmação: ${updErr.message}`);
    }
    console.log("Usuário já existia: senha atualizada e e-mail marcado como confirmado.");
  } else {
    userId = created.user.id;
    console.log("Usuário criado:", email);
  }

  const { data: hasAdmin } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!hasAdmin) {
    const { error: insErr } = await admin.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });
    if (insErr && !/duplicate|unique/i.test(insErr.message)) {
      throw new Error(`Falha ao inserir role admin: ${insErr.message}`);
    }
  }

  console.log("Role admin garantida em user_roles.");
  console.log("Pronto. Faça login com:", email);
}

function jwtPayloadRef(token) {
  const t = String(token).trim();
  const parts = t.split(".");
  if (parts.length !== 3) return null;
  const pad = (s) => s + "=".repeat((4 - (s.length % 4)) % 4);
  try {
    const json = Buffer.from(pad(parts[1].replace(/-/g, "+").replace(/_/g, "/")), "base64").toString("utf8");
    const payload = JSON.parse(json);
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sleep(300);
    process.exit(process.exitCode ?? 0);
  });
