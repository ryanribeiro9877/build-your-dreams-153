import { describe, expect, it } from "vitest";
import {
  type ProcuracaoItem,
  diffDias, falhaCampanha, falhaConsulta, falhaRegistro,
  montarLinhagem, notasDaCampanha, notasDoRegistro,
  ordenarFilaRenovacao, parseValidadeMeses, selecionarAtual,
} from "../procuracoes";

/* ============================================================
   Card 15 — lógica pura das procurações
   ============================================================
   Só o que é decisão NOSSA: tradução de motivo do banco, escolha da procuração
   atual, linhagem/descoberto, ordem da fila e validação do formulário. Markup
   não é testado aqui.

   Dados 100% FICTÍCIOS (repo público): nomes "FULANO"/"BELTRANO", ids "p1"…
============================================================ */

/** Fábrica de item de `consultar_procuracoes` (chaves verbatim da RPC). */
function item(over: Partial<ProcuracaoItem> & { id: string }): ProcuracaoItem {
  return {
    cliente: "FULANO DE TAL",
    tipo: "ad_judicia",
    data_assinatura: "2025-01-10",
    validade_ate: "2026-01-10",
    status: "vigente",
    dias_para_vencer: 100,
    vencida: false,
    tem_pdf: false,
    ...over,
  };
}

describe("falhaRegistro — tradução dos motivos que o banco realmente devolve", () => {
  it("ok:true não é falha", () => {
    expect(falhaRegistro({ ok: true, procuracao_id: "p1" }, null)).toBeNull();
  });

  it("data_assinatura_obrigatoria usa a mensagem da RPC (que nomeia o erro do upload)", () => {
    const msg = falhaRegistro({
      ok: false,
      motivo: "data_assinatura_obrigatoria",
      mensagem: "A data de ASSINATURA é o que define a vigência — não use a data do upload.",
    }, null);
    expect(msg).toContain("Procuração NÃO registrada");
    expect(msg).toContain("data do upload");
  });

  it("data_assinatura_obrigatoria sem mensagem ainda diz ASSINATURA", () => {
    const msg = falhaRegistro({ ok: false, motivo: "data_assinatura_obrigatoria" }, null);
    expect(msg).toContain("ASSINATURA");
  });

  it("data_futura é tratado", () => {
    const msg = falhaRegistro({
      ok: false, motivo: "data_futura", mensagem: "Data de assinatura no futuro. Conferir.",
    }, null);
    expect(msg).toBe("Procuração NÃO registrada: Data de assinatura no futuro. Conferir.");
  });

  it.each(["cliente_nao_encontrado", "cliente_nao_informado", "ambiguo"])(
    "motivo %s sempre diz o que NÃO foi gravado", motivo => {
      expect(falhaRegistro({ ok: false, motivo }, null)).toContain("Procuração NÃO registrada");
    });

  it("motivo desconhecido não é engolido", () => {
    const msg = falhaRegistro({ ok: false, motivo: "motivo_que_nao_existe" }, null);
    expect(msg).toContain("motivo_que_nao_existe");
  });

  it("42501 vira acesso, não erro técnico", () => {
    const msg = falhaRegistro(null, { code: "42501", message: "sem permissão para registrar procuração" });
    expect(msg).toContain("não tem acesso");
  });

  it("resposta vazia não passa por sucesso", () => {
    expect(falhaRegistro(null, null)).toContain("não retornou resultado");
  });
});

describe("falhaCampanha / falhaConsulta", () => {
  it("nada_a_renovar usa a mensagem da RPC", () => {
    const msg = falhaCampanha({
      ok: false, motivo: "nada_a_renovar", mensagem: "Nenhuma procuração vencendo em 30 dias.",
    }, null);
    expect(msg).toBe("Campanha NÃO criada: Nenhuma procuração vencendo em 30 dias.");
  });

  it("42501 da campanha explica que o gate é mais estreito que o da consulta", () => {
    const msg = falhaCampanha(null, { code: "42501", message: "sem permissão para criar campanha" });
    expect(msg).toContain("não tem acesso");
    expect(msg).toContain("recepção");
  });

  it("consulta com 42501 nunca vira lista vazia silenciosa", () => {
    expect(falhaConsulta(null, { code: "42501" })).toContain("não tem acesso");
  });

  it("consulta ok não é falha", () => {
    expect(falhaConsulta({ ok: true, total: 0, ja_vencidas: 0, procuracoes: [] }, null)).toBeNull();
  });
});

