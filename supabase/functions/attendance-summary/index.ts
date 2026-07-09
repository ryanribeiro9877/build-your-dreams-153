// supabase/functions/attendance-summary/index.ts
//
// TRILHA C · 6.2 — Resumo do atendimento via LLM. Função ISOLADA (não toca no
// chat-orchestrator). Reúne o conteúdo textual do atendimento (chat da sessão do
// cliente), chama o LLM (gpt-4o-mini, jsonMode, temp 0), normaliza (anti-
// alucinação) e grava em client_documents (document_type='resumo_atendimento').
// FLAG: ATTENDANCE_SUMMARY_ENABLED (default ON; "false" desliga).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { assembleInput, buildSummaryPrompt, normalizeSummary, type AttendanceSummary } from "./attendanceSummary.ts";

function jsonResp(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
}
function enabled(): boolean {
  return (Deno.env.get("ATTENDANCE_SUMMARY_ENABLED") ?? "true").trim().toLowerCase() !== "false";
}
function providerFromModel(model: string): "openai" | "openrouter" { return model.includes("/") ? "openrouter" : "openai"; }
const ENDPOINT = { openai: "https://api.openai.com/v1/chat/completions", openrouter: "https://openrouter.ai/api/v1/chat/completions" };

async function resolveKey(admin: ReturnType<typeof createClient>, provider: string): Promise<string | null> {
  const { data: cfg } = await admin.from("llm_provider_configs")
    .select("user_id").eq("provider", provider).eq("is_active", true)
    .order("is_default", { ascending: false }).limit(1).maybeSingle();
  const ownerId = (cfg as { user_id?: string } | null)?.user_id;
  if (!ownerId) return null;
  const { data } = await admin.rpc("get_provider_key_decrypted", { p_user_id: ownerId, p_provider: provider });
  const rows = (data as unknown as { decrypted_key: string }[]) || [];
  return rows.length ? rows[0].decrypted_key : null;
}

async function callLLM(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const provider = providerFromModel(model);
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_object" },
  };
  const restricted = /^(gpt-5|o\d)/i.test(model);
  if (!restricted) body.temperature = 0;
  if (provider === "openrouter") body.max_tokens = 1200; else body.max_completion_tokens = 1200;
  const resp = await fetch(ENDPOINT[provider], {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  return j?.choices?.[0]?.message?.content ?? "{}";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  try {
    if (!enabled()) return jsonResp(req, 200, { ok: false, reason: "disabled" });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp(req, 401, { ok: false, reason: "not_authenticated" });

    let body: { clientId?: string };
    try { body = await req.json(); } catch { return jsonResp(req, 400, { ok: false, reason: "invalid_body" }); }
    const clientId = body?.clientId;
    if (!clientId) return jsonResp(req, 400, { ok: false, reason: "missing_clientId" });

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    // Confirma acesso do caller ao cliente (RLS clients_decrypted). 404 se não puder ver.
    const { data: cli } = await caller.from("clients_decrypted").select("id, full_name").eq("id", clientId).maybeSingle();
    if (!cli) return jsonResp(req, 404, { ok: false, reason: "client_not_found_or_forbidden" });
    const clientName = (cli as { full_name?: string }).full_name ?? "";

    // Reúne o insumo (service-role): sessões do cliente → mensagens; + resumos de anexos.
    const { data: sessions } = await admin.from("chat_sessions").select("id").eq("client_id", clientId);
    const sessionIds = ((sessions as { id: string }[] | null) ?? []).map((s) => s.id);
    let messages: { role: string; content: string }[] = [];
    let attachmentSummaries: string[] = [];
    if (sessionIds.length) {
      const { data: msgs } = await admin.from("chat_messages")
        .select("role, content, created_at").in("session_id", sessionIds)
        .order("created_at", { ascending: true }).limit(400);
      messages = ((msgs as { role: string; content: string }[] | null) ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant");
      const { data: atts } = await admin.from("chat_attachments")
        .select("summary").in("session_id", sessionIds).not("summary", "is", null);
      attachmentSummaries = ((atts as { summary: string }[] | null) ?? []).map((a) => a.summary);
    }
    const input = assembleInput(messages, attachmentSummaries);
    const geradoEm = new Date().toISOString();

    let summary: AttendanceSummary;
    if (!input.trim()) {
      // Sem conteúdo textual (ex.: atendimento só-áudio sem transcrição) → tudo "não informado".
      summary = normalizeSummary({}, "sem_conteudo", geradoEm);
    } else {
      const model = "gpt-4o-mini";
      const apiKey = await resolveKey(admin, providerFromModel(model));
      if (!apiKey) return jsonResp(req, 200, { ok: false, reason: "no_llm_key" });
      let raw: unknown = {};
      try { raw = JSON.parse(await callLLM(apiKey, model, buildSummaryPrompt(), input)); }
      catch { raw = {}; }
      summary = normalizeSummary(raw, "chat", geradoEm);
    }

    // Grava: arquivo JSON no bucket + linha em client_documents (caller → RLS).
    const ts = Date.parse(geradoEm);
    const filePath = `${clientId}/resumo_atendimento/${ts}.json`;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const { error: upErr } = await caller.storage.from("client-documents").upload(filePath, blob, { contentType: "application/json", upsert: false });
    if (upErr) return jsonResp(req, 500, { ok: false, reason: "upload_failed", message: upErr.message });
    const d = new Date(geradoEm);
    const pad = (n: number) => String(n).padStart(2, "0");
    const nome = `Resumo do atendimento ${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    const { error: insErr } = await caller.from("client_documents").insert({
      client_id: clientId, client_name: clientName, document_type: "resumo_atendimento",
      document_name: nome, file_path: filePath, file_size: blob.size, mime_type: "application/json",
      notes: JSON.stringify(summary), status: "recebido", origem: "sistema",
    });
    if (insErr) return jsonResp(req, 500, { ok: false, reason: "insert_failed", message: insErr.message });

    return jsonResp(req, 200, { ok: true, summary });
  } catch (e) {
    return jsonResp(req, 500, { ok: false, reason: "server_error", message: e instanceof Error ? e.message : "erro" });
  }
});
