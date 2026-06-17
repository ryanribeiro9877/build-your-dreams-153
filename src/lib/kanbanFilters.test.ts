import { describe, it, expect } from "vitest";
import {
  applyFilters,
  countActiveAdvanced,
  normalizeFilters,
  EMPTY_FILTERS,
} from "./kanbanFilters";
import type { KanbanCardV2, KanbanFilterState } from "@/types/jurisai";

const ME = "user-me";
const OTHER = "user-other";

function mk(o: Partial<KanbanCardV2> = {}): KanbanCardV2 {
  return {
    id: "t1",
    title: "Tarefa",
    situacao: "pendente",
    status: "assigned",
    priority: "medium",
    area: null,
    deadline_at: null,
    is_overdue: false,
    assignee_user_id: null,
    assigner_user_id: null,
    validator_user_id: null,
    assignee_name: "—",
    task_type_label: "Tipo",
    origin: "interna",
    client_id: null,
    client_name: null,
    process_id: null,
    process_number: null,
    awaiting_role_code: null,
    column_id: "c1",
    position: 0,
    created_at: "2026-06-01T00:00:00Z",
    ...o,
  };
}

function f(over: Partial<KanbanFilterState> = {}): KanbanFilterState {
  return { ...EMPTY_FILTERS, ...over };
}

const ids = (cards: KanbanCardV2[]) => cards.map((c) => c.id);

describe("applyFilters — vazio", () => {
  it("filtro vazio devolve todos os cards", () => {
    const cards = [mk({ id: "a" }), mk({ id: "b" }), mk({ id: "c" })];
    expect(applyFilters(cards, EMPTY_FILTERS, ME).length).toBe(3);
  });
});

describe("applyFilters — abas de envolvimento", () => {
  const cards = [
    mk({ id: "resp", assignee_user_id: ME }),
    mk({ id: "deleg", assigner_user_id: ME }),
    mk({ id: "valid", validator_user_id: ME }),
    mk({ id: "alheio", assignee_user_id: OTHER }),
  ];
  it("todas: tudo", () => {
    expect(ids(applyFilters(cards, f({ involvement: "todas" }), ME)).sort())
      .toEqual(["alheio", "deleg", "resp", "valid"]);
  });
  it("responsavel: só assignee == eu", () => {
    expect(ids(applyFilters(cards, f({ involvement: "responsavel" }), ME))).toEqual(["resp"]);
  });
  it("delegadas: só assigner == eu", () => {
    expect(ids(applyFilters(cards, f({ involvement: "delegadas" }), ME))).toEqual(["deleg"]);
  });
  it("envolvido: assignee/assigner/validator == eu", () => {
    expect(ids(applyFilters(cards, f({ involvement: "envolvido" }), ME)).sort())
      .toEqual(["deleg", "resp", "valid"]);
  });
});

describe("applyFilters — filtros avançados", () => {
  it("assignees", () => {
    const cards = [mk({ id: "a", assignee_user_id: "u1" }), mk({ id: "b", assignee_user_id: "u2" })];
    expect(ids(applyFilters(cards, f({ assignees: ["u1"] }), ME))).toEqual(["a"]);
  });
  it("taskTypes", () => {
    const cards = [mk({ id: "a", task_type_label: "Audiência" }), mk({ id: "b", task_type_label: "Protocolo" })];
    expect(ids(applyFilters(cards, f({ taskTypes: ["Protocolo"] }), ME))).toEqual(["b"]);
  });
  it("areas (null não casa quando filtro ativo)", () => {
    const cards = [mk({ id: "a", area: "bancario" }), mk({ id: "b", area: null }), mk({ id: "c", area: "civil" })];
    expect(ids(applyFilters(cards, f({ areas: ["bancario", "civil"] }), ME)).sort()).toEqual(["a", "c"]);
  });
  it("situacoes", () => {
    const cards = [mk({ id: "a", situacao: "em_execucao" }), mk({ id: "b", situacao: "pendente" })];
    expect(ids(applyFilters(cards, f({ situacoes: ["em_execucao"] }), ME))).toEqual(["a"]);
  });
  it("clientName (substring, case-insensitive)", () => {
    const cards = [mk({ id: "a", client_name: "Maria Silva" }), mk({ id: "b", client_name: "João" })];
    expect(ids(applyFilters(cards, f({ clientName: "silva" }), ME))).toEqual(["a"]);
  });
  it("processNumber (substring)", () => {
    const cards = [mk({ id: "a", process_number: "0001234-55.2026" }), mk({ id: "b", process_number: "9999" })];
    expect(ids(applyFilters(cards, f({ processNumber: "1234" }), ME))).toEqual(["a"]);
  });
});

