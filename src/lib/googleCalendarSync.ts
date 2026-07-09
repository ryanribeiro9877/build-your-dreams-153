// Trilha D — ponto de extensão do sync com Google Agenda.
//
// Este arquivo é o ENCAIXE para a integração com o Google Calendar. Hoje é um stub:
// não chama nenhuma API, não faz OAuth e não toca no banco. As colunas de vínculo
// (`google_event_id`, `google_calendar_id`, `google_sync_status`, `last_synced_at`)
// já existem em `public.meetings`.
//
// ADIADO (requer ação + decisão do responsável):
//   - Criar o app OAuth no Google Cloud e guardar as credenciais no VAULT
//     (nunca hardcode no código/edge — R-6/R-8).
//   - Decidir sync unidirecional (sistema → Google) ou bidirecional. Recomendado
//     começar unidirecional.
//   - Criar/deployar a edge function `google-calendar-sync` que fará o trabalho real
//     server-side (ler credenciais do Vault, criar/atualizar evento, gravar
//     `meetings.google_*`).
//
// Quando isso existir: virar GOOGLE_SYNC_ENABLED para true (ou passar a ler de env) e
// implementar o corpo de `syncMeetingToGoogle` (ver bloco TODO abaixo).

/**
 * Liga/desliga o encaixe do sync com o Google Agenda. Enquanto `false`, o botão
 * "Sincronizar com Google Agenda" fica desabilitado e `syncMeetingToGoogle` responde
 * `not_configured`.
 */
export const GOOGLE_SYNC_ENABLED: boolean = false;

export type SyncStatus = "not_configured" | "synced" | "error";

export interface SyncResult {
  status: SyncStatus;
  message?: string;
  eventId?: string | null;
}

/**
 * Sincroniza uma reunião com o Google Agenda.
 *
 * STUB (Trilha D): enquanto `GOOGLE_SYNC_ENABLED` for `false`, retorna
 * `{ status: "not_configured" }` e NÃO lança — o caller degrada de forma suave.
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

  // TODO Trilha D — implementação real (só quando OAuth + Vault + edge existirem):
  //
  //   const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
  //     body: { meetingId },
  //   });
  //   if (error) return { status: "error", message: error.message, eventId: null };
  //   return { status: "synced", eventId: data?.eventId ?? null };
  //
  // A edge function lê as credenciais do Vault, cria/atualiza o evento no Google e
  // grava `google_event_id` / `google_sync_status` / `last_synced_at` em `meetings`.
  void meetingId;
  return { status: "not_configured", message: "Integração Google Agenda ainda não configurada.", eventId: null };
}
