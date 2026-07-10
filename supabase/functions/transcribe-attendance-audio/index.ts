// supabase/functions/transcribe-attendance-audio/index.ts
//
// TRILHA C — Transcrição do áudio do atendimento (desbloqueia o 6.2).
//
// Lê os blocos de gravação do 6.1 (client_documents 'audio_atendimento', por
// sessão) de um cliente, transcreve CADA bloco na ordem via um Transcriber
// ATRÁS DE INTERFACE (stub ou Whisper OpenAI-direto — ver _shared/transcription/),
// concatena e grava UMA linha 'transcricao_atendimento' (+ .txt no bucket).
// O attendance-summary (6.2) passa a ler essa transcrição como insumo real
// (antes lia chat_sessions.client_id, sempre vazio → "sem_conteudo").
//
// FLAG: TRANSCRIPTION_ENABLED (default OFF) como cinto-e-suspensório — flag OFF
// → no-op (idêntico ao `ocr_disabled` do ocr-attachment). O motor real vive em
// _shared/transcription/ e é selecionado pelo ÚNICO getTranscriber, plugado por
// TRANSCRIPTION_ENGINE.
//
// GOVERNANÇA: transcrição de atendimento é PII sensível → vai a OpenAI DIRETO
// (Whisper), nunca OpenRouter (assertOpenAiDirect no motor). Chave via BYOK
// (llm_provider_configs + get_provider_key_decrypted), sem secret de chave em claro.
//
// Auth: caller manda o próprio JWT; a posse do cliente é validada por RLS
// (clients_decrypted → 404 se não puder ver). A leitura dos blocos e o download
// dos binários usam service-role (admin). A gravação usa o caller (RLS
// is_recepcao_or_socio, reusada do 6.1 — nada de policy nova).
//
// IDEMPOTÊNCIA: se já existe a transcrição da sessão, devolve a existente e NÃO
// re-transcreve (controla custo do Whisper). Parâmetro `force` re-transcreve.
//
// FALHA/VAZIO: transcritor null (desligado) ou texto final vazio → NÃO grava,
// retorna { ok:false, reason } (preserva o fallback "sem_conteudo" do 6.2).
//
// Deploy: verify_jwt=ON (usa o JWT do usuário, igual ao attendance-summary).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getTranscriber } from "../_shared/transcription/index.ts";

const AUDIO_TYPE = "audio_atendimento";
const TRANSCRICAO_TYPE = "transcricao_atendimento";
const BUCKET = "client-documents";

