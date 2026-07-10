import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import type { AudienciaStatus } from "@/lib/audiencias";

/**
 * [8.3] Agenda de Audiências — leitura/escrita de `public.audiencias`.
 *
 * A tabela e as RPCs existem no banco (migração 20260710215335) mas estão FORA
 * dos tipos gerados do Supabase (`types.ts`). Seguimos o padrão de cast já usado
 * em useMeetingLawyers/ClientAutocomplete: acessamos `from`/`rpc` por um cast
 * pontual, mantendo o tipo `AudienciaRow` declarado à mão.
 *
 * Escrita SEMPRE por RPC SECURITY DEFINER (create_audiencia/update_audiencia) —
 * a tabela só tem policy de SELECT. Sem lógica de slot/capacidade: audiência é um
 * ponto no tempo marcado pelo juízo, pode ser simultânea (regra do Rodrigo).
 */

export interface AudienciaRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  process_id: string | null;
  process_number: string | null;
  tipo_acao: string | null;
  parte_contraria: string | null;
  data_hora: string; // ISO timestamptz
  link_local: string | null;
  advogado_user_id: string | null;
  advogado_nome: string | null;
  status: AudienciaStatus;
  observacoes: string | null;
  docs: unknown; // jsonb
  origem: string;
  data_captura: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  google_sync_status: string | null;
  last_synced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Acesso destipado à tabela (fora do types.ts gerado).
type UntypedFrom = {
  from: (t: string) => {
    select: (c: string) => {
      gte: (k: string, v: string) => {
        lte: (k: string, v: string) => {
          order: (k: string, o: { ascending: boolean }) => Promise<{ data: AudienciaRow[] | null; error: { message?: string } | null }>;
        };
      };
      eq: (k: string, v: string) => {
        order: (k: string, o: { ascending: boolean }) => Promise<{ data: AudienciaRow[] | null; error: { message?: string } | null }>;
      };
    };
  };
};
type UntypedRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

const COLS =
  "id, client_id, client_name, process_id, process_number, tipo_acao, parte_contraria, " +
  "data_hora, link_local, advogado_user_id, advogado_nome, status, observacoes, docs, origem, " +
  "data_captura, google_event_id, google_calendar_id, google_sync_status, last_synced_at, " +
  "created_by, created_at, updated_at";

export interface AudienciaFilters {
  from: string; // ISO (início do intervalo, inclusivo)
  to: string;   // ISO (fim do intervalo, inclusivo)
  status?: AudienciaStatus;
}

/**
 * Audiências num intervalo de `data_hora` (para a tela-módulo). Ordena por
 * data_hora ascendente. O filtro por advogado é aplicado no cliente (o RLS já
 * decide o que cada papel enxerga).
 */
export function useAudiencias(filters: AudienciaFilters) {
  const { user } = useAuth();
  const key = `audiencias-${filters.from}-${filters.to}-${filters.status ?? "all"}`;

  const { data, loading, error, refetch } = useSupabaseQuery<AudienciaRow[]>({
    queryKey: key,
    enabled: !!user,
    fetcher: async () => {
      const res = await (supabase as unknown as UntypedFrom)
        .from("audiencias")
        .select(COLS)
        .gte("data_hora", filters.from)
        .lte("data_hora", filters.to)
        .order("data_hora", { ascending: true });
      if (res.error) throw new Error(res.error.message ?? "Erro ao carregar audiências");
      let rows = res.data ?? [];
      if (filters.status) rows = rows.filter((r) => r.status === filters.status);
      return rows;
    },
    // Sem realtime: `audiencias` não está na publicação supabase_realtime (só
    // `meetings` está). Atualizamos via refresh() após criar/editar.
  });

  return { audiencias: data ?? [], loading, error, refresh: refetch };
}

/** Audiências de um cliente (aba do cliente). Ordena por data_hora ascendente. */
export async function fetchAudienciasByClient(clientId: string): Promise<AudienciaRow[]> {
  const res = await (supabase as unknown as UntypedFrom)
    .from("audiencias")
    .select(COLS)
    .eq("client_id", clientId)
    .order("data_hora", { ascending: true });
  if (res.error) throw new Error(res.error.message ?? "Erro ao carregar audiências");
  return res.data ?? [];
}

export interface CreateAudienciaArgs {
  p_client_id: string | null;
  p_process_id: string | null;
  p_data_hora: string; // ISO timestamptz
  p_tipo_acao?: string | null;
  p_parte_contraria?: string | null;
  p_link_local?: string | null;
  p_advogado_user_id?: string | null;
  p_observacoes?: string | null;
  p_docs?: unknown; // jsonb (default [])
}

export async function createAudiencia(args: CreateAudienciaArgs): Promise<string> {
  const { data, error } = await (supabase as unknown as UntypedRpc).rpc("create_audiencia", args as Record<string, unknown>);
  if (error) throw new Error(error.message ?? "Falha ao criar audiência");
  return data as string;
}

export interface UpdateAudienciaArgs {
  p_id: string;
  // Todos opcionais: o banco faz COALESCE (null preserva o valor atual).
  p_data_hora?: string | null;
  p_tipo_acao?: string | null;
  p_parte_contraria?: string | null;
  p_link_local?: string | null;
  p_advogado_user_id?: string | null;
  p_status?: AudienciaStatus | null;
  p_observacoes?: string | null;
  p_docs?: unknown;
}

export async function updateAudiencia(args: UpdateAudienciaArgs): Promise<void> {
  const { error } = await (supabase as unknown as UntypedRpc).rpc("update_audiencia", args as Record<string, unknown>);
  if (error) throw new Error(error.message ?? "Falha ao atualizar audiência");
}

/** Processos de um cliente (vínculo por `client_name`, como ProcessosTab). Para o picker de processo. */
export interface ClientProcessOption {
  id: string;
  process_number: string;
  description: string | null;
}
export async function fetchProcessesByClientName(clientName: string): Promise<ClientProcessOption[]> {
  const term = clientName.trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from("processes")
    .select("id, process_number, description")
    .eq("client_name", term)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as ClientProcessOption[]) ?? [];
}
