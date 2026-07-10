import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MeetingLawyer {
  user_id: string;
  name: string;
  role_label: string | null;
}

type RpcRow = { user_id: string; name: string | null; role_label: string | null };

/**
 * Fonte de advogados atribuíveis a uma reunião (sócio + advogadas), para o
 * seletor "Advogado" da Agenda.
 *
 * Usa a RPC `list_meeting_lawyers()` (SECURITY DEFINER), que filtra por
 * `role_templates.code` (`'socio'` ou `LIKE 'adv_%'`) no servidor — o mesmo
 * modelo de papel do RLS `meetings_can_access`. É de propósito uma lista mais
 * estreita que [[useAssignableUsers]] (que devolve todo o roster logável e
 * continua servindo Kanban/menções de tarefa): aqui só entra quem de fato pode
 * ser o advogado da reunião, evitando o "seletor que promete e não entrega".
 *
 * Sem fallback para `profiles`: filtrar por `code` exige o servidor, e a query
 * direta de `profiles` (bloqueada pelo RLS para não-admin) voltaria a listar
 * "todo mundo" — justamente o que queremos evitar. Papéis sem acesso à agenda
 * recebem `42501`; nesse caso o hook devolve lista vazia sem erro visível.
 */
export function useMeetingLawyers() {
  const [lawyers, setLawyers] = useState<MeetingLawyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLawyers = useCallback(async () => {
    // RPC fora dos tipos gerados do Supabase → cast (padrão de useAssignableUsers).
    const rpc = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: RpcRow[] | null; error: { code?: string; message?: string } | null }>;
    }).rpc("list_meeting_lawyers");

    if (rpc.error) {
      // 42501 (papel sem acesso à agenda) é esperado → silencioso, lista vazia.
      // Qualquer outro erro também resulta em lista vazia; não listamos o roster
      // completo como fallback, pois anularia o filtro por papel.
      setLawyers([]);
      setError(rpc.error.code === "42501" ? null : rpc.error.message ?? null);
      return;
    }

    setLawyers(
      (rpc.data ?? [])
        .filter((r) => !!r.user_id)
        .map((r) => ({
          user_id: r.user_id,
          name: r.name?.trim() || "Sem nome",
          role_label: r.role_label ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    );
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchLawyers().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchLawyers]);

  return { lawyers, loading, error, refetch: fetchLawyers };
}
