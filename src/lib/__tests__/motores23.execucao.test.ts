// Itens A.1 / A.1b / A.10 do relatório de validação de 03-04/08 (C-02, C-03, G-02).
// O banco tem 15 fases de execução e a tela conhecia 11: as quatro que faltavam já
// tinham dado em produção (import de 30/07) e eram impossíveis de filtrar ou de
// alcançar pela UI. Este teste fixa o CONTRATO lido do banco em 04/08/2026:
//   - CHECK execucoes_fase_check ....... 15 códigos, nesta ordem
//   - iniciar_execucao ................. valida 11 e cai CALADA em 'ajuizada'
//   - gerar_pendencias_revisao_execucao  só pula fase = 'encerrada'
// Se alguém encurtar a lista de novo, aqui quebra.

import { describe, it, expect } from "vitest";
import {
  EXECUCAO_FASES, EXECUCAO_TRILHA, EXECUCAO_FASE_LABELS, EXECUCAO_FASE_CLS,
  EXECUCAO_FASE_OPTIONS, EXECUCAO_FASE_INICIAL_OPTIONS, avisoFaseNaoTerminal, faseNaoEncerra,
  EXECUCAO_FASE_TERMINAL, posNaTrilha, faseMantemTickler, contadorComFiltro,
} from "../motores23";

/** Cópia literal do array do CHECK execucoes_fase_check (pg_constraint, 04/08/2026). */
const CHECK_FASES = [
  "ajuizada", "prazo_pagamento", "pedido_penhora", "sisbajud", "penhora_negativa",
  "redirecionamento", "pago", "pago_parcial", "deposito_judicial", "expedicao_alvara",
  "alvara_pendente_assinatura", "arquivada", "suspensa", "extinta", "encerrada",
];

/** Fases aceitas por iniciar_execucao (o IF da própria RPC). Fora daqui a RPC
 *  grava 'ajuizada' sem reclamar — por isso o seletor de fase INICIAL é menor. */
const INICIAL_ACEITAS = [
  "ajuizada", "prazo_pagamento", "pedido_penhora", "sisbajud", "penhora_negativa",
  "redirecionamento", "pago", "deposito_judicial", "expedicao_alvara",
  "alvara_pendente_assinatura", "encerrada",
];

const NOVAS = ["pago_parcial", "arquivada", "suspensa", "extinta"];

describe("fases de execução — contrato do banco", () => {
  it("EXECUCAO_FASES é o CHECK completo, na ordem do CHECK", () => {
    expect([...EXECUCAO_FASES]).toEqual(CHECK_FASES);
    expect(EXECUCAO_FASES).toHaveLength(15);
  });

  it("as quatro fases do import estão presentes (antes eram invisíveis na tela)", () => {
    for (const f of NOVAS) expect(EXECUCAO_FASES).toContain(f);
  });

  it("todo código do CHECK tem rótulo e cor de chip", () => {
    for (const f of CHECK_FASES) {
      expect(EXECUCAO_FASE_LABELS[f], `rótulo de ${f}`).toBeTruthy();
      expect(EXECUCAO_FASE_CLS[f], `chip de ${f}`).toBeTruthy();
    }
  });

  it("rótulos pedidos no relatório", () => {
    expect(EXECUCAO_FASE_LABELS.pago_parcial).toBe("Pago em parte");
    expect(EXECUCAO_FASE_LABELS.arquivada).toBe("Arquivada");
    expect(EXECUCAO_FASE_LABELS.suspensa).toBe("Suspensa");
    expect(EXECUCAO_FASE_LABELS.extinta).toBe("Extinta");
  });

  it("o seletor/filtro oferece as 15 e termina em Encerrada", () => {
    expect(EXECUCAO_FASE_OPTIONS).toHaveLength(15);
    expect(EXECUCAO_FASE_OPTIONS.at(-1)).toEqual({ value: "encerrada", label: "Encerrada" });
    expect(EXECUCAO_FASE_OPTIONS.every(o => o.label)).toBe(true);
  });
});

