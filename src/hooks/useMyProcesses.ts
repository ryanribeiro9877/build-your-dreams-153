import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

/**
 * Processos (casos) do usuário logado — fonte do painel lateral "Processos".
 *
 * Lê a tabela `processes` filtrada por `user_id`. Não há criação de processos
 * no app: eles são coletados/integrados ao banco externamente e aparecem aqui
 * automaticamente via Realtime.
 */
export interface MyProcess {
  id: string;
  process_number: string;
  client_name: string;
  status: string;
  responsible_lawyer: string | null;
  next_hearing_date: string | null;
  created_at: string;
}

export function useMyProcesses() {
  const { user } = useAuth();

  const { data, loading, error, refetch } = useSupabaseQuery<MyProcess[]>({
    queryKey: `my-processes-${user?.id ?? "anon"}`,
    enabled: !!user,
    fetcher: async () => {
      const { data, error: qErr } = await supabase
        .from("processes")
        .select("id, process_number, client_name, status, responsible_lawyer, next_hearing_date, created_at")
        .eq("user_id", user!.id)
        .order("next_hearing_date", { ascending: true, nullsFirst: false });
      if (qErr) throw qErr;
      return (data as MyProcess[]) ?? [];
    },
    realtime: user
      ? { table: "processes", filter: `user_id=eq.${user.id}` }
      : undefined,
  });

  return { processes: data ?? [], loading, error, refresh: refetch };
}
