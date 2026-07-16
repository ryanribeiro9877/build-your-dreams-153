// supabase/functions/ocr-client-document/index.ts
//
// OCR de documento do CLIENTE (aba Documentos → tabela `client_documents`,
// bucket privado `client-documents`). Espelha a `ocr-attachment` (que serve o
// fluxo de CHAT), mas para o fluxo do cadastro:
//   • lê a linha de client_documents por id;
//   • baixa o binário do bucket `client-documents` pelo file_path;
//   • roda o extrator canônico (_shared/ocr) — em produção, engine
//     `openai-vision` (usa a chave OpenAI já existente, sem AWS);
//   • grava a transcrição resumida em `client_documents.notes`;
//   • AUTO-PREENCHE no cadastro do cliente APENAS campos hoje VAZIOS e de alta
//     confiança (needsReview=false), via a RPC estreita apply_ocr_client_fields
//     (nunca sobrescreve dado humano; CPF/RG são cifrados server-side);
//   • loga a chamada em `ai_generations` (custo aparece no Dashboard IA).
//
// DOIS MODOS de disparo, ambos aqui:
//   • AUTO: trigger AFTER INSERT em client_documents chama via net.http_post com
//     header X-OCR-Secret (segredo interno). Sem JWT de usuário.
//   • MANUAL: o botão "Extrair dados (OCR)" chama via supabase.functions.invoke
//     com o JWT do usuário; a autorização é re-checada pela RLS de client_documents.
//
// AUTH: verify_jwt é DESLIGADO no deploy (o trigger não manda JWT). A autorização
// é feita AQUI: X-OCR-Secret válido (interno) OU JWT que enxergue a linha via RLS.
//
// GATE: respeita OCR_ENABLED (default OFF). Config (OCR_ENABLED/OCR_ENGINE/
// OCR_VISION_MODEL/OCR_INTERNAL_SECRET) vem de edge_runtime_secrets (via RPC
// get_edge_runtime_secret, service_role), com fallback para env. A chave OpenAI
// vem do mesmo caminho do orquestrador (llm_provider_configs + get_provider_key_decrypted).
//
// IDEMPOTÊNCIA: se `notes` já estiver preenchido e não vier force=true, no-op.
// Nunca quebra o upload: o trigger engole erros; aqui devolvemos 200 {ok:false}.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
// Importa direto de registry/types (não de index.ts) para não arrastar merge.ts
// ao bundle do edge — o fluxo de cliente é de documento único, sem merge.
import { getExtractor, type SecretGetter } from "../_shared/ocr/registry.ts";
import type { OcrField } from "../_shared/ocr/types.ts";

