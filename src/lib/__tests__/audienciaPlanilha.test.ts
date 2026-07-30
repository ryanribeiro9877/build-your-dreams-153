import { describe, it, expect } from "vitest";
import {
  separarPartes, parseDataHoraBR, detectarColunas, montarLoteAudiencias,
  FUSO_BRASIL, OFFSETS_LEMBRETE_DEFAULT,
} from "../audienciaPlanilha";

/* Nomes fictícios; nada vem da planilha real. */

describe("separarPartes — 'CLIENTE x RÉU'", () => {
  it("separa no x solto", () => {
    expect(separarPartes("MARIA SILVA x BANCO BMG")).toEqual({ cliente: "MARIA SILVA", parte_contraria: "BANCO BMG" });
    expect(separarPartes("  JOAO   x   SINDICATO RURAL ")).toEqual({ cliente: "JOAO", parte_contraria: "SINDICATO RURAL" });
  });

  it("aceita ×, vs e versus", () => {
    expect(separarPartes("ANA × ITAU").parte_contraria).toBe("ITAU");
    expect(separarPartes("ANA vs ITAU").parte_contraria).toBe("ITAU");
    expect(separarPartes("ANA versus ITAU").parte_contraria).toBe("ITAU");
    expect(separarPartes("ANA vs. ITAU").parte_contraria).toBe("ITAU");
  });

  // A armadilha: separar por "x" cru comeria a letra de nomes que a contêm.
  it("NÃO parte o x dentro de palavra", () => {
    expect(separarPartes("XAVIER DE OLIVEIRA")).toEqual({ cliente: "XAVIER DE OLIVEIRA", parte_contraria: null });
    expect(separarPartes("FELIX MAXIMO")).toEqual({ cliente: "FELIX MAXIMO", parte_contraria: null });
    expect(separarPartes("XAVIER x BANCO PAN")).toEqual({ cliente: "XAVIER", parte_contraria: "BANCO PAN" });
  });

  it("sem separador, tudo é cliente e a parte contrária fica NULA (não inventa réu)", () => {
    expect(separarPartes("MARIA SILVA")).toEqual({ cliente: "MARIA SILVA", parte_contraria: null });
  });

  it("separador na borda não é divisão confiável", () => {
    expect(separarPartes("x BANCO BMG").parte_contraria).toBeNull();
    expect(separarPartes("MARIA x").parte_contraria).toBeNull();
  });

  it("célula vazia devolve cliente vazio (quem chama descarta a linha)", () => {
    expect(separarPartes("")).toEqual({ cliente: "", parte_contraria: null });
    expect(separarPartes(null)).toEqual({ cliente: "", parte_contraria: null });
  });
});

describe("parseDataHoraBR", () => {
  it("lê o formato da planilha, com acento e caixa quaisquer", () => {
    expect(parseDataHoraBR("dia 6 de Março de 2025 às 09:00")).toBe(`2025-03-06T09:00:00${FUSO_BRASIL}`);
    expect(parseDataHoraBR("6 de marco de 2025 as 9h")).toBe(`2025-03-06T09:00:00${FUSO_BRASIL}`);
    expect(parseDataHoraBR("DIA 14 DE AGOSTO DE 2026 ÀS 14H30")).toBe(`2026-08-14T14:30:00${FUSO_BRASIL}`);
    expect(parseDataHoraBR("1º de Abril de 2026 às 14:30")).toBe(`2026-04-01T14:30:00${FUSO_BRASIL}`);
    expect(parseDataHoraBR("6 mar 2025 as 10:15")).toBe(`2025-03-06T10:15:00${FUSO_BRASIL}`);
  });

  it("lê data numérica e ano de 2 dígitos", () => {
    expect(parseDataHoraBR("06/03/2025 09:00")).toBe(`2025-03-06T09:00:00${FUSO_BRASIL}`);
    expect(parseDataHoraBR("6-3-25 09:00")).toBe(`2025-03-06T09:00:00${FUSO_BRASIL}`);
  });

  it("sem hora reconhecida cai em meia-noite (não chuta horário de audiência)", () => {
    expect(parseDataHoraBR("06/03/2025")).toBe(`2025-03-06T00:00:00${FUSO_BRASIL}`);
  });

  it("repassa ISO já pronto mantendo o offset do Brasil", () => {
    expect(parseDataHoraBR("2025-03-06T09:00:00-03:00")).toBe(`2025-03-06T09:00:00${FUSO_BRASIL}`);
    expect(parseDataHoraBR("2025-03-06 09:00")).toBe(`2025-03-06T09:00:00${FUSO_BRASIL}`);
  });

  // O offset FIXO é a decisão: sem ele o timestamptz assumiria UTC e toda
  // audiência entraria 3h adiantada.
  it("sempre carimba -03:00", () => {
    expect(parseDataHoraBR("dia 6 de Março de 2025 às 09:00")!.endsWith("-03:00")).toBe(true);
  });

  it("recusa o que não reconhece, em vez de adivinhar", () => {
    expect(parseDataHoraBR("a confirmar")).toBeNull();
    expect(parseDataHoraBR("")).toBeNull();
    expect(parseDataHoraBR(null)).toBeNull();
    expect(parseDataHoraBR("31 de fevereiro de 2025")).toBeNull();  // data inexistente
    expect(parseDataHoraBR("6 de xxxxx de 2025")).toBeNull();       // mês inválido
    expect(parseDataHoraBR("30/02/2025")).toBeNull();
  });
});

