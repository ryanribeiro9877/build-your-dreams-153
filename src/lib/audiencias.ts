// [8.3] Agenda de Audiências — rótulos/estados no front.
//
// O enum `audiencia_status` (marcada|confirmada|realizada|redesignada|cancelada)
// vive no banco (migração 20260710215335), mas NÃO está nos tipos gerados do
// Supabase (a migração foi aplicada em prod fora do repo; não regeramos types.ts
// para não arrastar drift de outras sessões). Por isso o tipo é declarado aqui à
// mão — mesma abordagem de cast usada em useAudiencias/useMeetingLawyers.
//
// Regra de arquitetura (Rodrigo): audiências podem ser simultâneas — são um ponto
// no tempo marcado pelo juízo. Aqui NÃO há slot/capacidade/expediente.

export type AudienciaStatus =
  | "marcada"
  | "confirmada"
  | "realizada"
  | "redesignada"
  | "cancelada";

export const AUDIENCIA_STATUS_LABELS: Record<AudienciaStatus, string> = {
  marcada: "Marcada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  redesignada: "Redesignada",
  cancelada: "Cancelada",
};

export const AUDIENCIA_STATUS_OPTIONS: { value: AudienciaStatus; label: string }[] = [
  { value: "marcada", label: AUDIENCIA_STATUS_LABELS.marcada },
  { value: "confirmada", label: AUDIENCIA_STATUS_LABELS.confirmada },
  { value: "realizada", label: AUDIENCIA_STATUS_LABELS.realizada },
  { value: "redesignada", label: AUDIENCIA_STATUS_LABELS.redesignada },
  { value: "cancelada", label: AUDIENCIA_STATUS_LABELS.cancelada },
];

// Cor de acento por status (semântica; independe do tema claro/escuro).
export const AUDIENCIA_STATUS_COLOR: Record<AudienciaStatus, string> = {
  marcada: "#e8c96a",
  confirmada: "#5aa9ff",
  realizada: "#4fc78e",
  redesignada: "#f0a35e",
  cancelada: "#ef5350",
};

export function audienciaStatusLabel(s: AudienciaStatus): string {
  return AUDIENCIA_STATUS_LABELS[s] ?? s;
}

// Máquina de estados (PROVISÓRIA — confirmar ciclo com Rodrigo). Terminais
// (realizada/cancelada) não saem do estado. Como o banco só valida COALESCE do
// status em update_audiencia (aceita qualquer valor do enum), esta restrição é
// só de UX; não há gate de transição no servidor.
export const AUDIENCIA_STATUS_TRANSITIONS: Record<AudienciaStatus, AudienciaStatus[]> = {
  marcada: ["confirmada", "redesignada", "realizada", "cancelada"],
  confirmada: ["redesignada", "realizada", "cancelada"],
  redesignada: ["confirmada", "realizada", "cancelada"],
  realizada: [],
  cancelada: [],
};

/** Opções de status válidas a partir do estado atual (inclui o próprio). */
export function audienciaStatusOptionsFor(current: AudienciaStatus): { value: AudienciaStatus; label: string }[] {
  const allowed = new Set<AudienciaStatus>([current, ...AUDIENCIA_STATUS_TRANSITIONS[current]]);
  return AUDIENCIA_STATUS_OPTIONS.filter((o) => allowed.has(o.value));
}

/**
 * `<input type="datetime-local">` trabalha em horário local sem timezone
 * ("YYYY-MM-DDTHH:MM"). `data_hora` no banco é timestamptz. Estas duas funções
 * convertem nos dois sentidos usando o fuso do navegador.
 */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToISO(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** "qua, 15/07/2026 · 14:30" — rótulo humano de um instante da audiência. */
export function formatAudienciaDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const data = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d).replace(".", "");
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${data} · ${hora}`;
}
