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

// ─── B3 do reteste 27/07: cartão de tarefa vinha VAZIO ───────────────────────
// A frase "cadastre uma pendência de procuração pro cliente X para sexta" trazia
// os três dados, mas o cartão vinha em branco: o prompt só exemplificava
// "amanhã/hoje" (dias da semana não eram resolvidos → "para sexta" virava null, o
// mesmo bug do E2E anterior) e qualquer falha do LLM zerava tudo.
//
// Estes extratores são DETERMINÍSTICOS e servem de FALLBACK — o valor do LLM
// sempre tem prioridade; eles só preenchem o que veio null. Operam sobre padrões
// ESTRUTURAIS explícitos da frase ("pendência de X", "pro cliente Y", "para
// sexta"), não sobre intenção — o roteamento segue LLM-first.
// Gotcha pt-BR: `\b` é ASCII-only, então as fronteiras usam (?<![\wÀ-ÿ]).

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6,
};

function pad(n: number): string { return String(n).padStart(2, "0"); }
function wallOf(y: number, mo: number, d: number, h: number, mi: number): string {
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00`;
}

/** Hora citada na frase ("às 14h", "9h", "14:30"); null se não houver. */
export function parseHoraLocal(message: string): { h: number; mi: number } | null {
  const m = /(?<![\wÀ-ÿ])(?:[àa]s\s+)?(\d{1,2})(?::(\d{2})|\s*h(?:oras?)?(?:\s*(\d{2}))?)(?![\wÀ-ÿ:])/i.exec(message);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? m[3] ?? 0);
  if (h > 23 || mi > 59) return null;
  return { h, mi };
}

/**
 * Resolve um prazo RELATIVO citado em linguagem natural para hora LOCAL de parede
 * ("AAAA-MM-DDTHH:mm:ss"), ancorado em `nowLocal` (hora local de parede de agora).
 * Cobre: hoje, amanhã, depois de amanhã, dias da semana (próxima ocorrência
 * ESTRITAMENTE futura — "para sexta" numa sexta = a sexta seguinte), "semana que
 * vem"/"próxima semana" (segunda seguinte) e "dia N" (deste mês ou do próximo, se
 * já passou). Sem hora citada, usa 09:00 (início do expediente 08–17).
 * Retorna null quando não há expressão de prazo reconhecível — NUNCA chuta.
 */
export function parseRelativeDeadline(message: string, nowLocal: string): string | null {
  const anchor = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec((nowLocal || "").trim());
  if (!anchor) return null;
  const [, ay, amo, ad] = anchor;
  const base = new Date(Date.UTC(+ay, +amo - 1, +ad)); // só a data ancora o cálculo
  const msg = (message || "").toLowerCase();
  const hora = parseHoraLocal(message);
  const H = hora?.h ?? 9, MI = hora?.mi ?? 0;
  const out = (addDays: number) => {
    const d = new Date(base.getTime() + addDays * 86400000);
    return wallOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), H, MI);
  };

  if (/(?<![\wÀ-ÿ])depois de amanh[ãa]/.test(msg)) return out(2);
  if (/(?<![\wÀ-ÿ])amanh[ãa](?![\wÀ-ÿ])/.test(msg)) return out(1);
  if (/(?<![\wÀ-ÿ])hoje(?![\wÀ-ÿ])/.test(msg)) return out(0);
  if (/(semana que vem|pr[óo]xima semana)/.test(msg)) {
    const dow = base.getUTCDay();
    return out(((8 - dow) % 7) || 7); // próxima segunda
  }
  for (const [nome, alvo] of Object.entries(DIAS_SEMANA)) {
    const re = new RegExp(`(?<![\\wÀ-ÿ])${nome}(?:-feira)?(?![\\wÀ-ÿ])`, "i");
    if (re.test(msg)) {
      const dow = base.getUTCDay();
      const delta = ((alvo - dow + 7) % 7) || 7; // estritamente futuro
      return out(delta);
    }
  }
  const dm = /(?<![\wÀ-ÿ])dia\s+(\d{1,2})(?![\wÀ-ÿ:])/.exec(msg);
  if (dm) {
    const alvo = Number(dm[1]);
    if (alvo >= 1 && alvo <= 31) {
      const y = base.getUTCFullYear(), mo = base.getUTCMonth();
      const thisMonth = new Date(Date.UTC(y, mo, alvo));
      const d = (thisMonth.getUTCDate() === alvo && thisMonth >= base)
        ? thisMonth
        : new Date(Date.UTC(y, mo + 1, alvo));
      if (d.getUTCDate() !== alvo) return null; // dia inexistente no mês (ex.: 31/02)
      return wallOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), H, MI);
    }
  }
  return null;
}

// Remove a cauda TEMPORAL de um trecho — com ou sem preposição ("Adalberto amanhã
// às 10h" → "Adalberto"). Sem isto, o prazo vazava para o título/nome do cliente.
const CAUDA_TEMPO_RE =
  /(?<![\wÀ-ÿ])(?:(?:para|at[ée]|no|na|em|dia)\s+)?(?:hoje|amanh[ãa]|depois de amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|semana que vem|pr[óo]xima semana|semana|dia\s+\d{1,2}|[àa]s\s+\d{1,2}(?::\d{2})?\s*h?|\d{1,2}\s*h(?:oras?)?|\d{1,2}:\d{2})(?:-feira)?[\s\S]*$/i;

function stripCauda(s: string): string {
  return s.replace(CAUDA_TEMPO_RE, "").replace(/[\s,.;-]+$/, "").trim();
}

/** Objeto da pendência/tarefa: "pendência DE procuração" → "procuração". */
export function extractPendenciaTitle(message: string): string | null {
  const m = /(?<![\wÀ-ÿ])(?:pend[êe]ncia|tarefa|lembrete|card)\s+(?:de|do|da|dos|das|sobre|para)\s+([^,.;]{2,60})/i.exec(message || "");
  if (!m) return null;
  // Corta o vínculo com cliente ("procuração pro cliente X") e a cauda de prazo.
  const semCliente = m[1].replace(/(?<![\wÀ-ÿ])(?:pro|pra|para o|para a|para|do|da|de|com o|com a)?\s*cliente(?![\wÀ-ÿ])[\s\S]*$/i, "");
  const t = stripCauda(semCliente);
  return t.length >= 2 ? t : null;
}

/**
 * Cliente citado: "pro cliente X", "para o cliente X", "do cliente X".
 * A preposição é OBRIGATÓRIA — sem ela, "sem cliente citado" capturaria "citado"
 * como nome. Como é fallback, preferimos deixar o campo aberto a chutar errado.
 */
export function extractClientQuery(message: string): string | null {
  const m = /(?<![\wÀ-ÿ])(?:pro|pra|para\s+[oa]|para|d[oa]|de|com\s+[oa])\s+cliente\s+([^,.;]{2,80})/i.exec(message || "");
  if (!m) return null;
  const q = stripCauda(m[1]);
  return q.length >= 2 ? q : null;
}

/**
 * Frase que apresenta o cartão de tarefa, dizendo ONDE ela vai nascer.
 *
 * Item 7.1 de 06/08 (4.9): quem pede "cria um card no Kanban" recebia a coisa
 * CERTA (uma tarefa em Tarefas) sem ser avisado da troca — e depois ia procurar
 * no Kanban, que é a esteira de CASO distribuído e não guarda tarefa. O sistema
 * não errava a ação; errava o silêncio. Correção de uma frase, como pedido.
 */
export function frasePreparoTarefa(message: string): string {
  // O dois-pontos fica no FIM: o cartão editável é renderizado logo abaixo.
  const pediuKanban = /(?<![\wÀ-ÿ])kanban(?![\wÀ-ÿ])/i.test(message || "");
  if (!pediuKanban) {
    return "Preparei um rascunho da tarefa — ela vai nascer em Tarefas. "
      + "Revise, ajuste o que precisar e confirme:";
  }
  return "Você pediu um card no Kanban, mas o Kanban recebe CASOS por distribuição de "
    + "processo, não tarefas. Então preparei uma tarefa, que é onde isso mora — ela vai "
    + "nascer em Tarefas. Revise, ajuste o que precisar e confirme:";
}

/**
 * Completa o rascunho do LLM com os extratores determinísticos. O LLM tem
 * PRIORIDADE — só preenchemos o que veio null (nunca sobrescrevemos).
 */
export function fillDraftGaps(draft: TaskDraft, message: string, nowLocal: string): TaskDraft {
  const out = { ...draft };
  if (!out.title) out.title = extractPendenciaTitle(message);
  if (!out.client_query) out.client_query = extractClientQuery(message);
  if (!out.deadline_local) out.deadline_local = parseRelativeDeadline(message, nowLocal);
  return out;
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
    `expressões relativas contra o "agora" LOCAL acima; null se não houver prazo). RESOLVA TAMBÉM DIAS DA`,
    `SEMANA e datas: "para sexta" / "na sexta-feira" = a PRÓXIMA sexta (estritamente futura); "segunda",`,
    `"terça"… idem; "semana que vem"/"próxima semana" = a próxima segunda; "dia 31" = o dia 31 deste mês (ou`,
    `do mês seguinte, se já passou); "hoje", "amanhã", "depois de amanhã". SEM hora citada, use 09:00`,
    `(início do expediente). Ex.: se agora é segunda 27/07, "para sexta" → "2026-07-31T09:00:00".`,
    `deadline_display (texto curto já resolvido, ex.: "31/07 09:00"), priority (critical|high|medium|low ou null),`,
    `client_query (nome/termo do cliente citado — copie o nome COMO ESCRITO, inclusive prefixos como "[TESTE]";`,
    `ou null), assignee_hint (nome do responsável citado, ou null).`,
    `title: o OBJETO da tarefa/pendência, curto. Ex.: "cadastre uma pendência de procuração pro cliente X para`,
    `sexta" → title "procuração"; "abra uma pendência dos extratos do cliente Y" → title "extratos".`,
    `IMPORTANTE: NÃO converta fusos e NÃO use "Z"/offset — informe apenas a hora local exatamente como foi pedida.`,
    `NUNCA invente. Se um campo não estiver claro, use null. Não inclua comentários fora do JSON.`,
    `Pedido: """${message}"""`,
  ].join("\n");
}
