import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AssignableUser {
  user_id: string;
  name: string;
  role_label: string | null;
}

type RpcRow = { user_id: string; name: string | null; role_label: string | null };
type ProfileRow = { user_id: string; full_name: string | null; display_name: string | null };

function normalizeName(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const v = c?.trim();
    if (v) return v;
  }
  return "Sem nome";
}

function sortByName(rows: AssignableUser[]): AssignableUser[] {
  return rows
    .filter((r) => !!r.user_id)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Fonte de usuários atribuíveis (nome + user_id) para dropdowns de
 * responsável/menção.
 *
 * Usa a RPC `list_assignable_users()` (SECURITY DEFINER, gate
 * `is_recepcao_or_socio()` no banco), que contorna o RLS de `profiles` e
 * devolve os empregados logáveis. Para papéis fora de recepção/sócio a RPC
 * responde `42501`; nesse caso — ou se a função ainda não existir no banco —
 * o hook faz *fallback* silencioso para a query direta de `profiles`
 * (comportamento anterior: o usuário vê a si mesmo; admin vê todos via RLS).
 * Assim não há regressão para nenhum papel.
 */
export function useAssignableUsers() {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (): Promise<{ cancelledSafe: true }> => {
    // 1) Caminho preferencial: RPC (não está nos tipos gerados → cast).
    const rpc = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: RpcRow[] | null; error: unknown }>;
    }).rpc("list_assignable_users");

    if (!rpc.error) {
      setUsers(
        sortByName(
          (rpc.data ?? []).map((r) => ({
            user_id: r.user_id,
            name: normalizeName(r.name),
            role_label: r.role_label ?? null,
          })),
        ),
      );
      setError(null);
      return { cancelledSafe: true };
    }

    // 2) Fallback silencioso (RPC ausente ou negada por papel): profiles direto.
    const prof = await supabase
      .from("profiles")
      .select("user_id, full_name, display_name");

    if (prof.error) {
      setUsers([]);
      setError(prof.error.message);
      return { cancelledSafe: true };
    }

    setUsers(
      sortByName(
        ((prof.data as ProfileRow[] | null) ?? []).map((p) => ({
          user_id: p.user_id,
          name: normalizeName(p.full_name, p.display_name),
          role_label: null,
        })),
      ),
    );
    setError(null);
    return { cancelledSafe: true };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchUsers().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchUsers]);

  return { users, loading, error, refetch: fetchUsers };
}
