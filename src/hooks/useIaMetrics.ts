import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Métricas agregadas do Dashboard IA (subtask 9.2 "Comparativo IA × humano").
 *
 * Fonte: RPC `dashboard_ia_metrics()` (SECURITY DEFINER, gate tech/sócio no
 * servidor — mesma linha do guard [[DashboardRoute]]). A RPC devolve tudo num
 * único JSON, então uma chamada popula a página inteira. Papéis fora de
 * ('tech','socio') recebem 42501; a rota já bloqueia antes, mas o hook trata o
 * caso para não vazar mensagem de erro técnica.
 *
 * Só há custo em tokens (input/output) porque `cost_usd`/`total_cost_usd` nunca
 * foram instrumentados no banco e `model_pricing` não casa com `model_used`;
 * exibir USD seria número inventado. Latência = duração de run (mediana p50),
 * robusta à cauda longa de runs que ficaram abertos.
 */
export interface IaMetrics {
  window: { first: string; last: string };
  kpis: {
    total_runs: number;
    success_runs: number;
    failed_runs: number;
    success_rate: number;
    run_latency_p50_ms: number;
    run_latency_p90_ms: number;
    sessions: number;
    messages_total: number;
    tokens_input: number;
    tokens_output: number;
  };
  run_status: { key: string; n: number }[];
  intents: { key: string; n: number }[];
  turns: { key: string; n: number }[];
  by_model: { model: string; messages: number; tokens_in: number; tokens_out: number }[];
  latency_buckets: { key: string; n: number }[];
  volume_daily: { date: string; runs: number; human: number; ai: number }[];
}

export function useIaMetrics() {
  const [data, setData] = useState<IaMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    // RPC fora dos tipos gerados do Supabase → cast (padrão de useMeetingLawyers).
    const rpc = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: IaMetrics | null; error: { code?: string; message?: string } | null }>;
    }).rpc("dashboard_ia_metrics");

    if (rpc.error) {
      setData(null);
      // 42501 = papel sem acesso (a rota já protege); evita mensagem técnica.
      setError(rpc.error.code === "42501" ? "acesso_negado" : rpc.error.message ?? "Erro ao carregar métricas");
      return;
    }
    setData(rpc.data);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchMetrics().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchMetrics]);

  return { data, loading, error, refetch: fetchMetrics };
}