describe("notasDoRegistro — todo aviso/flag do banco aparece", () => {
  it("anterior VENCIDA denuncia o descoberto", () => {
    const notas = notasDoRegistro({
      ok: true, renovou_anterior: true, status_da_anterior: "vencida",
      pendencia_renovacao_fechada: true,
    });
    const texto = notas.map(n => n.texto).join(" | ");
    expect(texto).toContain("VENCIDA");
    expect(texto).toContain("descoberto");
    expect(texto).toContain("pendência de renovação de procuração foi fechada");
    expect(notas.some(n => n.cls === "d")).toBe(true);
  });

  it("anterior vigente não fala de descoberto", () => {
    const texto = notasDoRegistro({
      ok: true, renovou_anterior: true, status_da_anterior: "vigente",
      pendencia_renovacao_fechada: false,
    }).map(n => n.texto).join(" | ");
    expect(texto).not.toContain("descoberto");
    expect(texto).toContain("Nenhuma pendência de renovação estava aberta");
  });

  it("sem anterior diz que é a primeira", () => {
    const texto = notasDoRegistro({ ok: true, renovou_anterior: false })
      .map(n => n.texto).join(" | ");
    expect(texto).toContain("Primeira procuração");
  });

  it("o aviso da RPC é repassado literalmente, e ja_vencida o marca como grave", () => {
    const notas = notasDoRegistro({
      ok: true, renovou_anterior: false, ja_vencida: true,
      aviso: "Esta procuração JÁ ESTÁ VENCIDA em 2025-01-10 — precisa de renovação imediata.",
    });
    expect(notas[0].texto).toContain("JÁ ESTÁ VENCIDA");
    expect(notas[0].cls).toBe("d");
  });
});

describe("notasDaCampanha — o caso ok:true com fila vazia", () => {
  it("clientes_na_fila 0 é declarado como campanha VAZIA", () => {
    const notas = notasDaCampanha({ ok: true, campanha_id: "c1", clientes_na_fila: 0, sem_telefone: 0 });
    expect(notas[0].texto).toContain("VAZIA");
    expect(notas[0].cls).toBe("d");
  });

  // O `aviso` da RPC JÁ É o texto de sem-telefone. Empilhar a nota própria em cima
  // mostrava a MESMA informação duas vezes no painel — agora é um ou outro.
  it("sem_telefone: usa o aviso da RPC e NÃO duplica a informação", () => {
    const notas = notasDaCampanha({
      ok: true, clientes_na_fila: 10, sem_telefone: 9,
      aviso: "9 de 10 clientes da fila estão SEM TELEFONE cadastrado — a fila é parcialmente inacionável até o import de telefones.",
    });
    const texto = notas.map(n => n.texto).join(" | ");
    expect(texto).toContain("SEM TELEFONE");
    // Uma única nota falando de telefone, não duas.
    expect(notas.filter(n => /telefone/i.test(n.texto))).toHaveLength(1);
  });

  it("sem_telefone sem aviso da RPC: a tela monta o texto ela mesma", () => {
    const texto = notasDaCampanha({ ok: true, clientes_na_fila: 10, sem_telefone: 9, aviso: null })
      .map(n => n.texto).join(" | ");
    expect(texto).toContain("9 de 10 sem telefone");
  });

  it("fila cheia e todos com telefone é dito explicitamente (silêncio seria lido como não conferido)", () => {
    const texto = notasDaCampanha({ ok: true, clientes_na_fila: 4, sem_telefone: 0, aviso: null })
      .map(n => n.texto).join(" | ");
    expect(texto).toContain("Todos os clientes da fila têm telefone");
  });
});

describe("selecionarAtual — a corrente é a NÃO substituída, mesmo vencida", () => {
  const p1 = item({ id: "p1", data_assinatura: "2023-01-10", validade_ate: "2024-01-10", status: "renovada" });
  const p2 = item({ id: "p2", data_assinatura: "2024-03-01", validade_ate: "2025-03-01", status: "vencida", dias_para_vencer: -40, vencida: true });

  it("escolhe a de maior validade entre as não substituídas", () => {
    expect(selecionarAtual([p1, p2], { p1: "p2", p2: null })?.id).toBe("p2");
  });

  it("uma VENCIDA continua sendo a atual (é o caso comum do card)", () => {
    const atual = selecionarAtual([p1, p2], { p1: "p2", p2: null });
    expect(atual?.vencida).toBe(true);
  });

  it("ignora renovada/revogada mesmo sem o mapa de substituição", () => {
    const revogada = item({ id: "p3", validade_ate: "2099-01-01", status: "revogada" });
    expect(selecionarAtual([p1, p2, revogada], {})?.id).toBe("p2");
  });

  it("sem candidato corrente devolve null (não inventa uma vigente)", () => {
    expect(selecionarAtual([p1], { p1: "p2" })).toBeNull();
  });

  it("lista vazia devolve null", () => {
    expect(selecionarAtual([], {})).toBeNull();
  });
});

