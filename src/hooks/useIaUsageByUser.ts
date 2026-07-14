import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useIaUsageByUser — uso & "gasto" de IA por usuário e por modelo (9.2).
 *
 * Fonte: RPC `dashboard_ia_usage_by_user()` (SECURITY DEFINER, gate tech+sócio,
 * mesma linha do DashboardRoute). Sessões de teste do tech (is_tech_test) NÃO
 * entram nos KPIs gerais, mas aqui reportamos `tokens_test`/`runs_test` como
 * recorte "dos quais, teste" por usuário.
 *
 * Não há custo em USD: `cost_usd` não é instrumentado no banco
 * (notes.usd_cost_available = false). O "gasto" é medido em tokens e no crédito
 * interno consumido (`token_consumption`).
 */
export interface IaUsageUser {
  user_id: string;
  name: string;
  role: string;
  messages: number;
  assistant_messages: number;
  runs: number;
  failed_runs: number;
  error_rate: number;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  tokens_test: number;
  runs_test: number;
  token_consumption: number;
  token_balance: number;
}

export interface IaUsageModel {
  model: string;
  messages: number;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  mapped_runs: number;
  mapped_failed: number;
  error_rate_sample: number | null;
}

export interface IaUsageRecommendation {
  level: "info" | "warn";
  model: string | null;
  message: string;
}

export interface IaUsageByUser {
  users: IaUsageUser[];
  by_model: IaUsageModel[];
  recommendations: IaUsageRecommendation[];
  notes: {
    usd_cost_available: boolean;
    model_error_coverage_runs: number;
    total_runs: number;
  };
}

export function useIaUsageByUser() {
  const [data, setData] = useState<IaUsageByUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    // RPC fora dos tipos gerados do Supabase → cast (padrão de useIaMetrics).
    const rpc = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: IaUsageByUser | null; error: { code?: string; message?: string } | null }>;
    }).rpc("dashboard_ia_usage_by_user");

    if (rpc.error) {
      setData(null);
      setError(rpc.error.code === "42501" ? "acesso_negado" : rpc.error.message ?? "Erro ao carregar uso por usuário");
      return;
    }
    setData(rpc.data);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchUsage().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchUsage]);

  return { data, loading, error, refetch: fetchUsage };
}
