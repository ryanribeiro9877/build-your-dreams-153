import { describe, it, expect } from "vitest";
import {
  parseBlockProgress,
  stageLabel,
  deriveLiveStage,
  formatElapsed,
} from "../liveStatus";

describe("parseBlockProgress", () => {
  it("extrai o contador '(X de N)' real do texto", () => {
    expect(parseBlockProgress("Redigindo fundamentação III.4–III.6 (2 de 5)...")).toEqual({ current: 2, total: 5 });
    expect(parseBlockProgress("Especialista corrigindo a peça (bloco 3 de 5)...")).toEqual({ current: 3, total: 5 });
  });

  it("retorna null quando não há contador — nunca inventa número", () => {
    expect(parseBlockProgress("Em revisao...")).toBeNull();
    expect(parseBlockProgress("Analisando os documentos do caso...")).toBeNull();
    expect(parseBlockProgress("")).toBeNull();
    expect(parseBlockProgress(null)).toBeNull();
    expect(parseBlockProgress(undefined)).toBeNull();
  });

  it("rejeita contadores inválidos", () => {
    expect(parseBlockProgress("(0 de 5)")).toBeNull();
    expect(parseBlockProgress("(6 de 5)")).toBeNull();
    expect(parseBlockProgress("(2 de 0)")).toBeNull();
  });
});

describe("stageLabel", () => {
  it("mapeia fases conhecidas para rótulos amigáveis", () => {
    expect(stageLabel("routing_n1")).toBe("Analisando o caso");
    expect(stageLabel("executing_n3")).toBe("Redigindo a peça");
    // Fluxo de AÇÃO (cadastro): rótulo condizente, nunca "Redigindo a peça".
    expect(stageLabel("executing_acao")).toBe("Processando o cadastro");
    expect(stageLabel("validating_n2")).toBe("Revisando a peça");
    expect(stageLabel("validating_n1")).toBe("Revisão final");
  });

  it("cadastro (executing_acao) NÃO mostra rótulo de peça", () => {
    expect(stageLabel("executing_acao")).not.toBe("Redigindo a peça");
  });

  it("usa fallback neutro para fase desconhecida/ausente", () => {
    expect(stageLabel(undefined)).toBe("Processando");
    expect(stageLabel("fase_inexistente")).toBe("Processando");
  });
});

describe("deriveLiveStage", () => {
  it("mostra bloco X de N apenas em executing_n3 com contador real", () => {
    const s = deriveLiveStage({ content: "Redigindo tutela, pedidos e valor da causa (5 de 5)...", metadata: { stage: "executing_n3" } });
    expect(s.label).toBe("Redigindo a peça");
    expect(s.blockCurrent).toBe(5);
    expect(s.blockTotal).toBe(5);
  });

  it("não expõe bloco em fases de validação, mesmo com números no texto cru", () => {
    // Texto cru do validador NÃO deve virar contador de bloco na UI.
    const s = deriveLiveStage({ content: "Validador consultivo reprovou a peça (rodada 2 de 2)...", metadata: { stage: "validating_n1" } });
    expect(s.label).toBe("Revisão final");
    expect(s.blockCurrent).toBeUndefined();
    expect(s.blockTotal).toBeUndefined();
  });

  it("sem contador em executing_n3 → só rótulo, sem número", () => {
    const s = deriveLiveStage({ content: "Especialista analisando os documentos do caso...", metadata: { stage: "executing_n3" } });
    expect(s.label).toBe("Redigindo a peça");
    expect(s.blockCurrent).toBeUndefined();
  });
});

describe("formatElapsed", () => {
  it("formata segundos e minutos", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(12)).toBe("12s");
    expect(formatElapsed(59)).toBe("59s");
    expect(formatElapsed(60)).toBe("1min 00s");
    expect(formatElapsed(200)).toBe("3min 20s");
  });
});
