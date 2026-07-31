import { describe, it, expect, vi } from "vitest";

// apolicesTab.tsx importa o client do Supabase no topo; sem VITE_SUPABASE_URL
// (ambiente de teste/CI) o createClient lança "supabaseUrl is required." na carga
// do módulo. Este teste só exercita helpers puros, então stubamos o client —
// mesmo padrão de src/lib/clientDocuments.test.ts.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  mensagemDeFalha, paraNumero, formatBRL, parseValorBR,
  resumoPremioMensal, contarReconhecimento,
} from "../tabs/apolicesTab";

/* Card 14 — só a LÓGICA da aba de apólices: tradução do motivo, leitura de valor
   em pt-BR, rodapé do prêmio mensal e contagem dos três estados de reconhecimento.
   Markup não é testado aqui. */

describe("mensagemDeFalha", () => {
  it("devolve null quando a RPC respondeu ok", () => {
    expect(mensagemDeFalha({ ok: true }, null, "X NÃO feito")).toBeNull();
  });

  it("42501 vira falta de acesso, nunca lista vazia", () => {
    expect(mensagemDeFalha(null, { code: "42501", message: "sem permissão" }, "Apólices NÃO carregadas"))
      .toBe("Apólices NÃO carregadas: você não tem acesso a apólices.");
  });

  it("reconhece a falta de acesso pela mensagem quando o code não vem", () => {
    expect(mensagemDeFalha(null, { message: "sem permissão para registrar apólice" }, "Apólice NÃO registrada"))
      .toContain("você não tem acesso");
  });

  it("traduz cada motivo que as três RPCs podem devolver", () => {
    const casos: [string, string][] = [
      ["seguradora_obrigatoria", "informe a seguradora."],
      ["cliente_nao_encontrado", "cliente não encontrado."],
      ["cliente_nao_informado", "cliente não informado."],
      ["ambiguo", "mais de um cliente com esse nome."],
      ["apolice_nao_encontrada", "apólice não encontrada (pode ter sido removida)."],
    ];
    for (const [motivo, esperado] of casos) {
      expect(mensagemDeFalha({ ok: false, motivo }, null, "Apólice NÃO registrada"))
        .toBe(`Apólice NÃO registrada: ${esperado}`);
    }
  });

  it("motivo desconhecido ainda diz o que NÃO foi feito e mostra o código", () => {
    const msg = mensagemDeFalha({ ok: false, motivo: "motivo_novo" }, null, "Apólice NÃO atualizada");
    expect(msg).toBe("Apólice NÃO atualizada: erro (motivo_novo).");
  });

  it("resposta vazia não passa por sucesso", () => {
    expect(mensagemDeFalha(null, null, "Apólice NÃO registrada"))
      .toBe("Apólice NÃO registrada: a chamada não retornou resultado.");
  });
});