describe("fase inicial x atualizar fase", () => {
  it("fase INICIAL só oferece o que iniciar_execucao valida", () => {
    expect(EXECUCAO_FASE_INICIAL_OPTIONS.map(o => o.value)).toEqual(INICIAL_ACEITAS);
  });

  it("fase INICIAL não oferece as quatro novas — a RPC as trocaria por 'ajuizada' em silêncio", () => {
    const values = EXECUCAO_FASE_INICIAL_OPTIONS.map(o => o.value);
    for (const f of NOVAS) expect(values).not.toContain(f);
  });
});

describe("trilha horizontal", () => {
  it("desenha só a espinha processual (11 traços)", () => {
    expect(EXECUCAO_TRILHA).toHaveLength(11);
    expect(EXECUCAO_TRILHA[0]).toBe("ajuizada");
    expect(EXECUCAO_TRILHA.at(-1)).toBe("encerrada");
  });

  it("arquivada/suspensa/extinta ficam FORA da trilha — podem cair em qualquer etapa", () => {
    for (const f of ["arquivada", "suspensa", "extinta"]) {
      expect(EXECUCAO_TRILHA).not.toContain(f);
      expect(posNaTrilha(f), `${f} não pode ocupar traço`).toBeNull();
    }
  });

  it("pago_parcial divide o traço de 'pago': é a mesma etapa, cumprida em parte", () => {
    expect(posNaTrilha("pago_parcial")).toBe(posNaTrilha("pago"));
    expect(posNaTrilha("pago_parcial")).not.toBeNull();
  });

  it("etapas da espinha ficam na própria posição e código desconhecido não vira 0", () => {
    EXECUCAO_TRILHA.forEach((f, i) => expect(posNaTrilha(f)).toBe(i));
    expect(posNaTrilha("ajuizada")).toBe(0);
    expect(posNaTrilha("fase_que_nao_existe")).toBeNull();
  });
});

describe("tickler — só 'encerrada' é terminal", () => {
  it("EXECUCAO_FASE_TERMINAL é a única fase que o cron pula", () => {
    expect(EXECUCAO_FASE_TERMINAL).toBe("encerrada");
    expect(faseMantemTickler("encerrada")).toBe(false);
    for (const f of CHECK_FASES.filter(f => f !== "encerrada")) {
      expect(faseMantemTickler(f), `${f} continua vigiada`).toBe(true);
    }
  });

  it("as fases que PARECEM fim de linha têm aviso (e só elas)", () => {
    for (const f of NOVAS) expect(faseNaoEncerra(f), f).toBe(true);
    expect(faseNaoEncerra("encerrada")).toBe(false);
    expect(faseNaoEncerra("pago")).toBe(false);
  });

  // O aviso é CONDICIONAL de propósito: o cron exige proxima_revisao NOT NULL, e
  // medido em 04/08 nenhuma das 12 execuções nessas fases tem revisão marcada.
  // Prometer vigilância que não vem era o defeito.
  it("o aviso NÃO promete lembrete quando não há revisão marcada", () => {
    for (const f of NOVAS) {
      const com = avisoFaseNaoTerminal(f, true)!;
      const sem = avisoFaseNaoTerminal(f, false)!;
      expect(com).toMatch(/continua vindo/);
      expect(sem).toMatch(/NÃO há próxima revisão marcada/);
      expect(sem).not.toMatch(/continua vindo/);
    }
    expect(avisoFaseNaoTerminal("encerrada", true)).toBeUndefined();
    expect(avisoFaseNaoTerminal("pago", false)).toBeUndefined();
  });
});

describe("contadorComFiltro (A.10)", () => {
  it("sem filtro mostra só o total", () => {
    expect(contadorComFiltro(300, 300)).toBe("300");
    expect(contadorComFiltro(0, 0)).toBe("0");
  });

  it("com filtro mostra o visível e o total — era o bug do '· 300' com 128 na tela", () => {
    expect(contadorComFiltro(128, 300)).toBe("128 de 300");
    expect(contadorComFiltro(0, 300)).toBe("0 de 300");
    expect(contadorComFiltro(8, 300)).toBe("8 de 300");
  });
});