function jsonResp(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// ─── config: edge_runtime_secrets (via RPC) com fallback para env ──────────────
async function getEdgeSecret(admin: SupabaseClient, key: string): Promise<string | null> {
  try {
    const { data } = await admin.rpc("get_edge_runtime_secret", { p_key: key });
    const v = (data as string | null) ?? null;
    if (v && v.toString().trim()) return v.toString().trim();
  } catch {
    // segue para o fallback de env
  }
  return (Deno.env.get(key) || "").trim() || null;
}

// Chave UNIVERSAL por provider (mesma derivação do orquestrador): qualquer chave
// ativa do provider serve. A OpenAI vive no Vault e é decifrada por RPC.
async function resolveProviderKey(admin: SupabaseClient, provider: string): Promise<string | null> {
  const { data: cfg } = await admin.from("llm_provider_configs")
    .select("user_id").eq("provider", provider).eq("is_active", true)
    .order("is_default", { ascending: false }).limit(1).maybeSingle();
  const ownerId = (cfg as { user_id?: string } | null)?.user_id;
  if (!ownerId) return null;
  const { data } = await admin.rpc("get_provider_key_decrypted", { p_user_id: ownerId, p_provider: provider });
  const rows = (data as unknown as { decrypted_key: string }[]) || [];
  return rows.length ? rows[0].decrypted_key : null;
}

// SecretGetter híbrido para o módulo OCR: a chave OpenAI vem do Vault; o resto
// (flags/engine/modelo) de edge_runtime_secrets/env.
function makeSecretGetter(admin: SupabaseClient): SecretGetter {
  let openaiKey: string | null | undefined;
  return async (key: string) => {
    if (key === "OPENAI_API_KEY") {
      if (openaiKey === undefined) openaiKey = await resolveProviderKey(admin, "openai");
      return openaiKey;
    }
    return await getEdgeSecret(admin, key);
  };
}

// Só imagens: a visão consome data URL de imagem (PDF multipágina fica fora —
// para PDF, o caminho é Textract, que não está ligado). Guard defensivo; o
// trigger já pré-filtra por tipo/extensão.
function isImageDoc(mimeType: string | null, filePath: string): boolean {
  if (mimeType && mimeType.toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(filePath || "");
}

// Chave do OcrField → nome do parâmetro que a RPC apply_ocr_client_fields entende.
// Só campos SEGUROS de auto-preencher entram (dado atribuível ao titular). `date`
// (data sem titular) e `full_name` (nome nunca sobrescreve) ficam de fora.
const FIELD_TO_CADASTRO: Record<string, string> = {
  cpf: "cpf", rg: "rg", cep: "zip_code", rg_issuer: "rg_issuer", rg_uf: "rg_uf",
  birth_date: "birth_date", mother_name: "mother_name", father_name: "father_name",
  nationality: "nationality", gender: "gender", marital_status: "marital_status",
  address: "address", city: "city", state: "state",
};

/** Monta o jsonb p/ a RPC: só campos de alta confiança (needsReview=false). */
function fieldsForCadastro(fields: OcrField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.needsReview) continue;
    const base = f.key.replace(/_\d+$/, ""); // ignora cpf_2, rg_2, …
    const col = FIELD_TO_CADASTRO[base];
    if (!col || out[col]) continue; // 1º valor por coluna
    const v = (f.value || "").trim();
    if (v) out[col] = v;
  }
  return out;
}

/** Resumo humano-legível para client_documents.notes. */
function buildNotes(text: string, fields: OcrField[]): string {
  const head = "[OCR openai-vision] ";
  const clamped = text.length > 600 ? text.slice(0, 600) + "…" : text;
  const named = fields.filter((f) => !/^(date)(_\d+)?$/.test(f.key));
  let fieldLine = "";
  if (named.length > 0) {
    const parts = named.slice(0, 12).map((f) =>
      `${f.key}=${f.value}${f.needsReview ? " [REVISAR]" : ""}`
    );
    fieldLine = "\nCampos: " + parts.join("; ");
  }
  return (head + clamped + fieldLine).slice(0, 2000);
}

