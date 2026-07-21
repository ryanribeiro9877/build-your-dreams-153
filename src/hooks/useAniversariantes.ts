import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Aniversariante } from "@/lib/aniversariantes";

/**
 * useAniversariantes — clientes que fazem aniversário HOJE (card da recepção).
 *
 * Fonte: RPC `aniversariantes_do_dia()` (SECURITY DEFINER), que já vem filtrada
 * (hoje no fuso America/Bahia, exclui is_test) e GATED por is_recepcao() no
 * banco — quem não é recepção recebe 42501. A tela só monta este hook para a
 * recepção (ver AniversariantesCard), mas ainda tratamos 42501 → "acesso_negado"
 * para nunca quebrar caso um papel indevido o alcance.
 *
 * Cast `(supabase as unknown as ...)`: a RPC é nova e ainda não está nos tipos
 * gerados (desync repo↔banco), mesmo padrão de useTarefasMetrics.
 */
export function useAniversariantes() {
  const [data, setData] = useState<Aniversariante[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const rpc = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: Aniversariante[] | null; error: { code?: string; message?: string } | null }>;
    }).rpc("aniversariantes_do_dia");

    if (rpc.error) {
      setData([]);
      setError(rpc.error.code === "42501" ? "acesso_negado" : rpc.error.message ?? "Erro ao carregar aniversariantes");
      return;
    }
    setData(rpc.data ?? []);
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
