// scripts/test-ocr-stub.ts
//
// TESTE-OCR-STUB — Harness que valida o ENCANAMENTO do OCR (stub), ponta a
// ponta, sem UI, sem PII e sem afetar usuário real.
//
// Prova a fiação de servidor do Caminho A da Edge Function `ocr-attachment`:
//   download do binário → getExtractor(stub) → UPDATE de extracted_text.
// Como anexar imagem pela tela é ação humana, este script invoca a Edge
// Function DIRETAMENTE. NÃO testa o gate de front (isso exige UI +
// VITE_OCR_ENABLED) — testa o encanamento do servidor.
//
// SEGURANÇA (o que torna o teste seguro):
//   • Edge: OCR_ENABLED=true, OCR_ENGINE=stub (setados pelo Ryan, unset ao fim).
//   • Front: VITE_OCR_ENABLED permanece OFF → ingestChatAttachments NÃO chama a
//     ocr-attachment. O ÚNICO disparo é o deste script. Zero impacto em usuário
//     real. O stub devolve texto sintético (nenhuma imagem de cliente).
//
// Roda via `bun scripts/test-ocr-stub.ts` ou `npx tsx scripts/test-ocr-stub.ts`.
// Depende só de @supabase/supabase-js (já no projeto). NENHUMA credencial é
// hardcoded — tudo vem de env/.env(.local). O script NÃO seta secrets do edge.
//
// Uso:
//   bun scripts/test-ocr-stub.ts            # execução principal (deixa a linha viva)
//   bun scripts/test-ocr-stub.ts --cleanup  # remove a linha + objeto do Storage (§5)
//   bun scripts/test-ocr-stub.ts --no-edge  # pula o teste de borda (404)
//
// Envs necessárias (via ambiente ou .env / .env.local):
//   SUPABASE_URL            (ou VITE_SUPABASE_URL)
//   SUPABASE_ANON_KEY       (ou VITE_SUPABASE_PUBLISHABLE_KEY)
//   OCR_TEST_EMAIL          e-mail de um usuário `authenticated` de teste
//   OCR_TEST_PASSWORD       senha desse usuário
// (SUPABASE_SERVICE_ROLE_KEY NÃO é usado por este script.)
// O fluxo inteiro roda com o JWT do usuário de teste (login por email/senha),
// que é o que a `ocr-attachment` exige para validar a posse do anexo (RLS).
// SUPABASE_SERVICE_ROLE_KEY não é usado por este script — a própria Edge
// Function usa service-role internamente para baixar o binário e gravar.

