import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Configuracao de uma subscription Realtime do Supabase.
 *
 * Multiplas configs podem ser passadas quando o hook precisa ouvir
 * mais de uma tabela (ex: profiles + agents).
 */
export interface RealtimeConfig {
  /** Tabela Postgres a ouvir */
  table: string;
  /** Filtro Postgres (ex: "user_id=eq.abc-123"). Opcional. */
  filter?: string;
  /** Schema Postgres (default "public") */
  schema?: string;
  /** Evento a ouvir (default "*") */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
}

export interface UseSupabaseQueryOptions<T> {
  /** Chave unica para o canal Realtime (evitar colisoes entre hooks) */
  queryKey: string;
  /** Funcao que executa a query e retorna o dado. */
  fetcher: () => Promise<T>;
  /**
   * Configuracao(oes) de Realtime. Pode ser:
   * - uma unica config (atalho)
   * - um array de configs (multiplas tabelas)
   * - undefined (sem Realtime)
   */
  realtime?: RealtimeConfig | RealtimeConfig[];
  /** Se false, o fetch nao executa (default true). */
  enabled?: boolean;
}

export interface UseSupabaseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook generico que encapsula o padrao repetido nos hooks Supabase:
 *   useState(loading, error, data)  +  useCallback(fetch)
 *   + useEffect(fetch)  +  useEffect(realtime subscription)
 */
export function useSupabaseQuery<T>(
  options: UseSupabaseQueryOptions<T>,
): UseSupabaseQueryResult<T> {
  const { queryKey, fetcher, realtime, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref estavel para o fetcher, evita loops de dependencia quando o caller
  // passa uma arrow inline. O refetch/subscription sempre chama a versao mais recente.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch inicial (e re-fetch quando `enabled` ou `queryKey` mudam).
  // Incluir queryKey garante que mudanças de parâmetro embutidas na chave
  // (ex.: includeFinalized/includeCompleted) disparem novo fetch.
  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    void doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, doFetch, queryKey]);

  // Realtime subscription
  useEffect(() => {
    if (!enabled || !realtime) return;

    const configs = Array.isArray(realtime) ? realtime : [realtime];
    let channel = supabase.channel(queryKey);

    for (const cfg of configs) {
      channel = channel.on(
        "postgres_changes" as never,
        {
          event: cfg.event ?? "*",
          schema: cfg.schema ?? "public",
          table: cfg.table,
          ...(cfg.filter ? { filter: cfg.filter } : {}),
        } as never,
        (_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          void doFetch();
        },
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // queryKey e realtime config mudam quando as dependencias externas mudam
    // (ex: user.id no filter). O caller controla isso via queryKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, queryKey, doFetch]);

  return { data, loading, error, refetch: doFetch };
}