describe("montarLinhagem — quem substituiu quem e o buraco entre elas", () => {
  const antiga = item({ id: "p1", cliente: "BELTRANO DE TAL", data_assinatura: "2023-01-10", validade_ate: "2024-01-10", status: "renovada" });
  const nova = item({ id: "p2", cliente: "BELTRANO DE TAL", data_assinatura: "2024-03-01", validade_ate: "2025-03-01", status: "vencida", dias_para_vencer: -50, vencida: true });
  const mapa = { p1: "p2", p2: null };

  it("ordena do mais novo para o mais antigo pela data de ASSINATURA", () => {
    expect(montarLinhagem([antiga, nova], mapa).map(l => l.item.id)).toEqual(["p2", "p1"]);
  });

  it("liga a antiga ao sucessor e marca a atual", () => {
    const linhas = montarLinhagem([antiga, nova], mapa);
    expect(linhas[0].atual).toBe(true);
    expect(linhas[0].sucessor).toBeNull();
    expect(linhas[1].sucessor?.id).toBe("p2");
    expect(linhas[1].atual).toBe(false);
  });

  it("mede os dias em que o cliente ficou SEM procuração (10/01/2024 → 01/03/2024)", () => {
    expect(montarLinhagem([antiga, nova], mapa)[1].diasDescoberto).toBe(51);
  });

  it("renovação assinada ANTES do vencimento não gera descoberto", () => {
    const emDia = item({ id: "p2", data_assinatura: "2023-12-20", validade_ate: "2024-12-20" });
    const linhas = montarLinhagem([antiga, emDia], { p1: "p2", p2: null });
    expect(linhas.find(l => l.item.id === "p1")?.diasDescoberto).toBeNull();
  });

  it("sem mapa (leitura da linhagem indisponível) não quebra: só perde o sucessor", () => {
    const linhas = montarLinhagem([antiga, nova], {});
    expect(linhas.every(l => l.sucessor === null)).toBe(true);
    expect(linhas.every(l => l.diasDescoberto === null)).toBe(true);
  });
});

describe("ordenarFilaRenovacao — vencidas PRIMEIRO", () => {
  it("a mais atrasada abre a lista, mesmo com itens a vencer na janela", () => {
    const fila = ordenarFilaRenovacao([
      item({ id: "a", cliente: "FULANO DE TAL", dias_para_vencer: 25, vencida: false }),
      item({ id: "b", cliente: "BELTRANO DE TAL", dias_para_vencer: -3, vencida: true }),
      item({ id: "c", cliente: "CICRANO DE TAL", dias_para_vencer: 0, vencida: false }),
      item({ id: "d", cliente: "SICRANO DE TAL", dias_para_vencer: -90, vencida: true }),
    ]);
    expect(fila.map(p => p.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("empate de dias desempata por nome (ordem estável para o operador)", () => {
    const fila = ordenarFilaRenovacao([
      item({ id: "z", cliente: "ZULEICA DE TAL", dias_para_vencer: 5 }),
      item({ id: "a", cliente: "ALFREDO DE TAL", dias_para_vencer: 5 }),
    ]);
    expect(fila.map(p => p.id)).toEqual(["a", "z"]);
  });

  it("não muta o array recebido", () => {
    const entrada = [
      item({ id: "a", dias_para_vencer: 10, vencida: false }),
      item({ id: "b", dias_para_vencer: -1, vencida: true }),
    ];
    ordenarFilaRenovacao(entrada);
    expect(entrada.map(p => p.id)).toEqual(["a", "b"]);
  });
});

describe("parseValidadeMeses — o banco coage fora de 1–120 em SILÊNCIO", () => {
  it("vazio vira null para a RPC aplicar o default", () => {
    expect(parseValidadeMeses("")).toEqual({ valor: null, erro: null });
  });

  it("aceita 1, 12 e 120", () => {
    expect(parseValidadeMeses("1").valor).toBe(1);
    expect(parseValidadeMeses("12").valor).toBe(12);
    expect(parseValidadeMeses("120").valor).toBe(120);
  });

  it("barra 0 e 121 antes de virar 12 sem aviso", () => {
    expect(parseValidadeMeses("0").erro).toContain("sem avisar");
    expect(parseValidadeMeses("121").erro).toContain("sem avisar");
  });

  it("recusa texto e decimal", () => {
    expect(parseValidadeMeses("doze").erro).toBeTruthy();
    expect(parseValidadeMeses("1,5").erro).toBeTruthy();
  });
});

describe("diffDias", () => {
  it("conta dias entre datas ISO", () => {
    expect(diffDias("2026-01-01", "2026-01-31")).toBe(30);
  });

  it("é negativo quando a segunda data é anterior", () => {
    expect(diffDias("2026-03-01", "2026-02-01")).toBe(-28);
  });

  it("atravessa ano bissexto sem perder o dia 29", () => {
    expect(diffDias("2024-02-28", "2024-03-01")).toBe(2);
  });

  it("data inválida devolve null em vez de NaN", () => {
    expect(diffDias("", "2026-01-01")).toBeNull();
    expect(diffDias("30/07/2026", "2026-01-01")).toBeNull();
  });
});
