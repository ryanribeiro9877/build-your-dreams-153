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

/** Processos de um cliente. Para o picker de processo. */
export interface ClientProcessOption {
  id: string;
  process_number: string;
  description: string | null;
}

/**
 * Processos de um cliente casando por **client_id OU client_name**. A base tem
 * processos com `client_id` preenchido E processos só com `client_name` (texto),
 * e o vínculo por nome pode falhar por formatação — então buscamos pelos dois e
 * unimos por id. O `client_id` (quando existe) é o casamento confiável; o nome
 * cobre os processos legados sem FK. Espelha o vínculo textual do ProcessosTab,
 * agora reforçado pelo id.
 */
export async function fetchClientProcesses(
  clientId: string | null,
  clientName: string,
): Promise<ClientProcessOption[]> {
  const name = clientName.trim();
  if (!clientId && !name) return [];

  const runs = await Promise.all([
    clientId
      ? supabase.from("processes").select("id, process_number, description").eq("client_id", clientId)
      : null,
    name
      ? supabase.from("processes").select("id, process_number, description").eq("client_name", name)
      : null,
  ].filter((q): q is NonNullable<typeof q> => q !== null));

  const byId = new Map<string, ClientProcessOption>();
  for (const r of runs) {
    if (r.error || !r.data) continue;
    for (const row of r.data as ClientProcessOption[]) byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort((a, b) => a.process_number.localeCompare(b.process_number, "pt-BR"));
}

/**
 * Aviso não-bloqueante sobre a data/hora escolhida (RPC audiencia_datetime_aviso).
 * Retorna '' quando o horário está dentro do padrão; senão o motivo ('após as
 * 19:00', 'fim de semana / dia não útil', 'feriado', 'antes do horário de
 * expediente (08:00)'). Em erro/indisponibilidade, degrada para '' (sem aviso).
 */
export async function fetchAudienciaDatetimeAviso(iso: string): Promise<string> {
  if (!iso) return "";
  const { data, error } = await (supabase as unknown as UntypedRpc).rpc("audiencia_datetime_aviso", { p_ts: iso });
  if (error) return "";
  return (data as string) ?? "";
}
