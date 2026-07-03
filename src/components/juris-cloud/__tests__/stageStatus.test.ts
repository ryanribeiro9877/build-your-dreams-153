import { describe, it, expect } from "vitest";
import {
  STAGE_STATUS_LABELS,
  DEFAULT_STATUS_LABEL,
  parseBlockProgress,
  stageStatusLabel,
} from "../stageStatus";

describe("parseBlockProgress", () => {
  it("extrai 'X de N' na forma da redação por blocos", () => {
    expect(parseBlockProgress("Redigindo preliminares e fatos (1 de 5)...")).toEqual({ current: 1, total: 5 });
  });

  it("extrai 'bloco X de N' na forma da correção por blocos", () => {
    expect(parseBlockProgress("Redator corrigindo a peça (bloco 3 de 5)...")).toEqual({ current: 3, total: 5 });
  });

  it("ignora 'rodada 1/3' (barra, não é progresso de bloco)", () => {
    expect(parseBlockProgress("Devolvendo ao especialista (rodada 1/3)...")).toBeNull();
  });

  it("retorna null sem conteúdo", () => {
    expect(parseBlockProgress(null)).toBeNull();
    expect(parseBlockProgress(undefined)).toBeNull();
    expect(parseBlockProgress("")).toBeNull();
  });

  it("rejeita valores incoerentes (current > total, zero)", () => {
    expect(parseBlockProgress("(6 de 5)")).toBeNull();
    expect(parseBlockProgress("(0 de 5)")).toBeNull();
  });
});

describe("stageStatusLabel", () => {
  it("mapeia cada stage conhecido para o rótulo amigável", () => {
    expect(stageStatusLabel("routing_n1")).toBe(STAGE_STATUS_LABELS.routing_n1);
    expect(stageStatusLabel("routing_n2")).toBe(STAGE_STATUS_LABELS.routing_n2);
    expect(stageStatusLabel("executing_n3")).toBe(STAGE_STATUS_LABELS.executing_n3);
    expect(stageStatusLabel("validating_n2")).toBe(STAGE_STATUS_LABELS.validating_n2);
  });

  it("prioriza o progresso real de bloco sobre o rótulo genérico", () => {
    expect(stageStatusLabel("executing_n3", "Redigindo o mérito (2 de 5)...")).toBe("Gerando bloco 2 de 5");
  });

  it("cai no rótulo padrão para stage desconhecido/ausente", () => {
    expect(stageStatusLabel(undefined)).toBe(DEFAULT_STATUS_LABEL);
    expect(stageStatusLabel("stage_inexistente")).toBe(DEFAULT_STATUS_LABEL);
  });
});
