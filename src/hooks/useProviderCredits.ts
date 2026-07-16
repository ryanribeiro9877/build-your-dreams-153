import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useProviderCredits — créditos por provedor (Pacote B do monitoramento).
 *
 * Fonte: RPC `dashboard_provider_credits()` (SECURITY DEFINER, gate tech+sócio,
 * mesma linha do DashboardRoute / useIaCost). Nunca inventa saldo:
 *  - OpenRouter: saldo REPORTADO (último snapshot ok do job horário); se não há
 *    coleta ou a última falhou, `reported.available=false` com a razão declarada,
 *    e `stale=true` quando o snapshot ok tem > 24h.
 *  - OpenAI: sem API de saldo p/ chave padrão → `reported.available=false`; o bloco
 *    `estimated` calcula gasto/burn/projeção a partir de `ai_generations`, e — se
 *    houver budget informado via [[set_provider_budget]] — restante e runway.
 *
 * Custo próprio é piso (`cost_is_lower_bound`), como no Dashboard IA.
 */
export interface ProviderReported {
  available: boolean;
  reason?: string;
  credits_total?: number | null;
  credits_used?: number | null;
  credits_remaining?: number | null;
  currency?: string;
  fetched_at?: string | null;
  stale?: boolean;
  last_error_at?: string | null;
}

export interface OurSpend {
  total: number;
  d7: number;
  d30: number;
  burn_daily_7d: number;
  cost_is_lower_bound: boolean;
}

export interface OpenAiEstimated {
  total_usd: number;
  d7: number;
  d30: number;
  burn_daily_7d: number;
  projection_30d: number;
  cost_is_lower_bound: boolean;
  budget_usd?: number;
  budget_start?: string;
  spent_since_budget?: number;
  remaining_estimated?: number;
  runway_days_estimated?: number | null;
}

export interface ProviderCredits {
  openrouter: { reported: ProviderReported; our_spend_usd: OurSpend };
  openai: { reported: ProviderReported; estimated: OpenAiEstimated };
  notes: { billing_map: string; cost_disclaimer: string; generated_at: string };
}

export function useProviderCredits() {
  const [data, setData] = useState<ProviderCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    // RPC fora dos tipos gerados do Supabase → cast (padrão de useIaCost).
    const rpc = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: ProviderCredits | null; error: { code?: string; message?: string } | null }>;
    }).rpc("dashboard_provider_credits");

    if (rpc.error) {
      setData(null);
      setError(rpc.error.code === "42501" ? "acesso_negado" : rpc.error.message ?? "Erro ao carregar créditos");
      return;
    }
    setData(rpc.data);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCredits().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchCredits]);

  // Informa o crédito comprado (upsert em provider_budgets, gate tech/sócio).
  const setBudget = useCallback(async (provider: string, budgetUsd: number, start?: string, notes?: string) => {
    const rpc = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    }).rpc("set_provider_budget", {
      p_provider: provider, p_budget_usd: budgetUsd,
      p_start: start ?? null, p_notes: notes ?? null,
    });
    if (rpc.error) throw new Error(rpc.error.message ?? "Erro ao salvar o crédito");
    await fetchCredits();
  }, [fetchCredits]);

  return { data, loading, error, refetch: fetchCredits, setBudget };
}
