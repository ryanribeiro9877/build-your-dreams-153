// Trilha D — ponto de extensão do sync com Google Agenda.
//
// Este arquivo é o ENCAIXE para a integração com o Google Calendar. As colunas
// de vínculo (`google_event_id`, `google_calendar_id`, `google_sync_status`,
// `last_synced_at`) já existem em `public.meetings` e `public.audiencias`.
//
// O sync AUTOMÁTICO (ao criar/editar/cancelar) já roda sozinho via trigger de
// banco (trg_meetings_sync / trg_audiencias_sync → pg_net → edge function
// google-calendar-sync). Esta função aqui é usada pelo botão manual
// "Sincronizar com Google Agenda" no MeetingDetailModal — útil para forçar um
// resync se algo não tiver sincronizado (ex.: credenciais configuradas depois
// que a reunião já existia).
//
// ADIADO (requer ação + decisão do responsável, fora do alcance do código):
//   - Criar a conta Google dedicada do escritório + 1 calendário "Atendimentos".
//   - Criar o app OAuth no Google Cloud (External, Gmail comum) e autorizar a
//     conta central; guardar client_id/client_secret/refresh_token no Vault
//     (nunca hardcode — R-6/R-8). Ver google_calendar_config / migração
//     20260715000000_google_agenda_sync_infra.sql.
//   - Deployar a edge function `google-calendar-sync` (sempre manual, feito
//     por Ryan) e setar o secret GOOGLE_SYNC_SECRET igual ao valor do Vault
//     (google_sync_internal_auth).
//
// Quando isso existir: virar GOOGLE_SYNC_ENABLED para true.

/**
 * Liga/desliga o encaixe do sync com o Google Agenda. Enquanto `false`, o botão
 * "Sincronizar com Google Agenda" fica desabilitado e `syncMeetingToGoogle`
 * responde `not_configured`. Virar para `true` só depois de: (1) credenciais
 * no Vault (google_calendar_config), (2) edge function google-calendar-sync
 * deployada, (3) secret GOOGLE_SYNC_SECRET setado na função.
 */
export const GOOGLE_SYNC_ENABLED: boolean = false;

export type SyncStatus = "not_configured" | "synced" | "error";

export interface SyncResult {
  status: SyncStatus;
  message?: string;
  eventId?: string | null;
}

/**
 * Sincroniza uma reunião com o Google Agenda (força um resync manual — o
 * automático já roda via trigger de banco a cada criar/editar/cancelar).
 *
 * Enquanto `GOOGLE_SYNC_ENABLED` for `false`, retorna `{ status: "not_configured" }`
 * e NÃO lança — o caller degrada de forma suave.
 *
 * @param meetingId  id da reunião em `public.meetings`.
 */
export async function syncMeetingToGoogle(meetingId: string): Promise<SyncResult> {
  if (!GOOGLE_SYNC_ENABLED) {
    return {
      status: "not_configured",
      message: "Integração Google Agenda ainda não configurada.",
      eventId: null,
    };
  }

  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
    body: { recordType: "meeting", recordId: meetingId },
  });
  if (error) return { status: "error", message: error.message, eventId: null };
  if (data?.status === "not_configured") {
    return { status: "not_configured", message: data.message, eventId: null };
  }
  if (data?.status === "error") {
    return { status: "error", message: data.error ?? "Erro desconhecido", eventId: null };
  }
  return { status: "synced", eventId: data?.eventId ?? null };
}
