import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ClientFilters } from "@/components/clients/ClientFiltersPanel";

export interface ClientSavedFilter {
  id: string;
  name: string;
  filter: Partial<ClientFilters>;
  created_at: string;
}

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
const rpc = () => (supabase as unknown as { rpc: Rpc }).rpc;

// Erros que indicam "função ainda não existe" (salvaguarda de degradação).
function isMissingFn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42883" || err.code === "PGRST202"
    || /function .* does not exist|could not find the function/i.test(err.message ?? "");
}

export function useClientSavedFilters() {
  const [savedFilters, setSavedFilters] = useState<ClientSavedFilter[]>([]);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await rpc()("get_my_client_saved_filters");
    if (error) { if (isMissingFn(error)) setAvailable(false); return; }
    setAvailable(true);
    setSavedFilters((data as ClientSavedFilter[]) ?? []);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (name: string, filter: Partial<ClientFilters>) => {
    const { error } = await rpc()("client_save_filter", { p_name: name, p_filter: filter });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await rpc()("client_delete_saved_filter", { p_id: id });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  return { savedFilters, available, save, remove, refresh };
}
