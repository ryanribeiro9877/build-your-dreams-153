import type { Database } from "@/integrations/supabase/types";

export type MeetingStatus = Database["public"]["Enums"]["meeting_status"];

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  rescheduled: "Reagendado",
  canceled: "Cancelado",
  no_show: "Não compareceu",
  done: "Realizado",
};

export const MEETING_STATUS_OPTIONS: { value: MeetingStatus; label: string }[] = [
  { value: "scheduled", label: MEETING_STATUS_LABELS.scheduled },
  { value: "confirmed", label: MEETING_STATUS_LABELS.confirmed },
  { value: "rescheduled", label: MEETING_STATUS_LABELS.rescheduled },
  { value: "canceled", label: MEETING_STATUS_LABELS.canceled },
  { value: "no_show", label: MEETING_STATUS_LABELS.no_show },
  { value: "done", label: MEETING_STATUS_LABELS.done },
];

export const MEETING_TYPE_OPTIONS: string[] = [
  "Consulta inicial", "Retorno", "Assinatura", "Acompanhamento", "Cooperativa", "Outro",
];

export function statusLabel(s: MeetingStatus): string {
  return MEETING_STATUS_LABELS[s] ?? s;
}

/** Deriva o horário final somando `durationMin` (padrão 15) a `start` ("HH:MM" ou "HH:MM:SS"). Retorna "HH:MM". */
export function deriveEndTime(start: string, durationMin = 15): string {
  const [h, m] = start.split(":").map((n) => parseInt(n, 10));
  const total = (h * 60 + m + durationMin) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
