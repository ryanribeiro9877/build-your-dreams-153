// Rascunho de reunião p/ o cartão de agendar + parser do ciclo. Espelha o
// taskDraft.ts, MAS sem conversão de fuso: create_meeting recebe date+time
// separados. normalizeMeetingDraft NUNCA inventa (ausente/ambíguo -> null).
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface MeetingDraft {
  scheduled_date: string | null; // "AAAA-MM-DD" (local)
  start_time: string | null;     // "HH:MM" (local, de parede)
  type: string | null;
  client_query: string | null;
  lawyer_hint: string | null;
  phone: string | null;
  display: string | null;
}

function validDate(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [, y, mo, d] = m; const Y = +y, Mo = +mo, D = +d;
  const dt = new Date(Date.UTC(Y, Mo - 1, D));
  if (dt.getUTCFullYear() !== Y || dt.getUTCMonth() !== Mo - 1 || dt.getUTCDate() !== D) return null;
  return `${y}-${mo}-${d}`;
}
function validTime(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(v.trim());
  if (!m) return null;
  const H = +m[1], Mi = +m[2];
  if (H > 23 || Mi > 59) return null;
  return `${m[1]}:${m[2]}`;
}

export function normalizeMeetingDraft(raw: unknown): MeetingDraft {
  const o = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  return {
    scheduled_date: validDate(s(o.scheduled_date)),
    start_time: validTime(s(o.start_time)),
    type: s(o.type),
    client_query: s(o.client_query),
    lawyer_hint: s(o.lawyer_hint),
    phone: s(o.phone),
    display: s(o.display),
  };
}

export function buildMeetingDraftPrompt(message: string, nowLocal: string, tz: string): string {
  return [
    `Você extrai um RASCUNHO de agendamento de reunião a partir de um pedido em linguagem natural.`,
    `Agora é ${nowLocal} no fuso ${tz} (horário LOCAL de parede). Responda SOMENTE um JSON com as chaves:`,
    `scheduled_date ("AAAA-MM-DD", resolvendo "hoje"/"amanhã"/dia da semana contra o "agora" acima; null se não houver),`,
    `start_time ("HH:MM" LOCAL de parede, ex.: "10:00"; SEM fuso, SEM "Z"; null se não houver),`,
    `type (tipo do atendimento, ou null), client_query (nome/termo do cliente citado, ou null),`,
    `lawyer_hint (nome do advogado citado, ou null), phone (telefone citado, ou null),`,
    `display (texto curto já resolvido, ex.: "11/07 10:00").`,
    `IMPORTANTE: NÃO converta fusos e NÃO use "Z"/offset. NUNCA invente; campo não claro = null. Só o JSON.`,
    `Pedido: """${message}"""`,
  ].join("\n");
}

export type ReuniaoAcao = "confirmed" | "done" | "canceled" | "no_show" | "reschedule" | null;

// Mapa determinístico verbo->ação. Ordem importa: "não compareceu" antes de "compareceu".
export function parseReuniaoAcao(message: string): ReuniaoAcao {
  const n = norm(message);
  if (/\b(nao compareceu|faltou|no.?show|nao veio)\b/.test(n)) return "no_show";
  if (/\b(realizad[ao]|realizar|compareceu|foi atendid[ao]|aconteceu)\b/.test(n)) return "done";
  if (/\b(cancela|cancelar|cancele|cancelad[ao])\b/.test(n)) return "canceled";
  if (/\b(reagenda|reagendar|remarca|remarcar|remarque)\b/.test(n)) return "reschedule";
  if (/\b(confirma|confirmar|confirme|confirmad[ao])\b/.test(n)) return "confirmed";
  return null;
}

export function buildAcaoPrompt(message: string, nowLocal: string, tz: string): string {
  return [
    `Extraia a REFERÊNCIA da reunião citada. Agora é ${nowLocal} (${tz}, hora local). Responda SOMENTE JSON com:`,
    `client_query (nome do cliente citado, ou null),`,
    `date_local ("AAAA-MM-DD" resolvendo hoje/amanhã/dia-da-semana, ou null),`,
    `time_local ("HH:MM" local, ou null),`,
    `new_date_local ("AAAA-MM-DD" só se for reagendamento, ou null),`,
    `new_time_local ("HH:MM" só se for reagendamento, ou null).`,
    `NÃO converta fusos, NÃO use "Z". NUNCA invente; não claro = null. Só o JSON.`,
    `Pedido: """${message}"""`,
  ].join("\n");
}