function jsonResp(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function enabled(): boolean {
  return (Deno.env.get("TRANSCRIPTION_ENABLED") || "").trim().toLowerCase() === "true";
}

// Índice do bloco a partir do file_path: .../{sessionId}/{idx}_{ts}.webm
// Ordena 0,1,2… — a concatenação segue a ordem da gravação.
function blockIndexFromPath(filePath: string): number {
  const file = filePath.split("/").pop() ?? "";
  const m = /^(\d+)_/.exec(file);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

// Chave BYOK (mesmo padrão do attendance-summary): provider openai ativo/default
// → dono → get_provider_key_decrypted. Sem config → null.
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  try {
    // ── Cinto-e-suspensório: flag OFF → no-op ──────────────────────────────────
    if (!enabled()) return jsonResp(req, 200, { ok: false, reason: "transcription_disabled" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Auth: exige caller autenticado ─────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp(req, 401, { ok: false, reason: "not_authenticated" });

    let body: { clientId?: string; sessionId?: string; force?: boolean };
    try { body = await req.json(); } catch { return jsonResp(req, 400, { ok: false, reason: "invalid_body" }); }
    const clientId = body?.clientId;
    const sessionId = body?.sessionId;
    const force = body?.force === true;
    if (!clientId) return jsonResp(req, 400, { ok: false, reason: "missing_clientId" });
    if (!sessionId) return jsonResp(req, 400, { ok: false, reason: "missing_sessionId" });

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await caller.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return jsonResp(req, 401, { ok: false, reason: "not_authenticated" });

    // Confirma acesso do caller ao cliente (RLS clients_decrypted). 404 se não puder ver.
    const { data: cli } = await caller.from("clients_decrypted").select("id, full_name").eq("id", clientId).maybeSingle();
    if (!cli) return jsonResp(req, 404, { ok: false, reason: "client_not_found_or_forbidden" });
    const clientName = (cli as { full_name?: string }).full_name ?? "";

    // ── Idempotência: transcrição da sessão já existe? ─────────────────────────
    const filePath = `${clientId}/${TRANSCRICAO_TYPE}/${sessionId}.txt`;
    const { data: existing } = await admin.from("client_documents")
      .select("id, notes").eq("client_id", clientId).eq("document_type", TRANSCRICAO_TYPE)
      .eq("file_path", filePath).maybeSingle();
    const existingRow = existing as { id: string; notes: string | null } | null;
    if (existingRow && !force) {
      return jsonResp(req, 200, { ok: true, cached: true, chars: (existingRow.notes ?? "").length });
    }

    // ── Blocos de áudio da sessão (service-role), ordenados pelo índice ────────
    const prefix = `${clientId}/atendimento/${sessionId}/`;
    const { data: blocksData } = await admin.from("client_documents")
      .select("id, file_path, mime_type")
      .eq("client_id", clientId).eq("document_type", AUDIO_TYPE)
      .like("file_path", `${prefix}%`);
    const blocks = ((blocksData as { id: string; file_path: string; mime_type: string | null }[] | null) ?? [])
      .slice()
      .sort((a, b) => blockIndexFromPath(a.file_path) - blockIndexFromPath(b.file_path));
    if (blocks.length === 0) return jsonResp(req, 200, { ok: false, reason: "no_audio_blocks" });

    // ── Transcritor (atrás da interface canônica de _shared/transcription) ─────
    // A chave OpenAI é resolvida via BYOK e entregue como OPENAI_API_KEY ao getSecret,
    // igual ao OCR (que lê OPENAI_API_KEY do env). Sem chave → getTranscriber = null.
    const getSecret = async (key: string): Promise<string | null> => {
      if (key === "OPENAI_API_KEY") {
        const env = (Deno.env.get(key) ?? "").trim();
        if (env) return env;
        return await resolveByokKey(admin);
      }
      return Deno.env.get(key) ?? null;
    };
    const transcriber = await getTranscriber(getSecret);
    if (!transcriber) return jsonResp(req, 200, { ok: false, reason: "transcription_disabled" });

    // ── Transcreve cada bloco na ordem; concatena com separador claro ──────────
    const parts: string[] = [];
    let transcribedBlocks = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(b.file_path);
      if (dlErr || !blob) continue; // bloco ilegível → pula (não inventa conteúdo)
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const res = await transcriber.transcribe({ bytes, mimeType: b.mime_type || undefined, language: "pt" });
      const t = (res.text || "").trim();
      if (t) { parts.push(`[bloco ${i + 1}]\n${t}`); transcribedBlocks++; }
    }
    const engine = transcriber.engine;
    const fullText = parts.join("\n\n").trim();
    if (!fullText) return jsonResp(req, 200, { ok: false, reason: "empty_transcription", engine });

    // ── Grava: .txt no bucket + linha client_documents (ADMIN) ─────────────────
    // Artefato de sistema (origem='sistema'). A autorização já foi validada acima
    // (caller vê o cliente em clients_decrypted → senão 404). As escritas usam
    // service-role (mesmo padrão do ocr-attachment): o upsert do storage exige
    // UPDATE quando o objeto já existe (path determinístico por sessão / retry /
    // force) e o RLS do bucket só tem policy de INSERT — service-role bypassa.
    const blobOut = new Blob([fullText], { type: "text/plain" });
    const { error: upErr } = await admin.storage.from(BUCKET)
      .upload(filePath, blobOut, { contentType: "text/plain; charset=utf-8", upsert: true });
    if (upErr) return jsonResp(req, 500, { ok: false, reason: "upload_failed", message: upErr.message });

    const geradoEm = new Date();
    const nome = `Transcrição do atendimento ${geradoEm.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    })}`;

    if (existingRow) {
      // force → sobrescreve a linha existente (upsert do storage já foi feito acima).
      const { error: updErr } = await admin.from("client_documents")
        .update({ notes: fullText, file_size: blobOut.size, document_name: nome })
        .eq("id", existingRow.id);
      if (updErr) return jsonResp(req, 500, { ok: false, reason: "update_failed", message: updErr.message });
    } else {
      const { error: insErr } = await admin.from("client_documents").insert({
        client_id: clientId, uploaded_by: uid, client_name: clientName, document_type: TRANSCRICAO_TYPE,
        document_name: nome, file_path: filePath, file_size: blobOut.size, mime_type: "text/plain",
        notes: fullText, status: "recebido", origem: "sistema",
      });
      if (insErr) return jsonResp(req, 500, { ok: false, reason: "insert_failed", message: insErr.message });
    }

    return jsonResp(req, 200, { ok: true, engine, blocks: blocks.length, transcribedBlocks, chars: fullText.length });
  } catch (e) {
    return jsonResp(req, 500, { ok: false, reason: "server_error", message: e instanceof Error ? e.message : "erro" });
  }
});
