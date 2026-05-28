import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const [items, setItems] = useState<InterAssistantInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: rpcErr } = await supabase.rpc(
      "get_my_inter_assistant_inbox" as never,
      { p_include_finalized: includeFinalized } as never,
    );
    if (rpcErr) {
      setError(rpcErr.message);
      setItems([]);
    } else {
      setItems((data as unknown as InterAssistantInboxItem[]) || []);
    }
    setLoading(false);
  }, [user, includeFinalized]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`iar-inbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inter_assistant_requests", filter: `to_user_id=eq.${user.id}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, refresh]);

  return { items, loading, error, refresh };
}

// ─── Outbox (enviados) ────────────────────────────────────────────────────────
export function useInterAssistantOutbox(includeFinalized = true) {
  const { user } = useAuth();
  const [items, setItems] = useState<InterAssistantOutboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase.rpc(
      "get_my_inter_assistant_outbox" as never,
      { p_include_finalized: includeFinalized } as never,
    );
    setItems((data as unknown as InterAssistantOutboxItem[]) || []);
    setLoading(false);
  }, [user, includeFinalized]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`iar-outbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inter_assistant_requests", filter: `from_user_id=eq.${user.id}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, refresh]);

  return { items, loading, refresh };
}

// ─── Badge counter ────────────────────────────────────────────────────────────
export function useInterAssistantCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc("get_inter_assistant_inbox_count" as never);
    if (typeof data === "number") setCount(data);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`iar-count-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inter_assistant_requests", filter: `to_user_id=eq.${user.id}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, refresh]);

  return count;
}

// ─── Lista de destinatários elegíveis ─────────────────────────────────────────
export function useUsersForInterAssistant() {
  const [users, setUsers] = useState<UserForInterAssistant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("list_users_for_inter_assistant" as never);
      if (!cancelled) {
        setUsers((data as unknown as UserForInterAssistant[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { users, loading };
}

// ─── Helpers async ────────────────────────────────────────────────────────────
export async function createInterAssistantRequest(input: {
  to_user_id: string;
  request_type: string;
  payload?: Record<string, unknown>;
  related_task_id?: string;
  expires_in_hours?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_inter_assistant_request" as never, {
    p_to_user_id: input.to_user_id,
    p_request_type: input.request_type,
    p_payload: input.payload ?? {},
    p_related_task_id: input.related_task_id ?? null,
    p_expires_in_hours: input.expires_in_hours ?? 72,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

export async function answerInterAssistantRequest(
  requestId: string,
  responsePayload: Record<string, unknown>,
  status: "answered" | "denied" = "answered",
): Promise<void> {
  const { error } = await supabase.rpc("answer_inter_assistant_request" as never, {
    p_request_id: requestId,
    p_response_payload: responsePayload,
    p_status: status,
  } as never);
  if (error) throw error;
}