async function logGeneration(
  admin: SupabaseClient,
  doc: { uploaded_by: string },
  engine: string,
  usage: { inputTokens: number; outputTokens: number; model: string } | undefined,
  status: "ok" | "empty" | "error",
): Promise<void> {
  try {
    await admin.from("ai_generations").insert({
      user_id: doc.uploaded_by,
      source: "ocr-client-document",
      provider: "openai",
      model: usage?.model ?? null,
      stage: "ocr",
      status: status === "error" ? "error" : "ok",
      error_type: status === "empty" ? "empty_extraction" : null,
      input_tokens: usage?.inputTokens ?? 0,
      output_tokens: usage?.outputTokens ?? 0,
    });
  } catch {
    // log é best-effort; nunca derruba o OCR.
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    let body: { documentId?: string; force?: boolean };
    try {
      body = await req.json();
    } catch {
      return jsonResp(req, 400, { ok: false, reason: "invalid_body" });
    }
    const documentId = body?.documentId;
    const force = !!body?.force;
    if (!documentId) {
      return jsonResp(req, 400, { ok: false, reason: "missing_documentId" });
    }

    // ── Auth: X-OCR-Secret interno (trigger) OU JWT que enxergue a linha (RLS) ──
    const internalSecret = await getEdgeSecret(admin, "OCR_INTERNAL_SECRET");
    const providedSecret = req.headers.get("x-ocr-secret");
    const isInternal = !!internalSecret && providedSecret === internalSecret;

    if (!isInternal) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return jsonResp(req, 401, { ok: false, reason: "not_authenticated" });
      }
      // A RLS de client_documents (is_recepcao_or_socio) decide a posse. Sem
      // acesso → 403. Não vazamos existência do documento.
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: allowed, error: cErr } = await callerClient
        .from("client_documents").select("id").eq("id", documentId).maybeSingle();
      if (cErr) {
        return jsonResp(req, 500, { ok: false, reason: "auth_check_failed", message: cErr.message });
      }
      if (!allowed) {
        return jsonResp(req, 403, { ok: false, reason: "forbidden" });
      }
    }

    // ── Carrega o documento (service-role) ────────────────────────────────────
    const { data: doc, error: dErr } = await admin
      .from("client_documents")
      .select("id, client_id, file_path, document_name, document_type, mime_type, notes, uploaded_by")
      .eq("id", documentId).maybeSingle();
    if (dErr) {
      return jsonResp(req, 500, { ok: false, reason: "select_failed", message: dErr.message });
    }
    if (!doc) {
      return jsonResp(req, 404, { ok: false, reason: "document_not_found" });
    }

    // ── Idempotência: notes já preenchido e sem force → no-op ─────────────────
    if (!force && doc.notes && String(doc.notes).trim()) {
      return jsonResp(req, 200, { ok: false, reason: "already_processed" });
    }

    // ── Só imagens ─────────────────────────────────────────────────────────────
    if (!isImageDoc(doc.mime_type, doc.file_path)) {
      return jsonResp(req, 200, { ok: false, reason: "not_an_image" });
    }

    // ── Extrator (gate OCR_ENABLED + engine via registry) ─────────────────────
    const extractor = await getExtractor(makeSecretGetter(admin));
    if (!extractor) {
      return jsonResp(req, 200, { ok: false, reason: "ocr_disabled" });
    }

    // ── Download do binário (service-role) ────────────────────────────────────
    const { data: blob, error: dlErr } = await admin.storage
      .from("client-documents").download(doc.file_path);
    if (dlErr || !blob) {
      return jsonResp(req, 200, { ok: false, reason: "download_failed", message: dlErr?.message });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // ── Extração ──────────────────────────────────────────────────────────────
    const result = await extractor.extract(
      {
        bytes,
        mimeType: doc.mime_type || undefined,
        sourceDocument: `${doc.document_type}:${doc.document_name}`,
        expectedFields: ["full_name", "mother_name", "father_name", "rg_issuer", "birth_date"],
      },
      { enableLlmReinforcement: false },
    );

    const text = (result.text || "").trim();
    if (!text) {
      await logGeneration(admin, doc, result.engine, result.usage, "empty");
      return jsonResp(req, 200, { ok: false, reason: "empty_extraction", engine: result.engine });
    }

    // ── Writeback 1: notes ─────────────────────────────────────────────────────
    const notes = buildNotes(text, result.fields);
    const { error: upErr } = await admin
      .from("client_documents").update({ notes }).eq("id", doc.id);
    if (upErr) {
      return jsonResp(req, 500, { ok: false, reason: "update_failed", message: upErr.message });
    }

    // ── Writeback 2: cadastro (só campos vazios + alta confiança) ─────────────
    let fieldsApplied = 0;
    const applyFields = fieldsForCadastro(result.fields);
    if (doc.client_id && Object.keys(applyFields).length > 0) {
      const { data: cnt, error: rpcErr } = await admin.rpc("apply_ocr_client_fields", {
        p_client_id: doc.client_id,
        p_fields: applyFields,
      });
      if (rpcErr) result.warnings.push(`apply_ocr_client_fields: ${rpcErr.message}`);
      else fieldsApplied = Number(cnt) || 0;
    }

    // ── Log de custo ───────────────────────────────────────────────────────────
    await logGeneration(admin, doc, result.engine, result.usage, "ok");

    return jsonResp(req, 200, {
      ok: true,
      engine: result.engine,
      chars: text.length,
      confidenceOverall: result.confidenceOverall,
      fieldsApplied,
      warnings: result.warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro interno";
    return jsonResp(req, 500, { ok: false, reason: "server_error", message });
  }
});
