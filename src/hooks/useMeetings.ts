import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import type { Database } from "@/integrations/supabase/types";
import type { MeetingStatus } from "@/lib/meetings";

/**
 * Linha da tabela `meetings`. Definida explicitamente porque a tabela existe
 * no banco (produção) mas ainda não foi incorporada ao types.ts gerado
 * (desync repo↔banco). Ao rodar `npm run types:regen`, esta interface pode
 * ser trocada por Database["public"]["Tables"]["meetings"]["Row"].
 */
export interface MeetingRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  phone: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string | null;
  type: string | null;
  lawyer_user_id: string | null;
  receptionist_user_id: string | null;
  summary: string | null;
  status: MeetingStatus;
  notes: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  google_sync_status: string | null;
  last_synced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  reminder_sent_at: string | null;
}
export type MeetingAuditRow =
  Database["public"]["Functions"]["get_meeting_audit"]["Returns"][number];

export interface MeetingFilters {
  from: string; // "YYYY-MM-DD"
  to: string;   // "YYYY-MM-DD"
  lawyerId?: string;
  status?: MeetingStatus;
}

export function useMeetings(filters: MeetingFilters) {
  const { user } = useAuth();
  const key = `meetings-${filters.from}-${filters.to}-${filters.lawyerId ?? "all"}-${filters.status ?? "all"}`;

  const { data, loading, error, refetch } = useSupabaseQuery<MeetingRow[]>({
    queryKey: key,
    enabled: !!user,
    fetcher: async () => {
      let q = supabase
        .from("meetings")
        .select("*")
        .gte("scheduled_date", filters.from)
        .lte("scheduled_date", filters.to)
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (filters.lawyerId) q = q.eq("lawyer_user_id", filters.lawyerId);
      if (filters.status) q = q.eq("status", filters.status);
      const { data, error: qErr } = await q;
      if (qErr) throw qErr;
      return (data as MeetingRow[]) ?? [];
    },
    realtime: { table: "meetings" },
  });

  return { meetings: data ?? [], loading, error, refresh: refetch };
}

export interface CreateMeetingArgs {
  p_scheduled_date: string;
  p_start_time: string;
  p_client_id?: string | null;
  p_client_name?: string | null;
  p_phone?: string | null;
  p_end_time?: string | null;
  p_type?: string | null;
  p_lawyer_user_id?: string | null;
  p_receptionist_user_id?: string | null;
  p_summary?: string | null;
  p_notes?: string | null;
  p_status?: MeetingStatus;
}

export async function createMeeting(args: CreateMeetingArgs): Promise<string> {
  const { data, error } = await supabase.rpc("create_meeting", args);
  if (error) throw error;
  return data as string;
}

export interface UpdateMeetingArgs {
  p_id: string;
  p_scheduled_date: string;
  p_start_time: string;
  p_end_time: string | null;
  p_type: string | null;
  p_lawyer_user_id: string | null;
  p_receptionist_user_id: string | null;
  p_client_id: string | null;
  p_client_name: string | null;
  p_phone: string | null;
  p_summary: string | null;
  p_notes: string | null;
  p_status: MeetingStatus;
}

export async function updateMeeting(args: UpdateMeetingArgs): Promise<void> {
  const { error } = await supabase.rpc("update_meeting", args);
  if (error) throw error;
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_meeting", { p_id: id });
  if (error) throw error;
}

export async function getMeetingAudit(id: string): Promise<MeetingAuditRow[]> {
  const { data, error } = await supabase.rpc("get_meeting_audit", { p_meeting_id: id });
  if (error) throw error;
  return (data as MeetingAuditRow[]) ?? [];
}

/** Slots disponíveis (HH:MM) para a data — os cheios já vêm removidos pelo banco (5.2). */
export async function getAvailableSlots(dateISO: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_available_slots", { p_date: dateISO });
  if (error) throw error;
  return ((data as { slot: string }[]) ?? []).map((r) => r.slot.slice(0, 5));
}

/** Cria uma tarefa vinculada à reunião + cliente (5.3). Retorna o id da tarefa. */
export async function createMeetingTask(meetingId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_meeting_task", { p_meeting_id: meetingId });
  if (error) throw error;
  return data as string;
}
