// supabase/functions/transcribe-audio/index.ts
//
// Transcrição do ÁUDIO do chat (Trilho A — chat multimodal). Espelha a
// `ocr-attachment` (mesmo fluxo do chat, anexo em `chat_attachments`), mas para
// áudio: lê a linha do anexo por id, baixa o binário do bucket privado
// `chat-attachments`, transcreve via um Transcriber ATRÁS DE INTERFACE
// (Whisper OpenAI-direto ou stub — ver `_shared/transcription/`) e popula
// `chat_attachments.extracted_text`. O front usa o texto devolvido para
// preencher o campo de digitação (fluxo gravar → revisar → enviar).
//
// FLAG: `TRANSCRIPTION_ENABLED` (default OFF) como cinto-e-suspensório — flag OFF
// → no-op (idêntico ao `ocr_disabled` da `ocr-attachment`). Config
// (TRANSCRIPTION_ENABLED/ENGINE/MODEL) vem de `edge_runtime_secrets` (via RPC
// get_edge_runtime_secret, service_role), com fallback para env. O motor real
// vive em `_shared/transcription/` e é selecionado pelo ÚNICO `getTranscriber`,
// plugado por `TRANSCRIPTION_ENGINE`.
//
// GOVERNANÇA: transcrição é PII sensível → vai a OpenAI DIRETO (Whisper), nunca
// OpenRouter (assertOpenAiDirect no motor). Chave via BYOK (llm_provider_configs
// + get_provider_key_decrypted), sem secret de chave em claro.
//
// Auth: verify_jwt=true no deploy (gateway valida o JWT). Dentro, a POSSE do anexo
// é re-validada pela RLS de `chat_attachments` (callerClient → 404 se não puder
// ver). O download do binário e o UPDATE usam service-role (adminClient). NÃO há
// secret interno/trigger — o único chamador é o front autenticado.
//
// FALHA/VAZIO: transcritor null (desligado) ou texto final vazio → NÃO grava,
// retorna { ok:false, reason }. Custo do Whisper é por MINUTO (não por token):
// logamos a linha em `ai_generations` (source=transcribe-audio) com tokens 0 —
// o cálculo de custo por minuto fica como follow-up.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getTranscriber } from "../_shared/transcription/index.ts";

function jsonResp(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// Config: edge_runtime_secrets (via RPC) com fallback para env — mesmo padrão
// da `ocr-client-document`. A flag e o engine/modelo vivem em edge_runtime_secrets.
async function getEdgeSecret(admin: SupabaseClient, key: string): Promise<string | null> {
  const env = (Deno.env.get(key) || "").trim();
  if (env) return env;
  try {
    const { data } = await admin.rpc("get_edge_runtime_secret", { p_key: key });
    const v = (data as string | null) ?? null;
    if (v && v.toString().trim()) return v.toString().trim();
  } catch {
    // sem RPC / erro → sem valor
  }
  return null;
}

// Chave BYOK (mesmo padrão do attendance-summary/ocr-client-document): provider
// openai ativo/default → dono → get_provider_key_decrypted. Sem config → null.
async function resolveByokKey(admin: SupabaseClient, provider = "openai"): Promise<string | null> {
  const { data: cfg } = await admin.from("llm_provider_configs")
    .select("user_id").eq("provider", provider).eq("is_active", true)
    .order("is_default", { ascending: false }).limit(1).maybeSingle();
  const ownerId = (cfg as { user_id?: string } | null)?.user_id;
  if (!ownerId) return null;
  const { data } = await admin.rpc("get_provider_key_decrypted", { p_user_id: ownerId, p_provider: provider });
  const rows = (data as unknown as { decrypted_key: string }[]) || [];
  return rows.length ? rows[0].decrypted_key : null;
}

async function logGeneration(
  admin: SupabaseClient,
  userId: string,
  model: string | null,
  status: "ok" | "empty" | "error",
): Promise<void> {
  try {
    await admin.from("ai_generations").insert({
      user_id: userId,
      source: "transcribe-audio",
      provider: "openai",
      model,
      stage: "transcribe",
      status: status === "error" ? "error" : "ok",
      error_type: status === "empty" ? "empty_transcription" : null,
      input_tokens: 0,
      output_tokens: 0,
    });
  } catch {
    // log é best-effort; nunca derruba a transcrição.
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

    // ── Cinto-e-suspensório: flag OFF → no-op ──────────────────────────────────
    const enabled = ((await getEdgeSecret(admin, "TRANSCRIPTION_ENABLED")) || "")
      .toLowerCase() === "true";
    if (!enabled) {
      return jsonResp(req, 200, { ok: false, reason: "transcription_disabled" });
    }

    // ── Auth: exige caller autenticado ─────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResp(req, 401, { ok: false, reason: "not_authenticated" });
    }

    let body: { attachmentId?: string };
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
    const { data: userData } = await callerClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      return jsonResp(req, 401, { ok: false, reason: "not_authenticated" });
    }

    const { data: att, error: attErr } = await callerClient
      .from("chat_attachments")
      .select("id, storage_path, mime_type")
      .eq("id", attachmentId)
      .maybeSingle();

    if (attErr) {
      return jsonResp(req, 500, { ok: false, reason: "select_failed", message: attErr.message });
    }
    if (!att) {
      return jsonResp(req, 404, { ok: false, reason: "attachment_not_found" });
    }

    // ── Download do binário (service-role: bypassa RLS do storage de forma estável) ──
    const { data: blob, error: dlErr } = await admin.storage
      .from("chat-attachments")
      .download(att.storage_path);

    if (dlErr || !blob) {
      return jsonResp(req, 200, { ok: false, reason: "download_failed" });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // ── Transcritor (atrás da interface canônica de _shared/transcription) ─────
    // TRANSCRIPTION_ENGINE/MODEL de edge_runtime_secrets; OPENAI_API_KEY via
    // env → BYOK. Sem chave / engine desligado → getTranscriber = null.
    const getSecret = async (key: string): Promise<string | null> => {
      if (key === "OPENAI_API_KEY") {
        const env = (Deno.env.get(key) ?? "").trim();
        if (env) return env;
        return await resolveByokKey(admin);
      }
      return await getEdgeSecret(admin, key);
    };
    const transcriber = await getTranscriber(getSecret);
    if (!transcriber) {
      return jsonResp(req, 200, { ok: false, reason: "transcription_disabled" });
    }

    const model = (await getEdgeSecret(admin, "TRANSCRIPTION_MODEL")) ?? "whisper-1";

    const res = await transcriber.transcribe({
      bytes,
      mimeType: att.mime_type || undefined,
      language: "pt",
    });
    const text = (res.text || "").trim();
    if (!text) {
      await logGeneration(admin, uid, model, "empty");
      return jsonResp(req, 200, { ok: false, reason: "empty_transcription", engine: transcriber.engine });
    }

    // ── Popula extracted_text (admin) ──────────────────────────────────────────
    const { error: upErr } = await admin
      .from("chat_attachments")
      .update({ extracted_text: text })
      .eq("id", attachmentId);

    if (upErr) {
      return jsonResp(req, 500, { ok: false, reason: "update_failed", message: upErr.message });
    }

    await logGeneration(admin, uid, model, "ok");

    return jsonResp(req, 200, {
      ok: true,
      text,
      chars: text.length,
      engine: transcriber.engine,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro interno";
    return jsonResp(req, 500, { ok: false, reason: "server_error", message });
  }
});
