// supabase/functions/chat-orchestrator/taskDraft.ts
//
// Card 4.1 — Rascunho de tarefa via LLM + normalização (sem alucinação).
//
// O parse do LLM é RASCUNHO: normalizeDraft NUNCA inventa. Campo ausente ou
// ambíguo → null (fica em aberto no cartão de confirmação para o usuário
// completar/corrigir). Datas relativas são resolvidas pedindo ao LLM um ISO
// 8601 absoluto, informando "hoje é <nowISO> (fuso <tz>)" no prompt.

export interface TaskDraft {
  title: string | null;
  description: string | null;
  deadline_at: string | null;          // ISO resolvido, ou null se não resolvido
  deadline_display: string | null;      // "amanhã 10:00" já resolvido p/ conferência
  priority: "critical" | "high" | "medium" | "low" | null;
  client_query: string | null;          // termo p/ resolver cliente (não resolve aqui)
  assignee_hint: string | null;         // nome mencionado, ou null (fica em aberto)
}

const PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// Valida o JSON retornado pelo LLM. Entrada não é objeto → tudo null (aberto).
export function normalizeDraft(raw: unknown): TaskDraft {
  const o = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const prio = s(o.priority);
  return {
    title: s(o.title),
    description: s(o.description),
    deadline_at: s(o.deadline_at),
    deadline_display: s(o.deadline_display),
    priority: prio && PRIORITIES.has(prio) ? prio as TaskDraft["priority"] : null,
    client_query: s(o.client_query),
    assignee_hint: s(o.assignee_hint),
  };
}

// Prompt de extração do rascunho. NUNCA invente: campo não claro → null.
export function buildTaskDraftPrompt(message: string, nowISO: string, tz: string): string {
  return [
    `Você extrai um RASCUNHO de tarefa a partir de um pedido em linguagem natural.`,
    `Hoje é ${nowISO} (fuso ${tz}). Responda SOMENTE um JSON com as chaves:`,
    `title, description, deadline_at (ISO 8601 absoluto, resolvendo datas relativas contra "hoje"; null se não houver),`,
    `deadline_display (texto curto já resolvido, ex.: "10/07 10:00"), priority (critical|high|medium|low ou null),`,
    `client_query (nome/termo do cliente citado, ou null), assignee_hint (nome do responsável citado, ou null).`,
    `NUNCA invente. Se um campo não estiver claro, use null. Não inclua comentários fora do JSON.`,
    `Pedido: """${message}"""`,
  ].join("\n");
}