describe("detectarColunas", () => {
  it("acha as colunas pelo cabeçalho, com acento e caixa quaisquer", () => {
    const m = detectarColunas(["Cliente x Réu", "Data da audiência", "Tipo de ação", "Nº do processo", "Observações"]);
    expect(m).toMatchObject({ partes: 0, data: 1, tipo_acao: 2, processo_numero: 3, observacao: 4 });
  });

  it("cabeçalho desconhecido não vira palpite", () => {
    expect(detectarColunas(["aaa", "bbb"])).toEqual({});
  });
});

describe("montarLoteAudiencias", () => {
  const cols = { partes: 0, data: 1, tipo_acao: 2, processo_numero: 3, observacao: 4 };

  it("monta o item no formato que a RPC espera", () => {
    const { itens, descartadas } = montarLoteAudiencias(
      [["MARIA x BANCO BMG", "dia 14 de Agosto de 2026 às 09:00", "RMC", "", "levar procuração"]],
      cols, "Tabela de audiências / Agosto",
    );
    expect(descartadas).toHaveLength(0);
    expect(itens[0]).toEqual({
      cliente: "MARIA",
      parte_contraria: "BANCO BMG",
      data_hora: `2026-08-14T09:00:00${FUSO_BRASIL}`,
      tipo_acao: "RMC",
      processo_numero: null,
      observacao: "levar procuração",
      origem: "Tabela de audiências / Agosto",
    });
  });

  it("linha sem data vai para descartadas com o motivo, NÃO para o lote", () => {
    const { itens, descartadas } = montarLoteAudiencias(
      [["MARIA x BMG", "a confirmar", "RMC", "", ""]], cols, "Agosto",
    );
    expect(itens).toHaveLength(0);
    expect(descartadas[0].motivo).toMatch(/data não reconhecida/);
    expect(descartadas[0].linha).toBe(1);
  });

  it("linha sem cliente vai para descartadas", () => {
    const { itens, descartadas } = montarLoteAudiencias(
      [["", "06/03/2025 09:00", "", "", ""]], cols, "Marco",
    );
    expect(itens).toHaveLength(0);
    expect(descartadas[0].motivo).toBe("sem cliente");
  });

  it("linha totalmente vazia é separador visual: ignorada sem poluir o relatório", () => {
    const { itens, descartadas } = montarLoteAudiencias(
      [["", "", "", "", ""], ["ANA x ITAU", "06/03/2025 09:00", "", "", ""]], cols, "Marco",
    );
    expect(itens).toHaveLength(1);
    expect(descartadas).toHaveLength(0);
  });

  it("coluna ausente no mapa não quebra o parse", () => {
    const { itens } = montarLoteAudiencias(
      [["ANA x ITAU", "06/03/2025 09:00"]], { partes: 0, data: 1 }, "Marco",
    );
    expect(itens[0].tipo_acao).toBeNull();
    expect(itens[0].observacao).toBeNull();
  });
});

describe("offsets de lembrete", () => {
  it("default confirmado pelo Rodrigo (item 4.3)", () => {
    expect(OFFSETS_LEMBRETE_DEFAULT).toEqual([7, 3, 1, 0]);
  });
});

describe("detectarColunas — colisão de coluna", () => {
  // "Processo x Réu" é como a coluna das partes às vezes vem titulada. Sem a
  // prioridade + reserva de coluna, `partes` e `processo_numero` apontariam para o
  // MESMO índice e o número do processo viria com o nome do cliente dentro.
  it("uma coluna não é reivindicada por duas chaves", () => {
    const m = detectarColunas(["Processo x Réu", "Data", "Nº do processo"]);
    expect(m.partes).toBe(0);
    expect(m.processo_numero).toBe(2);
  });

  it("'Nº do processo' é reconhecido apesar do º sumir na normalização", () => {
    expect(detectarColunas(["Nº do processo"])).toEqual({ processo_numero: 0 });
    expect(detectarColunas(["N° DO PROCESSO"])).toEqual({ processo_numero: 0 });
    expect(detectarColunas(["Numero do Processo"])).toEqual({ processo_numero: 0 });
    expect(detectarColunas(["Autos"])).toEqual({ processo_numero: 0 });
  });
});