describe("paraNumero / formatBRL", () => {
  it("aceita numeric vindo como número ou como string", () => {
    expect(paraNumero(45.9)).toBe(45.9);
    expect(paraNumero("45.90")).toBe(45.9);
  });

  it("null, vazio e lixo viram null (não 0)", () => {
    expect(paraNumero(null)).toBeNull();
    expect(paraNumero(undefined)).toBeNull();
    expect(paraNumero("")).toBeNull();
    expect(paraNumero("abc")).toBeNull();
  });

  it("preserva o zero real, que é diferente de ausente", () => {
    expect(paraNumero(0)).toBe(0);
    expect(formatBRL(0)).toContain("0,00");
  });

  it("valor ausente vira travessão, nunca R$ 0,00", () => {
    expect(formatBRL(null)).toBe("—");
    expect(formatBRL(undefined)).toBe("—");
  });

  it("formata em real brasileiro", () => {
    // Intl separa "R$" do número com espaço NÃO quebrável; normalizo com \s
    // (que casa U+00A0) para o teste não depender do ICU da máquina.
    expect(formatBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
  });
});

describe("parseValorBR", () => {
  it("lê o formato brasileiro com milhar e decimal", () => {
    expect(parseValorBR("1.234,56")).toBe(1234.56);
  });

  it("lê só com vírgula decimal", () => {
    expect(parseValorBR("45,90")).toBe(45.9);
  });

  it("ponto com grupos de 3 é milhar", () => {
    expect(parseValorBR("1.234")).toBe(1234);
    expect(parseValorBR("1.234.567")).toBe(1234567);
  });

  it("ponto que não é grupo de 3 é decimal", () => {
    expect(parseValorBR("45.90")).toBe(45.9);
    expect(parseValorBR("45.9")).toBe(45.9);
  });

  it("ignora prefixo de moeda e espaços", () => {
    expect(parseValorBR(" R$ 89,90 ")).toBe(89.9);
  });

  it("vazio vira null para a RPC receber NULL, não zero", () => {
    expect(parseValorBR("")).toBeNull();
    expect(parseValorBR("   ")).toBeNull();
    expect(parseValorBR("R$")).toBeNull();
  });

  it("inteiro simples", () => {
    expect(parseValorBR("50")).toBe(50);
  });
});

describe("resumoPremioMensal", () => {
  it("soma nula sem nenhuma mensal diz 'nenhuma apólice mensal', não R$ 0,00", () => {
    const r = resumoPremioMensal(null, ["anual", "unico"], false);
    expect(r.valor).toBe("nenhuma apólice mensal");
    expect(r.valor).not.toContain("0,00");
  });

  it("lista vazia também não inventa zero", () => {
    expect(resumoPremioMensal(null, [], false).valor).toBe("nenhuma apólice mensal");
  });

  it("soma nula COM apólice mensal é prêmio não informado, caso diferente", () => {
    const r = resumoPremioMensal(null, ["mensal", "mensal"], false);
    expect(r.valor).toBe("sem valor somável");
    expect(r.detalhe).toContain("2 apólice(s) mensal(is)");
  });

  it("explica que só mensal entra na soma e quantas ficaram de fora", () => {
    const r = resumoPremioMensal(60, ["mensal", "anual", null], false);
    expect(r.valor.replace(/\s/g, " ")).toBe("R$ 60,00");
    expect(r.detalhe).toContain("Só apólices de periodicidade MENSAL entram na soma");
    expect(r.detalhe).toContain("2 de 3 ficou de fora");
  });

  it("quando todas são mensais, diz isso em vez de falar de exclusão", () => {
    const r = resumoPremioMensal(100, ["mensal", "mensal"], false);
    expect(r.detalhe).toContain("todas as 2 são mensais");
    expect(r.detalhe).not.toContain("ficou de fora");
  });

  it("com o filtro ligado, declara que a soma cobre só as não reconhecidas", () => {
    const r = resumoPremioMensal(45.9, ["mensal"], true);
    expect(r.detalhe).toContain("apenas as que o cliente NÃO reconhece");
  });

  it("sem filtro, não fala de escopo restrito", () => {
    expect(resumoPremioMensal(45.9, ["mensal"], false).detalhe).not.toContain("NÃO reconhece");
  });

  it("soma zero real é exibida como valor, não como ausência", () => {
    expect(resumoPremioMensal(0, ["mensal"], false).valor.replace(/\s/g, " ")).toBe("R$ 0,00");
  });
});

describe("contarReconhecimento", () => {
  it("separa os TRÊS estados: null nunca é contado como 'não'", () => {
    const rows = [
      { reconhecida: true },
      { reconhecida: false },
      { reconhecida: false },
      { reconhecida: null },
    ];
    expect(contarReconhecimento(rows)).toEqual({ reconhece: 1, naoReconhece: 2, naoPerguntado: 1 });
  });

  it("lista vazia zera os três", () => {
    expect(contarReconhecimento([])).toEqual({ reconhece: 0, naoReconhece: 0, naoPerguntado: 0 });
  });
});
