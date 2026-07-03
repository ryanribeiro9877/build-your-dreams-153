import { describe, it, expect } from "vitest";
import { applyRunPatch, EMPTY_RUN_STATE, type RunStateMap } from "../runStates";

describe("applyRunPatch — estado de run POR conversa (bug 2.3)", () => {
  it("cria a entrada de uma conversa a partir do estado vazio", () => {
    const next = applyRunPatch({}, "A", { thinking: true, runId: "run-A", thinkingStartedAt: 1000 });
    expect(next).toEqual({
      A: { ...EMPTY_RUN_STATE, thinking: true, runId: "run-A", thinkingStartedAt: 1000 },
    });
  });

  it("mescla um patch parcial preservando os demais campos da conversa", () => {
    const prev: RunStateMap = { A: { runId: "run-A", thinking: true, liveStage: null, thinkingStartedAt: 1000 } };
    const next = applyRunPatch(prev, "A", { liveStage: { label: "Redigindo a peça", blockCurrent: 2, blockTotal: 5 } });
    expect(next.A).toEqual({
      runId: "run-A",
      thinking: true,
      liveStage: { label: "Redigindo a peça", blockCurrent: 2, blockTotal: 5 },
      thinkingStartedAt: 1000,
    });
  });

  it("DUAS runs simultâneas: mexer em A não toca no estado de B (o cenário que reprovou)", () => {
    // A e B gerando ao mesmo tempo, cada uma com seu runId/cronômetro.
    let map: RunStateMap = {};
    map = applyRunPatch(map, "A", { thinking: true, runId: "run-A", thinkingStartedAt: 1000 });
    map = applyRunPatch(map, "B", { thinking: true, runId: "run-B", thinkingStartedAt: 2000 });

    // Progresso de bloco chega para A — B fica intacta (sem sobreposição).
    const bBefore = map.B;
    map = applyRunPatch(map, "A", { liveStage: { label: "Redigindo a peça", blockCurrent: 3, blockTotal: 5 } });
    expect(map.B).toBe(bBefore); // mesma referência: B não foi recriada
    expect(map.A.liveStage?.blockCurrent).toBe(3);
    expect(map.B.runId).toBe("run-B");
    expect(map.B.thinking).toBe(true);

    // A termina (patch=null) — B continua processando normalmente.
    map = applyRunPatch(map, "A", null);
    expect(map.A).toBeUndefined();
    expect(map.B).toEqual({ runId: "run-B", thinking: true, liveStage: null, thinkingStartedAt: 2000 });
  });

  it("remover (patch=null) uma conversa inexistente retorna o MESMO mapa (sem re-render)", () => {
    const prev: RunStateMap = { A: { ...EMPTY_RUN_STATE, thinking: true } };
    const next = applyRunPatch(prev, "B", null);
    expect(next).toBe(prev);
  });

  it("remover uma conversa não afeta as outras entradas", () => {
    const prev: RunStateMap = {
      A: { runId: "run-A", thinking: true, liveStage: null, thinkingStartedAt: 1000 },
      B: { runId: "run-B", thinking: true, liveStage: null, thinkingStartedAt: 2000 },
    };
    const next = applyRunPatch(prev, "A", null);
    expect(next.A).toBeUndefined();
    expect(next.B).toBe(prev.B);
    expect(prev.A).toBeDefined(); // não muta o mapa anterior
  });

  it("não muta o objeto de entrada ao aplicar um patch", () => {
    const prev: RunStateMap = { A: { ...EMPTY_RUN_STATE } };
    const snapshot = JSON.parse(JSON.stringify(prev));
    applyRunPatch(prev, "A", { thinking: true });
    expect(prev).toEqual(snapshot);
  });
});
