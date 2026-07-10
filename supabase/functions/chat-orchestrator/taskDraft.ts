// supabase/functions/chat-orchestrator/taskDraft.ts
//
// Card 4.1 — Rascunho de tarefa via LLM + normalização (sem alucinação).
//
// O parse do LLM é RASCUNHO: normalizeDraft NUNCA inventa. Campo ausente ou
// ambíguo → null (fica em aberto no cartão de confirmação para o usuário
// completar/corrigir).
//
// FUSO / PRAZO (fix +3h, 2026-07-09): o LLM devolve o prazo como HORÁRIO LOCAL
// DE PAREDE (deadline_local, "AAAA-MM-DDTHH:mm:ss", SEM fuso), que ele resolve
// de forma confiável ("amanhã 10h" → 10:00 local). A conversão local→UTC é
// feita UMA ÚNICA VEZ, em CÓDIGO (localWallTimeToUtcISO) — o LLM NUNCA faz
// aritmética de offset. Antes, o modelo recebia o "agora" em UTC rotulado como
// America/Bahia e, de forma NÃO-determinística, dobrava o offset −03:00 no
// deadline_at (10:00 virava 16:00Z em vez de 13:00Z; +3h). Tirar o offset das
// mãos do LLM elimina a classe inteira do bug.

export interface TaskDraft {
  title: string | null;
  description: string | null;
  deadline_local: string | null;        // hora LOCAL de parede do LLM ("AAAA-MM-DDTHH:mm:ss"), sem fuso
  deadline_at: string | null;           // ISO UTC computado no edge; NUNCA vem do LLM
  deadline_display: string | null;      // "amanhã 10:00" já resolvido p/ conferência
  priority: "critical" | "high" | "medium" | "low" | null;
  client_query: string | null;          // termo p/ resolver cliente (não resolve aqui)
  assignee_hint: string | null;         // nome mencionado, ou null (fica em aberto)
}

const PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// Valida o JSON retornado pelo LLM. Entrada não é objeto → tudo null (aberto).
// deadline_at é DELIBERADAMENTE ignorado do payload do LLM: só o edge o calcula
// (localWallTimeToUtcISO), a partir de deadline_local — ver nota de fuso acima.
export function normalizeDraft(raw: unknown): TaskDraft {
  const o = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const prio = s(o.priority);
  return {
    title: s(o.title),
    description: s(o.description),
    deadline_local: s(o.deadline_local),
    deadline_at: null,                   // computado no edge, nunca aceito do LLM
    deadline_display: s(o.deadline_display),
    priority: prio && PRIORITIES.has(prio) ? prio as TaskDraft["priority"] : null,
    client_query: s(o.client_query),
    assignee_hint: s(o.assignee_hint),
  };
}

// Offset (minutos à frente do UTC; −180 p/ America/Bahia) do fuso `tz` no
// instante `at`. Usa Intl (base de fusos do runtime), então respeita a regra
// real do fuso — não há constante −03:00 cravada no código.
function tzOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const g: Record<string, number> = {};
  for (const p of dtf.formatToParts(at)) if (p.type !== "literal") g[p.type] = Number(p.value);
  let hour = g.hour; if (hour === 24) hour = 0; // Intl pode emitir 24h à meia-noite
  const asUtc = Date.UTC(g.year, g.month - 1, g.day, hour, g.minute, g.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

// Converte um horário de PAREDE local (sem offset) no fuso `tz` para um instante
// UTC (ISO com Z), aplicando o offset do fuso UMA ÚNICA VEZ. Determinístico e à
// prova de variação do LLM. Entrada ausente/mal-formada → null (campo fica
// aberto; nunca lança). Ex.: ("2026-07-10T10:00:00","America/Bahia") →
// "2026-07-10T13:00:00.000Z". (America/Bahia não tem horário de verão, então o
// offset calculado sobre a hora-de-parede é exato.)
export function localWallTimeToUtcISO(local: string | null, tz: string): string | null {
  if (!local) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const Y = +y, Mo = +mo, D = +d, H = +h, Mi = +mi, Se = +(se ?? "0");
  const asIfUtc = Date.UTC(Y, Mo - 1, D, H, Mi, Se);   // componentes tratados como se fossem UTC
  if (Number.isNaN(asIfUtc)) return null;
  // Rejeita overflow (ex.: mês 13, dia 40): Date.UTC normaliza silenciosamente,
  // então só aceitamos se os componentes voltarem idênticos.
  const chk = new Date(asIfUtc);
  if (
    chk.getUTCFullYear() !== Y || chk.getUTCMonth() !== Mo - 1 || chk.getUTCDate() !== D ||
    chk.getUTCHours() !== H || chk.getUTCMinutes() !== Mi || chk.getUTCSeconds() !== Se
  ) return null;
  const off = tzOffsetMinutes(tz, chk);
  return new Date(asIfUtc - off * 60000).toISOString();
}

// "Agora" como hora LOCAL de parede no fuso `tz` ("AAAA-MM-DDTHH:mm:ss"), para
// ancorar "hoje"/"amanhã" no prompt. Local (não UTC) para não errar a virada do
// dia perto da meia-noite.
export function nowLocalWall(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now);
  const g: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") g[p.type] = p.value;
  const hh = g.hour === "24" ? "00" : g.hour;
  return `${g.year}-${g.month}-${g.day}T${hh}:${g.minute}:${g.second}`;
}

// Prompt de extração do rascunho. O modelo devolve o prazo como hora LOCAL de
// parede (deadline_local), SEM fuso — ele NÃO deve converter para UTC nem usar
// "Z"/offset (era a origem do bug +3h). `nowLocal` já é a hora local em `tz`.
export function buildTaskDraftPrompt(message: string, nowLocal: string, tz: string): string {
  return [
    `Você extrai um RASCUNHO de tarefa a partir de um pedido em linguagem natural.`,
    `Agora é ${nowLocal} no fuso ${tz} (este é o horário LOCAL de parede). Responda SOMENTE um JSON com as chaves:`,
    `title, description,`,
    `deadline_local (horário LOCAL de parede no formato "AAAA-MM-DDTHH:mm:ss", SEM fuso e SEM "Z", resolvendo`,
    `expressões relativas — "amanhã 10h", "hoje 15h" — contra o "agora" LOCAL acima; null se não houver prazo),`,
    `deadline_display (texto curto já resolvido, ex.: "10/07 10:00"), priority (critical|high|medium|low ou null),`,
    `client_query (nome/termo do cliente citado, ou null), assignee_hint (nome do responsável citado, ou null).`,
    `IMPORTANTE: NÃO converta fusos e NÃO use "Z"/offset — informe apenas a hora local exatamente como foi pedida.`,
    `NUNCA invente. Se um campo não estiver claro, use null. Não inclua comentários fora do JSON.`,
    `Pedido: """${message}"""`,
  ].join("\n");
}
