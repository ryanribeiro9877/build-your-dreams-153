// supabase/functions/ocr-attachment/index.ts
//
// OCR de anexo do chat (ENCANAMENTO — Briefing 1). Lê o binário do bucket
// privado `chat-attachments`, roda um extrator ATRÁS DE INTERFACE (só o stub
// nesta fase — ver extractor.ts) e popula `chat_attachments.extracted_text`.
// Quando `extracted_text` fica populado, a imagem entra automaticamente em
// `loadCaseDocuments`/`hasReadableDocs` no orquestrador (Canal A).
//
// FLAG: respeita `OCR_ENABLED` (default OFF) como cinto-e-suspensório — mesmo
// que o front chame, com a flag OFF a função é no-op. NENHUM provedor real entra
// aqui: o extrator (stub ou Textract/híbrido) vive em `_shared/ocr/` e é
// selecionado pelo ÚNICO `getExtractor` do repo, plugado por `OCR_ENGINE`.
//
// Auth: o caller manda o próprio JWT; validamos a posse do anexo pela RLS
// (callerClient). O download do binário e o UPDATE usam service-role (adminClient).
//
// FALHA/VAZIO: se o download falhar ou o extrator devolver texto vazio, NÃO
// grava `extracted_text` (mantém null) e retorna { ok:false, reason }. Isso
// preserva o fallback do gate (imagem sem texto → imagesWithoutText, só avisa).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getExtractor } from "../_shared/ocr/index.ts";

function jsonResp(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function ocrEnabled(): boolean {
  return (Deno.env.get("OCR_ENABLED") || "").trim().toLowerCase() === "true";
}

// Deriva o provedor a partir do identificador do motor (para o dashboard de
// custo). openai-vision → openai; textract → aws; stub → stub.
function providerFromEngine(engine: string): string {
  const e = (engine || "").toLowerCase();
  if (e.includes("textract") || e.includes("aws")) return "aws";
  if (e.includes("openai") || e.includes("vision") || e.includes("gpt")) return "openai";
  if (e.includes("stub")) return "stub";
  return e || "unknown";
}

// Telemetria (espelha ocr-client-document): "nenhum custo invisível". O custo em
// tokens só existe quando o motor é LLM (openai-vision); stub/textract registram
// a chamada com tokens=0. Best-effort: um erro de log NUNCA derruba o OCR.
async function logGeneration(
  admin: SupabaseClient,
  doc: { user_id: string; session_id?: string | null },
  engine: string,
  usage: { inputTokens: number; outputTokens: number; model: string } | undefined,
  status: "ok" | "empty" | "error",
): Promise<void> {
  try {
    await admin.from("ai_generations").insert({
      user_id: doc.user_id,
      session_id: doc.session_id ?? null,
      source: "ocr-attachment",
      provider: providerFromEngine(engine),
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
    // ── Cinto-e-suspensório: flag OFF → no-op (idêntico ao comportamento atual) ──
    if (!ocrEnabled()) {
      return jsonResp(req, 200, { ok: false, reason: "ocr_disabled" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Auth: exige caller autenticado ────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResp(req, 401, { ok: false, reason: "not_authenticated" });
    }

    let body: { attachmentId?: string; storagePath?: string; sessionId?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResp(req, 400, { ok: false, reason: "invalid_body" });
    }

    const attachmentId = body?.attachmentId;
    if (!attachmentId) {
      return jsonResp(req, 400, { ok: false, reason: "missing_attachmentId" });
    }

    // callerClient carrega o JWT do usuário: a RLS de chat_attachments garante que
    // só o dono da sessão (ou admin/tech) lê a linha. Se não achar → 404 (posse).
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: att, error: attErr } = await callerClient
      .from("chat_attachments")
      .select("id, storage_path, file_name, mime_type, user_id, session_id")
      .eq("id", attachmentId)
      .maybeSingle();

    if (attErr) {
      return jsonResp(req, 500, { ok: false, reason: "select_failed", message: attErr.message });
    }
    if (!att) {
      return jsonResp(req, 404, { ok: false, reason: "attachment_not_found" });
    }

    // ── Download do binário (service-role: bypassa RLS do storage de forma estável) ──
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: blob, error: dlErr } = await adminClient.storage
      .from("chat-attachments")
      .download(att.storage_path);

    if (dlErr || !blob) {
      // Download falhou → NÃO grava extracted_text; mantém o fallback do gate.
      return jsonResp(req, 200, { ok: false, reason: "download_failed" });
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());

    // ── Extração (atrás da interface canônica de _shared/ocr) ────────────────────
    // getExtractor é o ÚNICO seletor do repo: null quando OCR desligado (flag OFF
    // ou engine ausente/desconhecido), stub em teste, textract+map em produção.
    // Os secrets vêm do env do edge (nunca do código).
    const extractor = await getExtractor((key) => Deno.env.get(key) ?? null);
    if (!extractor) {
      // OCR desligado no nível do seletor → no-op (preserva o fallback do gate).
      return jsonResp(req, 200, { ok: false, reason: "ocr_disabled" });
    }
    // A atribuição do documento (sourceDocument) é o nome do arquivo do anexo.
    const result = await extractor.extract({
      bytes,
      mimeType: att.mime_type || undefined,
      sourceDocument: att.file_name,
    });

    const text = (result.text || "").trim();
    if (!text) {
      // Extrator devolveu vazio → NÃO grava extracted_text (fica null).
      await logGeneration(adminClient, att, result.engine, result.usage, "empty");
      return jsonResp(req, 200, { ok: false, reason: "empty_extraction", engine: result.engine });
    }

    // ── Popula extracted_text + metadados de auditoria (colunas aditivas) ────────
    const { error: upErr } = await adminClient
      .from("chat_attachments")
      .update({
        extracted_text: text,
        ocr_engine: result.engine,
        ocr_confidence: result.confidenceOverall,
        ocr_fields: result.fields ?? [],
      })
      .eq("id", attachmentId);

    if (upErr) {
      return jsonResp(req, 500, { ok: false, reason: "update_failed", message: upErr.message });
    }

    // ── Log de custo (nenhum custo invisível) ────────────────────────────────
    await logGeneration(adminClient, att, result.engine, result.usage, "ok");

    return jsonResp(req, 200, {
      ok: true,
      engine: result.engine,
      chars: text.length,
      confidenceOverall: result.confidenceOverall,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro interno";
    return jsonResp(req, 500, { ok: false, reason: "server_error", message });
  }
});
