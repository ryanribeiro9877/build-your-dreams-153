import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useIaCost — custo em USD por chamada de LLM (P0 do Dashboard IA).
 *
 * Fonte: RPC `dashboard_ia_cost()` (SECURITY DEFINER, gate tech+sócio, mesma linha
 * do DashboardRoute / useIaMetrics). O custo operacional (`cost_real_usd`) EXCLUI
 * as sessões de teste do tech (`is_tech_test`); o custo de teste é exposto à parte
 * (`cost_test_usd`).
 *
 * Granularidade: enquanto `notes.cost_is_lower_bound` for true, o custo é um piso
 * (backfill por mensagem final, que subconta as chamadas internas do run). O número
 * sobe conforme a instrumentação por chamada (source='orchestrator') popula a tabela.
 */
export interface IaCostByModel {
  model: string | null;      // model_id_resolved (casado com model_pricing)
  raw_model: string;         // model_used real (com sufixo de data / prefixo de provider)
  generations: number;
  tokens: number;
  cost_usd: number | null;   // null quando o preço não casou (transparente, nunca chuta)
}

export interface IaCostByUser {
  user_id: string;
  name: string;
  role: string;
  generations: number;
  tokens: number;
  cost_usd: number | null;       // custo operacional (exclui teste)
  cost_test_usd: number | null;  // custo das sessões de teste do tech
}

export interface IaCostDaily {
  date: string;
  cost_usd: number | null;
}

export interface IaCost {
  window: { first: string; last: string };
  kpis: {
    generations: number;
    generations_real: number;
    cost_total_usd: number;
    cost_real_usd: number;
    cost_test_usd: number;
    tokens_total: number;
    blended_usd_per_mtok: number;
    unpriced: number;
  };
  by_model: IaCostByModel[];
  by_user: IaCostByUser[];
  daily: IaCostDaily[];
  notes: {
    granularity: string;
    cost_is_lower_bound: boolean;
  };
}

export function useIaCost() {
  const [data, setData] = useState<IaCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCost = useCallback(async () => {
    // RPC fora dos tipos gerados do Supabase → cast (padrão de useIaMetrics/useIaUsageByUser).
    const rpc = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: IaCost | null; error: { code?: string; message?: string } | null }>;
    }).rpc("dashboard_ia_cost");

    if (rpc.error) {
      setData(null);
      setError(rpc.error.code === "42501" ? "acesso_negado" : rpc.error.message ?? "Erro ao carregar custo de IA");
      return;
    }
    setData(rpc.data);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCost().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchCost]);

  return { data, loading, error, refetch: fetchCost };
}
