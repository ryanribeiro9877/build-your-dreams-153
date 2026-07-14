import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * useTechTest — suporte ao modo "Atuar como setor" (teste de agentes do tech).
 *
 * O papel tech é o único responsável pelos agentes e, portanto, o único que os
 * testa. Como os agentes são pessoais/privados por usuário, damos ao tech acesso
 * universal por SELEÇÃO DE SETOR: ele escolhe um usuário-alvo e conversa com os
 * agentes daquele setor como se fosse o dono — mas a conversa é do tech, marcada
 * como teste (is_tech_test), isolada dos dados reais do alvo e SEM gravar efeito
 * de escrita (dry-run no orquestrador).
 *
 * Fontes:
 *  - `list_testable_sectors()` (SECURITY DEFINER, gate tech): lista os donos de
 *    agentes pessoais ativos com nome/departamento/papel. Necessário porque a
 *    RLS de profiles não deixa o tech (não-admin) ler perfis alheios.
 *  - A sessão de teste é criada por INSERT direto em chat_sessions (o trigger
 *    trg_enforce_tech_test_flags só deixa o tech ligar os flags; a RPC
 *    start_chat_session não os aceita).
 */
export interface TestableSector {
  user_id: string;
  name: string;
  department: string | null;
  role_code: string;
}

/** Rótulo amigável de um setor (nome · departamento). */
export function sectorLabel(s: Pick<TestableSector, "name" | "department">): string {
  return s.department ? `${s.name} · ${s.department}` : s.name;
}

export interface StartTestResult {
  sessionId: string | null;
  error: string | null;
}

export function useTechTest() {
  const { user, hasRole } = useAuth();
  const [sectors, setSectors] = useState<TestableSector[]>([]);
  const [loading, setLoading] = useState(false);

  const isTech = hasRole("tech");

  const load = useCallback(async () => {
    if (!isTech) { setSectors([]); return; }
    setLoading(true);
    // RPC fora dos tipos gerados do Supabase → cast (padrão de useIaMetrics).
    const rpc = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: TestableSector[] | null; error: { message?: string } | null }>;
    }).rpc("list_testable_sectors");
    if (!rpc.error && Array.isArray(rpc.data)) {
      // Exclui o próprio tech — "Meu tech" (default) já é a sessão normal dele.
      setSectors(rpc.data.filter((s) => s.user_id !== user?.id));
    }
    setLoading(false);
  }, [isTech, user?.id]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Cria uma sessão de teste apontando o entry_agent para o assistant_root do
   * alvo (a orquestração deriva toda a árvore N2/N3 de entry_agent.owner_user_id,
   * então isso faz rodar como o setor). Fallback para 'ceo' se não houver
   * assistant_root. INSERT direto — passa pelo trigger tech-only e pela RLS
   * (user_id = auth.uid()).
   */
  const startTestSession = useCallback(async (target: TestableSector): Promise<StartTestResult> => {
    if (!user) return { sessionId: null, error: "Sua sessão expirou. Faça login novamente." };

    const { data: roots, error: rootErr } = await supabase
      .from("agents")
      .select("id, role")
      .eq("owner_user_id", target.user_id)
      .in("role", ["assistant_root", "ceo"])
      .eq("is_active", true);
    if (rootErr) return { sessionId: null, error: rootErr.message };
    const rows = (roots as { id: string; role: string }[] | null) || [];
    const root = rows.find((r) => r.role === "assistant_root") ?? rows.find((r) => r.role === "ceo");
    if (!root) {
      return { sessionId: null, error: `O setor ${target.name} não tem um assistente raiz ativo para testar.` };
    }

    // Colunas is_tech_test/acting_as_user_id ainda não estão nos tipos gerados →
    // cast do builder de insert (payload conhecido, retorno { id }).
    const insert = (supabase.from("chat_sessions") as unknown as {
      insert: (v: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    }).insert({
      user_id: user.id,
      entry_agent_id: root.id,
      is_tech_test: true,
      acting_as_user_id: target.user_id,
      title: `🧪 Teste — ${sectorLabel(target)}`,
      status: "active",
    });

    const { data, error } = await insert.select("id").single();
    if (error) return { sessionId: null, error: error.message };
    return { sessionId: data?.id ?? null, error: null };
  }, [user]);

  return { sectors, loading, startTestSession, reload: load };
}