describe("applyFilters — período (deadline_at)", () => {
  const cards = [
    mk({ id: "antes", deadline_at: "2026-05-10T09:00:00Z" }),
    mk({ id: "dentro", deadline_at: "2026-06-15T23:59:00Z" }),
    mk({ id: "depois", deadline_at: "2026-07-20T09:00:00Z" }),
    mk({ id: "semdata", deadline_at: null }),
  ];
  it("start+end inclusivo; sem data fica de fora quando há período", () => {
    expect(ids(applyFilters(cards, f({ periodStart: "2026-06-01", periodEnd: "2026-06-30" }), ME)))
      .toEqual(["dentro"]);
  });
  it("só start (>=, inclui o próprio dia)", () => {
    expect(ids(applyFilters(cards, f({ periodStart: "2026-06-15" }), ME)).sort())
      .toEqual(["dentro", "depois"]);
  });
  it("sem período: card sem data entra normalmente", () => {
    expect(ids(applyFilters(cards, EMPTY_FILTERS, ME))).toContain("semdata");
  });
});

describe("applyFilters — busca", () => {
  const cards = [
    mk({ id: "a", title: "Revisar peça", assignee_name: "Ana" }),
    mk({ id: "b", title: "Protocolar", client_name: "Bradesco S.A." }),
    mk({ id: "c", title: "Outra", process_number: "0007777" }),
  ];
  it("casa em título", () => {
    expect(ids(applyFilters(cards, f({ search: "revisar" }), ME))).toEqual(["a"]);
  });
  it("casa em cliente", () => {
    expect(ids(applyFilters(cards, f({ search: "bradesco" }), ME))).toEqual(["b"]);
  });
  it("casa em nº processo", () => {
    expect(ids(applyFilters(cards, f({ search: "7777" }), ME))).toEqual(["c"]);
  });
});

describe("applyFilters — ordenação", () => {
  it("prazo: asc, nulls por último", () => {
    const cards = [
      mk({ id: "sem", deadline_at: null }),
      mk({ id: "tarde", deadline_at: "2026-07-01T00:00:00Z" }),
      mk({ id: "cedo", deadline_at: "2026-06-01T00:00:00Z" }),
    ];
    expect(ids(applyFilters(cards, f({ sort: "prazo" }), ME))).toEqual(["cedo", "tarde", "sem"]);
  });
  it("prioridade: critical→low", () => {
    const cards = [
      mk({ id: "low", priority: "low" }),
      mk({ id: "crit", priority: "critical" }),
      mk({ id: "med", priority: "medium" }),
    ];
    expect(ids(applyFilters(cards, f({ sort: "prioridade" }), ME))).toEqual(["crit", "med", "low"]);
  });
  it("titulo: A→Z", () => {
    const cards = [mk({ id: "z", title: "Zebra" }), mk({ id: "a", title: "Abacate" })];
    expect(ids(applyFilters(cards, f({ sort: "titulo" }), ME))).toEqual(["a", "z"]);
  });
  it("recentes: created_at desc", () => {
    const cards = [
      mk({ id: "velho", created_at: "2026-01-01T00:00:00Z" }),
      mk({ id: "novo", created_at: "2026-06-10T00:00:00Z" }),
    ];
    expect(ids(applyFilters(cards, f({ sort: "recentes" }), ME))).toEqual(["novo", "velho"]);
  });
});

describe("countActiveAdvanced", () => {
  it("zero no filtro vazio", () => {
    expect(countActiveAdvanced(EMPTY_FILTERS)).toBe(0);
  });
  it("não conta abas, busca nem ordenação", () => {
    expect(countActiveAdvanced(f({ involvement: "responsavel", search: "x", sort: "prazo" }))).toBe(0);
  });
  it("conta cada campo avançado e período", () => {
    expect(countActiveAdvanced(f({
      assignees: ["u"], taskTypes: ["t"], areas: ["civil"], situacoes: ["pendente"],
      clientName: "a", processNumber: "1", periodStart: "2026-06-01",
    }))).toBe(7);
  });
});

describe("normalizeFilters", () => {
  it("preenche campos ausentes com defaults", () => {
    const r = normalizeFilters({ involvement: "responsavel" });
    expect(r.involvement).toBe("responsavel");
    expect(r.assignees).toEqual([]);
    expect(r.sort).toBe("recentes");
  });
  it("null/undefined viram filtro vazio", () => {
    expect(normalizeFilters(null)).toEqual(EMPTY_FILTERS);
  });
});
