// ============================================================================
// Edge Function: sync-provider-credits  (PACOTE B)
// ============================================================================
// Coleta o saldo REPORTADO pela OpenRouter e grava um snapshot com fetched_at +
// status em public.provider_credit_snapshots. Em erro, grava snapshot
// status='error' (o painel usa o ultimo 'ok' e sinaliza indisponivel/stale —
// NUNCA inventa numero).
//
// OpenAI: nao ha API de saldo para chave padrao -> nada a coletar aqui; a
// estimativa e' calculada na leitora dashboard_provider_credits() a partir de
// ai_generations.
//
// Auth: header X-Cron-Secret == env CRON_SECRET (mesmo padrao do
// send-email-notifications) OU Bearer service_role. Deploy: --no-verify-jwt.
// Chave OpenRouter: mesma fonte do orquestrador (llm_provider_configs +
// RPC get_provider_key_decrypted) — nao depende de env nova.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

interface OpenRouterCredits {
  data?: { total_credits?: number; total_usage?: number };
}
interface OpenRouterAuthKey {
  data?: { limit?: number | null; usage?: number; limit_remaining?: number | null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Auth: service_role OU X-Cron-Secret ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const cronSecret = req.headers.get("X-Cron-Secret") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const expectedCronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const isCronAuth = !!expectedCronSecret && cronSecret === expectedCronSecret;

  if (!isServiceRole && !isCronAuth) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized. Provide service_role key or X-Cron-Secret header." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Grava um snapshot (insert como service_role => bypassa RLS).
  async function saveSnapshot(row: Record<string, unknown>) {
    const { error } = await admin.from("provider_credit_snapshots").insert(row);
    if (error) console.error("saveSnapshot error", error.message);
  }

  // --- Resolve a chave OpenRouter da mesma fonte do orquestrador ---
  async function resolveOpenRouterKey(): Promise<string | null> {
    const { data: cfg } = await admin.from("llm_provider_configs")
      .select("user_id").eq("provider", "openrouter").eq("is_active", true)
      .order("is_default", { ascending: false }).limit(1).maybeSingle();
    const ownerId = (cfg as { user_id?: string } | null)?.user_id;
    if (!ownerId) return null;
    const { data } = await admin.rpc("get_provider_key_decrypted", { p_user_id: ownerId, p_provider: "openrouter" });
    const rows = (data as unknown as { decrypted_key: string }[]) || [];
    return rows.length ? rows[0].decrypted_key : null;
  }

  let openrouter: Record<string, unknown> = { ok: false };

  try {
    const key = await resolveOpenRouterKey();
    if (!key) {
      await saveSnapshot({
        provider: "openrouter", kind: "reported", status: "error",
        error_msg: "Chave OpenRouter nao encontrada (llm_provider_configs ativo?)",
      });
      openrouter = { ok: false, error: "no_key" };
    } else {
      const commonHeaders = { Authorization: `Bearer ${key}` };
      let total: number | null = null;
      let usage: number | null = null;
      let remaining: number | null = null;
      let raw: unknown = null;

      // 1) endpoint preferido: /credits
      const rc = await fetch("https://openrouter.ai/api/v1/credits", { headers: commonHeaders });
      if (rc.ok) {
        const j = (await rc.json()) as OpenRouterCredits;
        raw = j;
        total = j.data?.total_credits ?? null;
        usage = j.data?.total_usage ?? null;
        remaining = (total != null && usage != null) ? total - usage : null;
      } else {
        // 2) fallback: /auth/key (limit/usage/limit_remaining)
        const rk = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: commonHeaders });
        if (!rk.ok) {
          throw new Error(`OpenRouter /credits ${rc.status} e /auth/key ${rk.status}`);
        }
        const j = (await rk.json()) as OpenRouterAuthKey;
        raw = j;
        total = j.data?.limit ?? null;         // pode ser null (chave sem limite)
        usage = j.data?.usage ?? null;
        remaining = j.data?.limit_remaining ?? (total != null && usage != null ? total - usage : null);
      }

      await saveSnapshot({
        provider: "openrouter", kind: "reported", status: "ok",
        credits_total: total, credits_used: usage, credits_remaining: remaining,
        currency: "USD", raw,
      });
      openrouter = { ok: true, credits_total: total, credits_used: usage, credits_remaining: remaining };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await saveSnapshot({ provider: "openrouter", kind: "reported", status: "error", error_msg: msg });
    openrouter = { ok: false, error: msg };
  }

  return new Response(
    JSON.stringify({ ok: true, openrouter, note: "OpenAI: sem API de saldo; estimativa via ai_generations na leitora." }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
