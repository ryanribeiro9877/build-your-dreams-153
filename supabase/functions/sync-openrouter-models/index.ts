// supabase/functions/sync-openrouter-models/index.ts
//
// Sincroniza o catálogo COMPLETO de modelos da OpenRouter para a tabela
// public.model_pricing (provider='openrouter').
//
// Por que existe: antes o catálogo OpenRouter era 14 linhas fixas numa migration,
// que envelheciam. A OpenRouter expõe o catálogo vivo (400+ modelos) na API
// pública https://openrouter.ai/api/v1/models. Esta função busca esse catálogo,
// filtra os modelos que suportam tool-calling (obrigatório para os agentes do
// JurisAI) e faz upsert em model_pricing.
//
// Auth: só admin (has_role 'admin'). O caller manda JWT; a escrita usa service-role.
//
// Linhas sincronizadas são marcadas com notes=SYNC_TAG. Modelos que a OpenRouter
// deixou de oferecer (mas que já sincronizamos antes) são desativados
// (is_active=false) — nunca deletados, para não perder histórico de custo.
// Linhas OpenRouter cadastradas MANUALMENTE (notes != SYNC_TAG) não são tocadas.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SYNC_TAG = "auto:openrouter-sync";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

// numeric(10,4): valor máximo 999999.9999. Custos por MTok ficam MUITO abaixo,
// mas protegemos contra lixo/valores negativos vindos da API.
const MAX_PRICE = 999999.9999;

interface OrModel {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number | null;
  };
  supported_parameters?: string[];
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Preço por token (string) -> preço por 1M tokens, sanitizado para numeric(10,4).
function toPerMtok(perToken?: string): number {
  const n = parseFloat(perToken ?? "");
  if (!Number.isFinite(n) || n < 0) return 0;
  const perMtok = n * 1_000_000;
  const clamped = Math.min(perMtok, MAX_PRICE);
  // 4 casas decimais (precisão da coluna).
  return Math.round(clamped * 10000) / 10000;
}

// Deriva um "tier" a partir do preço de saída / capacidade de raciocínio.
// A coluna é text livre; usamos os mesmos rótulos já existentes no catálogo
// (flagship / balanced / fast / reasoning) para manter a UI consistente.
function deriveTier(m: OrModel, outPerMtok: number): string {
  const params = m.supported_parameters ?? [];
  if (params.includes("reasoning") || params.includes("include_reasoning")) {
    return "reasoning";
  }
  if (outPerMtok >= 20) return "flagship";
  if (outPerMtok >= 4) return "balanced";
  return "fast";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Auth: exige caller autenticado e admin ────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResp(401, { error: "not_authenticated" });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !caller) {
      return jsonResp(401, { error: "not_authenticated" });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: isAdmin, error: roleErr } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return jsonResp(403, {
        error: "forbidden",
        message: "Apenas administradores podem sincronizar o catálogo de modelos.",
      });
    }

    // ── Busca catálogo vivo da OpenRouter ─────────────────────────────────────
    const orRes = await fetch(OPENROUTER_MODELS_URL, {
      headers: { "Accept": "application/json" },
    });
    if (!orRes.ok) {
      const body = await orRes.text();
      return jsonResp(502, {
        error: "openrouter_unavailable",
        message: `OpenRouter respondeu ${orRes.status}: ${body.slice(0, 300)}`,
      });
    }
    const payload = await orRes.json() as { data?: OrModel[] };
    const all: OrModel[] = Array.isArray(payload?.data) ? payload.data : [];

    // ── Filtra: só modelos com suporte a tool-calling ─────────────────────────
    const withTools = all.filter((m) =>
      Array.isArray(m.supported_parameters) && m.supported_parameters.includes("tools")
    );

    // ── Mapeia para linhas de model_pricing ───────────────────────────────────
    const rows = withTools
      .filter((m) => typeof m.id === "string" && m.id.length > 0)
      .map((m) => {
        const inPerMtok = toPerMtok(m.pricing?.prompt);
        const outPerMtok = toPerMtok(m.pricing?.completion);
        const ctx = m.context_length ?? m.top_provider?.context_length ?? 128000;
        const maxOut = m.top_provider?.max_completion_tokens ?? 4096;
        const inputMods = m.architecture?.input_modalities ?? [];
        return {
          provider: "openrouter",
          model_id: m.id,
          display_name: (m.name ?? m.id).slice(0, 200),
          tier: deriveTier(m, outPerMtok),
          input_price_per_mtok: inPerMtok,
          output_price_per_mtok: outPerMtok,
          context_window: Math.max(1, Math.min(Math.trunc(ctx), 2_000_000_000)),
          max_output_tokens: Math.max(1, Math.min(Math.trunc(maxOut ?? 4096), 2_000_000_000)),
          supports_tools: true,
          supports_vision: inputMods.includes("image"),
          is_active: true,
          notes: SYNC_TAG,
        };
      });

    const freshIds = new Set(rows.map((r) => r.model_id));

    // ── Upsert em lote (chave: provider + model_id) ───────────────────────────
    let upserted = 0;
    if (rows.length > 0) {
      // Fatiar em blocos para não estourar limite de payload.
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error: upErr } = await adminClient
          .from("model_pricing")
          .upsert(chunk, { onConflict: "provider,model_id" });
        if (upErr) {
          return jsonResp(500, {
            error: "upsert_failed",
            message: upErr.message,
            upserted_before_error: upserted,
          });
        }
        upserted += chunk.length;
      }
    }

    // ── Desativa modelos auto-sincronizados que sumiram do catálogo ───────────
    const { data: existing, error: exErr } = await adminClient
      .from("model_pricing")
      .select("model_id")
      .eq("provider", "openrouter")
      .eq("notes", SYNC_TAG)
      .eq("is_active", true);
    if (exErr) {
      return jsonResp(500, { error: "select_existing_failed", message: exErr.message });
    }

    const staleIds = (existing ?? [])
      .map((r: { model_id: string }) => r.model_id)
      .filter((id) => !freshIds.has(id));

    let deactivated = 0;
    if (staleIds.length > 0) {
      const { error: deErr } = await adminClient
        .from("model_pricing")
        .update({ is_active: false })
        .eq("provider", "openrouter")
        .eq("notes", SYNC_TAG)
        .in("model_id", staleIds);
      if (deErr) {
        return jsonResp(500, { error: "deactivate_failed", message: deErr.message });
      }
      deactivated = staleIds.length;
    }

    return jsonResp(200, {
      ok: true,
      fetched: all.length,
      with_tools: withTools.length,
      upserted,
      deactivated,
      message:
        `Catálogo OpenRouter sincronizado: ${upserted} modelos ativos (com suporte a tools), ` +
        `${deactivated} desativados. Total retornado pela OpenRouter: ${all.length}.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro interno";
    return jsonResp(500, { error: "server_error", message });
  }
});
