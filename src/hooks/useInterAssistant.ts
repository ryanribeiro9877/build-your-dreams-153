import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import type { InterAssistantStatus } from "@/types/jurisai";

/**
 * Hooks de protocolo inter-Assistente (V19).
 *
 * Cada usuário tem "Meu Assistente" (role 'assistant_root'). Esses Assistentes
 * podem trocar pedidos entre si:
 *   - useInterAssistantInbox  → pedidos RECEBIDOS pelo user (responder)
 *   - useInterAssistantOutbox → pedidos FEITOS pelo user (acompanhar)
 *   - useInterAssistantCount  → badge no header
 *   - useUsersForInterAssistant → lista quem pode ser destinatário
 *
 * Realtime via canal inter_assistant_requests.
 */

export interface InterAssistantInboxItem {
  id: string;
  from_user_id: string;
  from_user_name: string;
  from_user_role_label: string;
  request_type: string;
  payload: Record<string, unknown>;
  status: InterAssistantStatus;
  related_task_id: string | null;
  expires_at: string | null;
  created_at: string;
  is_expired: boolean;
}

export interface InterAssistantOutboxItem {
  id: string;
  to_user_id: string;
  to_user_name: string;
  to_user_role_label: string;
  request_type: string;
  payload: Record<string, unknown>;
  status: InterAssistantStatus;
  response_payload: Record<string, unknown> | null;
  related_task_id: string | null;
  answered_at: string | null;
  created_at: string;
}

export interface UserForInterAssistant {
  user_id: string;
  full_name: string;
  role_label: string;
  has_assistant: boolean;
}

// ─── Inbox (recebidos) ────────────────────────────────────────────────────────
export function useInterAssistantInbox(includeFinalized = false) {
  const { user } = useAuth();

  const { data, loading, error, refetch } = useSupabaseQuery<InterAssistantInboxItem[]>({
    queryKey: `iar-inbox-${user?.id ?? "anon"}`,
    enabled: !!user,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc(
        "get_my_inter_assistant_inbox",
        { p_include_finalized: includeFinalized },
      );
      if (rpcErr) throw rpcErr;
      return (data as unknown as InterAssistantInboxItem[]) || [];
    },
    realtime: user
      ? { table: "inter_assistant_requests", filter: `to_user_id=eq.${user.id}` }
      : undefined,
  });

  return { items: data ?? [], loading, error, refresh: refetch };
}

// ─── Outbox (enviados) ────────────────────────────────────────────────────────
export function useInterAssistantOutbox(includeFinalized = true) {
  const { user } = useAuth();

  const { data, loading, refetch } = useSupabaseQuery<InterAssistantOutboxItem[]>({
    queryKey: `iar-outbox-${user?.id ?? "anon"}`,
    enabled: !!user,
    fetcher: async () => {
      const { data } = await supabase.rpc(
        "get_my_inter_assistant_outbox",
        { p_include_finalized: includeFinalized },
      );
      return (data as unknown as InterAssistantOutboxItem[]) || [];
    },
    realtime: user
      ? { table: "inter_assistant_requests", filter: `from_user_id=eq.${user.id}` }
      : undefined,
  });

  return { items: data ?? [], loading, refresh: refetch };
}

// ─── Badge counter ────────────────────────────────────────────────────────────
export function useInterAssistantCount() {
  const { user } = useAuth();

  const { data } = useSupabaseQuery<number>({
    queryKey: `iar-count-${user?.id ?? "anon"}`,
    enabled: !!user,
    fetcher: async () => {
      const { data } = await supabase.rpc("get_inter_assistant_inbox_count");
      return typeof data === "number" ? data : 0;
    },
    realtime: user
      ? { table: "inter_assistant_requests", filter: `to_user_id=eq.${user.id}` }
      : undefined,
  });

  return data ?? 0;
}

// ─── Lista de destinatários elegíveis ─────────────────────────────────────────
export function useUsersForInterAssistant() {
  const { data, loading } = useSupabaseQuery<UserForInterAssistant[]>({
    queryKey: "iar-users",
    fetcher: async () => {
      const { data } = await supabase.rpc("list_users_for_inter_assistant");
      return (data as unknown as UserForInterAssistant[]) || [];
    },
  });

  return { users: data ?? [], loading };
}

// ─── Helpers async ────────────────────────────────────────────────────────────
export async function createInterAssistantRequest(input: {
  to_user_id: string;
  request_type: string;
  payload?: Record<string, unknown>;
  related_task_id?: string;
  expires_in_hours?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_inter_assistant_request", {
    p_to_user_id: input.to_user_id,
    p_request_type: input.request_type,
    p_payload: (input.payload ?? {}) as unknown as Json,
    p_related_task_id: input.related_task_id ?? null,
    p_expires_in_hours: input.expires_in_hours ?? 72,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function answerInterAssistantRequest(
  requestId: string,
  responsePayload: Record<string, unknown>,
  status: "answered" | "denied" = "answered",
): Promise<void> {
  const { error } = await supabase.rpc("answer_inter_assistant_request", {
    p_request_id: requestId,
    p_response_payload: responsePayload as unknown as Json,
    p_status: status,
  });
  if (error) throw error;
}
