import { supabase } from "@/integrations/supabase/client";

/**
 * Notificação in-app (sino do header). Espelha `public.notifications`
 * (migração `add_notifications_system`). O usuário só enxerga as suas
 * (RLS `notifications_select_own`); a criação é feita pelo sistema via
 * `create_notification` (SECURITY DEFINER, só service_role) — ver o trigger
 * `trg_notify_task_assignment` em `user_tasks`.
 */
export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  actor_user_id: string | null;
  route: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Escape hatch tipado: a tabela `notifications` e as RPCs de leitura/marcação
 * ainda não estão no Database gerado (`types.ts` fica dessincronizado neste
 * projeto — mesmo padrão de [[useMeetingLawyers]]/[[useDashboardRpc]]).
 *
 * IMPORTANTE: `db` é o MESMO objeto `supabase` em runtime (apenas um cast de
 * tipo), então `.from`/`.rpc` continuam ACOPLADOS ao client — nunca desacoplar
 * o método (quebraria `this.rest`).
 */
type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (col: string, opts: { ascending: boolean }) => {
        limit: (n: number) => Promise<{ data: AppNotification[] | null; error: { message?: string } | null }>;
      };
    };
  };
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

const db = supabase as unknown as LooseClient;

const NOTIFICATION_COLS =
  "id,user_id,type,title,body,entity_type,entity_id,actor_user_id,route,read_at,created_at";

/** Últimas notificações do usuário (RLS já filtra por auth.uid()). */
export async function fetchRecentNotifications(limit = 20): Promise<AppNotification[]> {
  const { data, error } = await db
    .from("notifications")
    .select(NOTIFICATION_COLS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message ?? "Falha ao carregar notificações");
  return data ?? [];
}

/** Contagem de não-lidas (RPC `get_unread_notifications_count`). */
export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await db.rpc("get_unread_notifications_count");
  if (error) throw new Error(error.message ?? "Falha ao contar notificações");
  return typeof data === "number" ? data : 0;
}

/** Marca UMA notificação como lida (RPC escopada a auth.uid()). */
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await db.rpc("mark_notification_read", { p_id: id });
  if (error) throw new Error(error.message ?? "Falha ao marcar como lida");
}

/** Marca TODAS as não-lidas como lidas; devolve quantas foram marcadas. */
export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await db.rpc("mark_all_notifications_read");
  if (error) throw new Error(error.message ?? "Falha ao marcar todas como lidas");
  return typeof data === "number" ? data : 0;
}
