// Filtragem client-side do Kanban (SP2). Função PURA, sem dependências de React
// nem de rede — recebe os cards já carregados e o estado de filtro, devolve a
// lista filtrada e ordenada. Testável isoladamente (kanbanFilters.test.ts).
import type {
  KanbanCardV2,
  KanbanFilterState,
  LegalArea,
  TaskSituacao,
  TaskPriority,
} from "@/types/jurisai";

export const EMPTY_FILTERS: KanbanFilterState = {
  involvement: "todas",
  search: "",
  sort: "recentes",
  periodStart: null,
  periodEnd: null,
  assignees: [],
  taskTypes: [],
  areas: [],
  situacoes: [],
  marcadores: [],
  clientName: "",
  processNumber: "",
};

/**
 * Normaliza um estado parcial (ex.: filtro salvo de versão antiga) preenchendo
 * campos ausentes com os defaults. Mantém compatibilidade futura.
 */
export function normalizeFilters(partial: Partial<KanbanFilterState> | null | undefined): KanbanFilterState {
  return { ...EMPTY_FILTERS, ...(partial ?? {}) };
}

/** Quantidade de filtros AVANÇADOS ativos (para o badge do botão "Filtros").
 *  Abas de envolvimento, busca e ordenação NÃO contam. */
export function countActiveAdvanced(f: KanbanFilterState): number {
  let n = 0;
  if (f.assignees.length > 0) n++;
  if (f.taskTypes.length > 0) n++;
  if (f.areas.length > 0) n++;
  if (f.situacoes.length > 0) n++;
  if (f.marcadores.length > 0) n++;
  if (f.clientName.trim() !== "") n++;
  if (f.processNumber.trim() !== "") n++;
  if (f.periodStart || f.periodEnd) n++;
  return n;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

function matchesInvolvement(c: KanbanCardV2, involvement: KanbanFilterState["involvement"], userId: string): boolean {
  switch (involvement) {
    case "responsavel":
      return c.assignee_user_id === userId;
    case "delegadas":
      return c.assigner_user_id === userId;
    case "envolvido":
      return c.assignee_user_id === userId
        || c.assigner_user_id === userId
        || c.validator_user_id === userId;
    case "todas":
    default:
      return true;
  }
}

function matchesAdvanced(c: KanbanCardV2, f: KanbanFilterState): boolean {
  if (f.assignees.length > 0 && !(c.assignee_user_id && f.assignees.includes(c.assignee_user_id))) return false;
  if (f.taskTypes.length > 0 && !f.taskTypes.includes(c.task_type_label)) return false;
  if (f.areas.length > 0 && !(c.area && f.areas.includes(c.area as LegalArea))) return false;
  if (f.situacoes.length > 0 && !f.situacoes.includes(c.situacao as TaskSituacao)) return false;
  if (f.marcadores.length > 0 && !(c.tags ?? []).some((t) => f.marcadores.includes(t.id))) return false;

  const cli = f.clientName.trim().toLowerCase();
  if (cli && !(c.client_name ?? "").toLowerCase().includes(cli)) return false;

  const proc = f.processNumber.trim().toLowerCase();
  if (proc && !(c.process_number ?? "").toLowerCase().includes(proc)) return false;

  // Período por data (apenas a parte YYYY-MM-DD do deadline_at, comparação inclusiva).
  if (f.periodStart || f.periodEnd) {
    if (!c.deadline_at) return false; // sem prazo: não entra quando há período definido
    const d = c.deadline_at.slice(0, 10);
    if (f.periodStart && d < f.periodStart) return false;
    if (f.periodEnd && d > f.periodEnd) return false;
  }
  return true;
}

function matchesSearch(c: KanbanCardV2, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    c.title.toLowerCase().includes(q) ||
    (c.assignee_name ?? "").toLowerCase().includes(q) ||
    (c.task_type_label ?? "").toLowerCase().includes(q) ||
    (c.client_name ?? "").toLowerCase().includes(q) ||
    (c.process_number ?? "").toLowerCase().includes(q)
  );
}

function compareCards(a: KanbanCardV2, b: KanbanCardV2, sort: KanbanFilterState["sort"]): number {
  switch (sort) {
    case "prazo": {
      // deadline asc, nulls por último
      if (!a.deadline_at && !b.deadline_at) return 0;
      if (!a.deadline_at) return 1;
      if (!b.deadline_at) return -1;
      return a.deadline_at < b.deadline_at ? -1 : a.deadline_at > b.deadline_at ? 1 : 0;
    }
    case "prioridade":
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    case "titulo":
      return a.title.localeCompare(b.title, "pt-BR");
    case "recentes":
    default:
      // created_at desc (ISO compara cronologicamente)
      return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  }
}

/**
 * Aplica os filtros (envolvimento → avançados → busca) e ordena.
 * Função pura: não muta `cards`.
 */
export function applyFilters(
  cards: KanbanCardV2[],
  filters: KanbanFilterState,
  userId: string,
): KanbanCardV2[] {
  const f = normalizeFilters(filters);
  const out = cards.filter(
    (c) =>
      matchesInvolvement(c, f.involvement, userId) &&
      matchesAdvanced(c, f) &&
      matchesSearch(c, f.search),
  );
  return out.sort((a, b) => compareCards(a, b, f.sort));
}
