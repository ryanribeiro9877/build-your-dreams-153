import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook genérico para as RPCs agregadas de dashboard (SECURITY DEFINER, gate
 * tech/sócio no servidor). Todas devolvem um JSON único, então uma chamada
 * popula a página. `42501` (papel sem acesso) vira "acesso_negado" — a rota já
 * bloqueia antes via [[DashboardRoute]], mas evita vazar mensagem técnica.
 *
 * Usado por [[useIaMetrics]]-equivalentes (operacional/prazos). A RPC fica fora
 * dos tipos gerados do Supabase → cast (mesmo padrão de [[useMeetingLawyers]]).
 */
export function useDashboardRpc<T>(fn: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const rpc = await (supabase as unknown as {
      rpc: (f: string) => Promise<{ data: T | null; error: { code?: string; message?: string } | null }>;
    }).rpc(fn);

    if (rpc.error) {
      setData(null);
      setError(rpc.error.code === "42501" ? "acesso_negado" : rpc.error.message ?? "Erro ao carregar métricas");
      return;
    }
    setData(rpc.data);
    setError(null);
  }, [fn]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchData().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
