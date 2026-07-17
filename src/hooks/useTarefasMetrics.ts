import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useTarefasMetrics — métricas de tarefas reais (Pacote C).
 *
 * Fonte: RPC `dashboard_tarefas_metrics()` sobre `user_tasks` (o modelo vivo do
 * kanban), substituindo a leitura da tabela morta `agent_tasks` que deixava o
 * "Dashboard de Tarefas" e a "Central de Eficiência" zerados. SECURITY DEFINER,
 * exclui `is_test` por padrão e declara frescor (`generated_at`).
 *
 * Escopo por papel (sem vazamento): gestão (tech/socio/lider_recepcao) vê o
 * agregado global; os demais veem apenas as próprias tarefas (assignee = eu).
 * O campo `scope` permite a tela dizer honestamente o que está mostrando.
 */
export interface TarefasKpis {
  total: number; pending: number; in_progress: number; overdue: number;
  critical: number; completed: number; pendencias_open: number; completion_rate: number;
}
export interface TarefaDept {
  key: string; total: number; pending: number; overdue: number; critical: number; score: number;
}
export interface TarefaKV { key: string; n: number }
export interface TarefaTrend { date: string; n: number }

export interface TarefasMetrics {
  scope: "global" | "pessoal";
  kpis: TarefasKpis;
  by_area: TarefaKV[];
  by_priority: TarefaKV[];
  by_status: TarefaKV[];
  by_situacao: TarefaKV[];
  by_department: TarefaDept[];
  trend_daily: TarefaTrend[];
  generated_at: string;
}

export function useTarefasMetrics() {
  const [data, setData] = useState<TarefasMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const rpc = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: TarefasMetrics | null; error: { code?: string; message?: string } | null }>;
    }).rpc("dashboard_tarefas_metrics");

    if (rpc.error) {
      setData(null);
      setError(rpc.error.code === "42501" ? "acesso_negado" : rpc.error.message ?? "Erro ao carregar métricas de tarefas");
      return;
    }
    setData(rpc.data);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchData().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