import {
  createClient,
  FunctionsHttpError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Constantes do teste ──────────────────────────────────────────────────────
const TEST_FILE_NAME = "teste_ocr_stub.png";
const TEST_MIME = "image/png";
const TEST_SESSION_TITLE = "[TESTE OCR STUB]";
const EXPECTED_TEXT = `[OCR STUB] conteúdo simulado de ${TEST_FILE_NAME}`;
const BUCKET = "chat-attachments";

// PNG 1x1 transparente, mínimo e válido. O stub NÃO lê o binário — qualquer
// conteúdo serve — mas subimos um PNG real para exercitar upload/download.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ── .env loader (mesmo padrão dos outros scripts do repo) ────────────────────
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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
loadDotEnv();

const env = (...keys: string[]): string => {
  for (const k of keys) {
    const v = (process.env[k] ?? "").trim();
    if (v) return v;
  }
  return "";
};

const SUPABASE_URL = env("SUPABASE_URL", "VITE_SUPABASE_URL");
const ANON_KEY = env(
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
);
const TEST_EMAIL = env("OCR_TEST_EMAIL", "TEST_USER_EMAIL");
const TEST_PASSWORD = env("OCR_TEST_PASSWORD", "TEST_USER_PASSWORD");

// ── Helpers de saída ─────────────────────────────────────────────────────────
const failures: string[] = [];
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✔ ${label}`);
  } else {
    failures.push(label + (detail ? ` — ${detail}` : ""));
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq<T>(label: string, actual: T, expected: T) {
  check(
    label,
    JSON.stringify(actual) === JSON.stringify(expected),
    `esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`,
  );
}
function die(msg: string): never {
  console.error(`\nERRO: ${msg}`);
  process.exit(1);
}

function requireEnv() {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL (ou VITE_SUPABASE_URL)");
  if (!ANON_KEY) missing.push("SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY)");
  if (!TEST_EMAIL) missing.push("OCR_TEST_EMAIL");
  if (!TEST_PASSWORD) missing.push("OCR_TEST_PASSWORD");
  if (missing.length) {
    die(
      `envs ausentes: ${missing.join(", ")}.\n` +
        "Defina no ambiente ou em .env / .env.local (nunca hardcode credenciais).",
    );
  }
}

/** Autentica o usuário de teste e devolve o client (com JWT) + uid. */
async function signIn(): Promise<{ client: SupabaseClient; uid: string }> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.user) {
    die(
      `login do usuário de teste falhou: ${error?.message ?? "sem usuário"}.\n` +
        "Confira OCR_TEST_EMAIL/OCR_TEST_PASSWORD (usuário `authenticated` existente e confirmado).",
    );
  }
  return { client, uid: data.user.id };
}

/** Reusa uma sessão do próprio usuário; cria uma de teste se não houver. */
async function ensureSession(client: SupabaseClient, uid: string): Promise<string> {
  const { data: existing, error: selErr } = await client
    .from("chat_sessions")
    .select("id")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  if (selErr) die(`select de chat_sessions falhou: ${selErr.message}`);
  if (existing?.id) return existing.id as string;

  // entry_agent_id é nullable — não precisamos de agente apto para o teste.
  const { data: created, error: insErr } = await client
    .from("chat_sessions")
    .insert({ user_id: uid, title: TEST_SESSION_TITLE })
    .select("id")
    .single();
  if (insErr || !created) die(`criar sessão de teste falhou: ${insErr?.message}`);
  return created.id as string;
}

// ── Execução principal ───────────────────────────────────────────────────────
async function runMain(edge: boolean) {
  requireEnv();
  console.log("TESTE-OCR-STUB — validação do encanamento (stub)\n");

  const { client, uid } = await signIn();
  console.log(`Autenticado. uid=${uid}`);

  const sessionId = await ensureSession(client, uid);
  console.log(`session_id=${sessionId}`);

  // Path escopado ao dono (passa na policy R-9: 1º segmento = uid).
  const storagePath = `${uid}/${sessionId}/${TEST_FILE_NAME}`;
  const bytes = new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64"));

  // Sobe o PNG mínimo com o JWT do usuário (upsert para o teste ser repetível).
  const { error: upErr } = await client.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { upsert: true, contentType: TEST_MIME });
  if (upErr) die(`upload ao bucket ${BUCKET} falhou: ${upErr.message}`);
  console.log(`Upload OK: ${BUCKET}/${storagePath}`);

  // Insere a linha em chat_attachments (como o usuário).
  const { data: att, error: attErr } = await client
    .from("chat_attachments")
    .insert({
      session_id: sessionId,
      user_id: uid,
      storage_path: storagePath,
      file_name: TEST_FILE_NAME,
      mime_type: TEST_MIME,
    })
    .select("id")
    .single();
  if (attErr || !att) die(`insert em chat_attachments falhou: ${attErr?.message}`);
  const attachmentId = att.id as string;
  console.log(`chat_attachments.id (attachmentId)=${attachmentId}\n`);

  // Invoca a Edge Function com o JWT do usuário (o client já carrega a sessão).
  console.log("Invocando ocr-attachment...");
  const { data: fnData, error: fnErr } = await client.functions.invoke(
    "ocr-attachment",
    { body: { attachmentId } },
  );
  if (fnErr) {
    // Erro HTTP: extrai corpo para diagnóstico (ex.: ocr_disabled se o secret
    // do edge não estiver ligado).
    let body = "";
    if (fnErr instanceof FunctionsHttpError) {
      try {
        body = JSON.stringify(await fnErr.context.json());
      } catch {
        body = `status ${fnErr.context.status}`;
      }
    }
    die(`invoke retornou erro: ${fnErr.message} ${body}`.trim());
  }
  console.log(`Resposta: ${JSON.stringify(fnData)}\n`);

  if (fnData?.reason === "ocr_disabled") {
    die(
      "a Edge respondeu ok:false reason:ocr_disabled. O Ryan precisa setar os " +
        "secrets antes de rodar:\n  supabase secrets set OCR_ENABLED=true " +
        "OCR_ENGINE=stub --project-ref tsltxvswzdnlmvljpryh",
    );
  }

  // ── Asserts sobre a resposta ───────────────────────────────────────────────
  console.log("Asserts da resposta da função:");
  eq("resposta ok:true", fnData?.ok, true);
  eq('engine:"stub"', fnData?.engine, "stub");
  check("chars>0", typeof fnData?.chars === "number" && fnData.chars > 0, `chars=${fnData?.chars}`);

  // ── Relê a linha e valida o estado persistido ──────────────────────────────
  const { data: row, error: reErr } = await client
    .from("chat_attachments")
    .select("extracted_text, ocr_engine, ocr_confidence, ocr_fields")
    .eq("id", attachmentId)
    .single();
  if (reErr || !row) die(`releitura da linha falhou: ${reErr?.message}`);

  console.log("\nValores lidos da linha (persistidos):");
  console.log(`  extracted_text = ${JSON.stringify(row.extracted_text)}`);
  console.log(`  ocr_engine     = ${JSON.stringify(row.ocr_engine)}`);
  console.log(`  ocr_confidence = ${JSON.stringify(row.ocr_confidence)}`);
  console.log(`  ocr_fields     = ${JSON.stringify(row.ocr_fields)}`);

  console.log("\nAsserts do estado persistido:");
  check(
    'extracted_text começa com "[OCR STUB]"',
    typeof row.extracted_text === "string" && row.extracted_text.startsWith("[OCR STUB]"),
    JSON.stringify(row.extracted_text),
  );
  check(
    `extracted_text contém "${TEST_FILE_NAME}"`,
    typeof row.extracted_text === "string" && row.extracted_text.includes(TEST_FILE_NAME),
  );
  eq("extracted_text exato", row.extracted_text, EXPECTED_TEXT);
  eq('ocr_engine="stub"', row.ocr_engine, "stub");
  eq("ocr_confidence=1", Number(row.ocr_confidence), 1);
  eq("ocr_fields=[]", row.ocr_fields, []);

  // ── Teste de borda (§8): attachmentId inexistente → 404 attachment_not_found ─
  if (edge) {
    console.log("\nTeste de borda: attachmentId inexistente → 404 attachment_not_found");
    const ghostId = "00000000-0000-0000-0000-000000000000";
    const { data: gData, error: gErr } = await client.functions.invoke(
      "ocr-attachment",
      { body: { attachmentId: ghostId } },
    );
    if (gErr instanceof FunctionsHttpError) {
      const status = gErr.context.status;
      let body: any = null;
      try {
        body = await gErr.context.json();
      } catch {
        /* ignore */
      }
      eq("status 404", status, 404);
      eq('reason="attachment_not_found"', body?.reason, "attachment_not_found");
    } else {
      check(
        "invoke com id inexistente deveria falhar 404",
        false,
        `erro=${gErr?.message ?? "nenhum"}, data=${JSON.stringify(gData)}`,
      );
    }
    // Nota: o outro sub-item do §8 (extrator vazio → extracted_text null) NÃO é
    // exercitável com o stub (ele nunca devolve vazio). Fica coberto pelos
    // testes do módulo e pelo caminho "empty_extraction" da própria função.
  }

  // ── Resumo ─────────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  if (failures.length === 0) {
    console.log("PASS");
    console.log(`  attachmentId   = ${attachmentId}`);
    console.log(`  extracted_text = "${row.extracted_text}"`);
    console.log(`  ocr_engine     = ${JSON.stringify(row.ocr_engine)}`);
    console.log(`  ocr_confidence = ${JSON.stringify(row.ocr_confidence)}`);
    console.log(`  ocr_fields     = ${JSON.stringify(row.ocr_fields)}`);
    console.log("\nA linha foi PRESERVADA no banco (cleanup é passo separado):");
    console.log("  bun scripts/test-ocr-stub.ts --cleanup");
    process.exit(0);
  } else {
    console.log(`FAIL — ${failures.length} assert(s) falharam:`);
    for (const f of failures) console.log(`  • ${f}`);
    process.exit(1);
  }
}

// ── Cleanup (§5) — passo separado, só rodar APÓS a verificação independente ───
async function runCleanup() {
  requireEnv();
  console.log("TESTE-OCR-STUB — cleanup\n");
  const { client, uid } = await signIn();

  // Encontra as linhas de teste do próprio usuário (por file_name).
  const { data: rows, error: selErr } = await client
    .from("chat_attachments")
    .select("id, storage_path")
    .eq("user_id", uid)
    .eq("file_name", TEST_FILE_NAME);
  if (selErr) die(`select para cleanup falhou: ${selErr.message}`);
  if (!rows || rows.length === 0) {
    console.log("Nada a limpar: nenhuma linha de teste encontrada.");
    process.exit(0);
  }

  const paths = rows.map((r) => r.storage_path as string).filter(Boolean);
  if (paths.length) {
    const { error: rmErr } = await client.storage.from(BUCKET).remove(paths);
    if (rmErr) console.warn(`Aviso: remoção de objeto(s) do Storage: ${rmErr.message}`);
    else console.log(`Storage: ${paths.length} objeto(s) removido(s).`);
  }

  const ids = rows.map((r) => r.id as string);
  const { error: delErr } = await client
    .from("chat_attachments")
    .delete()
    .in("id", ids);
  if (delErr) die(`delete das linhas falhou: ${delErr.message}`);
  console.log(`Banco: ${ids.length} linha(s) de chat_attachments removida(s).`);
  console.log("\nCleanup concluído.");
  process.exit(0);
}

// ── Entry point ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--cleanup")) {
  runCleanup().catch((e) => die(e?.message ?? String(e)));
} else {
  runMain(!argv.includes("--no-edge")).catch((e) => die(e?.message ?? String(e)));
}
