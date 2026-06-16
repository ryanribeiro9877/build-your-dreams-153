import { describe, it, expect } from "vitest";
import type { TaskSituacao, UserTaskStatus } from "@/types/jurisai";
import {
  SITUACAO_LABELS,
  SITUACAO_ORDER,
  situacaoFromStatus,
} from "./kanbanSituacao";

describe("situacaoFromStatus — mapa 8 status -> 5 situações", () => {
  const casos: Array<[UserTaskStatus, TaskSituacao]> = [
    ["draft", "pendente"],
    ["assigned", "pendente"],
    ["in_progress", "em_execucao"],
    ["awaiting_external", "em_execucao"],
    ["awaiting_validation", "em_execucao"],
    ["blocked", "em_execucao"],
    ["completed", "concluida_sucesso"],
    ["cancelled", "cancelado"],
  ];

  it.each(casos)("status '%s' -> situacao '%s'", (status, esperado) => {
    expect(situacaoFromStatus(status)).toBe(esperado);
  });

  it("cobre todos os 8 status de entrada", () => {
    const statusCobertos = casos.map(([s]) => s);
    const esperados: UserTaskStatus[] = [
      "draft",
      "assigned",
      "in_progress",
      "awaiting_external",
      "awaiting_validation",
      "blocked",
      "completed",
      "cancelled",
    ];
    expect(new Set(statusCobertos)).toEqual(new Set(esperados));
    expect(statusCobertos.length).toBe(8);
  });

  it("'completed' sempre vira 'concluida_sucesso' (sem_sucesso é resolvido no backend)", () => {
    expect(situacaoFromStatus("completed")).toBe("concluida_sucesso");
  });
});

describe("SITUACAO_LABELS — rótulos PT-BR", () => {
  it("tem exatamente as 5 chaves de situação", () => {
    expect(Object.keys(SITUACAO_LABELS).length).toBe(5);
  });

  it("usa os textos esperados", () => {
    expect(SITUACAO_LABELS.pendente).toBe("Pendente");
    expect(SITUACAO_LABELS.em_execucao).toBe("Em execução");
    expect(SITUACAO_LABELS.concluida_sucesso).toBe("Concluída com sucesso");
    expect(SITUACAO_LABELS.concluida_sem_sucesso).toBe("Concluída sem sucesso");
    expect(SITUACAO_LABELS.cancelado).toBe("Cancelado");
  });
});

describe("SITUACAO_ORDER — ordem canônica", () => {
  it("tem 5 itens, na ordem esperada", () => {
    expect(SITUACAO_ORDER).toEqual([
      "pendente",
      "em_execucao",
      "concluida_sucesso",
      "concluida_sem_sucesso",
      "cancelado",
    ]);
    expect(SITUACAO_ORDER.length).toBe(5);
  });

  it("contém as mesmas chaves de SITUACAO_LABELS, sem duplicatas", () => {
    expect(new Set(SITUACAO_ORDER)).toEqual(new Set(Object.keys(SITUACAO_LABELS)));
    expect(new Set(SITUACAO_ORDER).size).toBe(SITUACAO_ORDER.length);
  });
});
