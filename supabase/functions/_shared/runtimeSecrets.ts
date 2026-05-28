import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Lê secret da env da edge function ou da tabela edge_runtime_secrets (service role). */
export async function getRuntimeSecret(
  adminClient: SupabaseClient,
  key: string,
): Promise<string | null> {
  const fromEnv = Deno.env.get(key)?.trim();
  if (fromEnv) return fromEnv;

  const { data, error } = await adminClient.rpc("get_edge_runtime_secret", { p_key: key });
  if (error || data == null || data === "") return null;
  return String(data).trim();
}
