import { describe, it, expect } from "vitest";
import {
  SEM_VARA, agruparPorVara, aplicarFiltros, avisosCumprir, avisosRegistrar,
  clienteLabel, diasEntre, estaVencida, falhaCumprir, falhaRegistrar, filtrosAtivos,
  fold, linhagem, prazoMeta, processoLabel, responsavelLabel,
  type DiligenciaRow, type FiltrosDiligencia,
} from "../diligenciasLogic";

/* Card 11 — lógica da tela de diligências.
   Todo dado aqui é FICTÍCIO (repo público): nenhum número de processo, nome de
   cliente ou vara real. */

const HOJE = "2026-07-30";

function row(over: Partial<DiligenciaRow> = {}): DiligenciaRow {
  return {
    id: "id-1", process_id: null, process_numero_texto: "PROCESSO-EXEMPLO-A",
    client_id: null, vara: "1ª Vara Exemplo", tipo: "balcao_virtual",
    descricao: "pedir vista dos autos", prazo: "2026-08-10", status: "pendente",
    protocolo: null, resultado: null, cumprida_em: null, diligencia_origem_id: null,
    responsavel_nome: null, responsavel_user_id: null, notes: null, is_test: false,
    created_at: "2026-07-01T12:00:00Z", pendencia_task_id: null, processes: null,
    ...over,
  };
}

describe("estaVencida / prazoMeta", () => {
  it("pendente com prazo anterior a hoje está vencida", () => {
    expect(estaVencida(row({ prazo: "2026-07-29" }), HOJE)).toBe(true);
  });
  it("prazo igual a hoje NÃO está vencida (o banco compara com <)", () => {
    expect(estaVencida(row({ prazo: HOJE }), HOJE)).toBe(false);
  });
  it("cumprida ou prejudicada com prazo velho não está vencida", () => {
    expect(estaVencida(row({ prazo: "2026-01-01", status: "cumprida" }), HOJE)).toBe(false);
    expect(estaVencida(row({ prazo: "2026-01-01", status: "prejudicada" }), HOJE)).toBe(false);
  });
  it("sem prazo nunca está vencida", () => {
    expect(estaVencida(row({ prazo: null }), HOJE)).toBe(false);
  });
  it("prazoMeta conta atraso, hoje e antecedência", () => {
    expect(prazoMeta(row({ prazo: "2026-07-25" }), HOJE)).toMatchObject({ detalhe: "vencida há 5 dia(s)", vencida: true });
    expect(prazoMeta(row({ prazo: HOJE }), HOJE)).toMatchObject({ detalhe: "vence hoje", vencida: false });
    expect(prazoMeta(row({ prazo: "2026-08-02" }), HOJE)).toMatchObject({ detalhe: "em 3 dia(s)", vencida: false });
    expect(prazoMeta(row({ prazo: null }), HOJE)).toMatchObject({ texto: "sem prazo", detalhe: null });
  });
  it("diasEntre atravessa mês sem erro", () => {
    expect(diasEntre("2026-07-30", "2026-08-02")).toBe(3);
    expect(diasEntre("2026-08-02", "2026-07-30")).toBe(-3);
  });
});

describe("rótulos das colunas", () => {
  it("processo vinculado usa o número de processes", () => {
    const r = row({ process_id: "p1", process_numero_texto: null, processes: { process_number: "PROCESSO-EXEMPLO-B", client_name: null } });
    expect(processoLabel(r)).toEqual({ vinculado: true, texto: "PROCESSO-EXEMPLO-B" });
  });
  it("vinculado sem embed avisa que não carregou, em vez de inventar", () => {
    const r = row({ process_id: "p1", process_numero_texto: null, processes: null });
    expect(processoLabel(r).vinculado).toBe(true);
    expect(processoLabel(r).texto).toMatch(/não carregado/);
  });
  it("diligência-ponte é 'não vinculado' e mostra o número em texto", () => {
    expect(processoLabel(row())).toEqual({ vinculado: false, texto: "PROCESSO-EXEMPLO-A" });
  });
  it("cliente sai de processes.client_name; ponte sem cliente é nulo", () => {
    expect(clienteLabel(row({ processes: { process_number: null, client_name: "FULANO DE TAL" } }))).toBe("FULANO DE TAL");
    expect(clienteLabel(row())).toBeNull();
    expect(clienteLabel(row({ client_id: "c1" }))).toMatch(/não carregado/);
  });
  it("responsável é texto livre; só user_id vira aviso", () => {
    expect(responsavelLabel(row({ responsavel_nome: " Dra. Exemplo " }))).toBe("Dra. Exemplo");
    expect(responsavelLabel(row())).toBeNull();
    expect(responsavelLabel(row({ responsavel_user_id: "u1" }))).toBe("(usuário vinculado)");
  });
});

describe("filtros", () => {
  const base: FiltrosDiligencia = { status: "todas", vara: "", processo: "", vencendoAte: "" };
  const lista = [
    row({ id: "a", status: "pendente", vara: "1ª Vara Cível", prazo: "2026-08-01" }),
    row({ id: "b", status: "cumprida", vara: "2ª Vara de Família", prazo: "2026-07-01" }),
    row({ id: "c", status: "pendente", vara: null, prazo: null, process_numero_texto: "OUTRO-EXEMPLO" }),
  ];

  it("status filtra e 'todas' não filtra", () => {
    expect(aplicarFiltros(lista, { ...base, status: "pendente" }).map(d => d.id)).toEqual(["a", "c"]);
    expect(aplicarFiltros(lista, base)).toHaveLength(3);
  });
  it("vara ignora acento e caixa", () => {
    expect(aplicarFiltros(lista, { ...base, vara: "vara civel" }).map(d => d.id)).toEqual(["a"]);
  });
  it("processo casa por pedaço do número", () => {
    expect(aplicarFiltros(lista, { ...base, processo: "outro" }).map(d => d.id)).toEqual(["c"]);
  });
  it("'vencendo até' EXCLUI quem não tem prazo (regra do banco)", () => {
    expect(aplicarFiltros(lista, { ...base, vencendoAte: "2026-08-05" }).map(d => d.id)).toEqual(["a", "b"]);
  });
  it("filtrosAtivos descreve só o que está preenchido", () => {
    expect(filtrosAtivos(base)).toEqual([]);
    expect(filtrosAtivos({ ...base, status: "pendente", vara: "cível" })).toEqual([
      "status Pendente", "vara contendo “cível”",
    ]);
  });
  it("fold dobra caixa, acento e ordinal (ª→a)", () => {
    expect(fold(" 1ª Vara CÍVEL ")).toBe("1a vara civel");
    expect(fold("2º Juizado")).toBe("2o juizado");
  });
});

describe("agruparPorVara", () => {
  it("ordena varas em pt-BR e joga 'sem vara' para o fim", () => {
    const g = agruparPorVara([
      row({ id: "1", vara: null }),
      row({ id: "2", vara: "Vara de Órfãos" }),
      row({ id: "3", vara: "1ª Vara Exemplo" }),
    ], HOJE);
    expect(g.map(x => x.chave)).toEqual(["1a vara exemplo", "vara de orfaos", SEM_VARA]);
    expect(g[2].vara).toBeNull();
  });
  it("junta grafias diferentes da mesma vara e declara quantas", () => {
    const g = agruparPorVara([
      row({ id: "1", vara: "1ª Vara Cível" }),
      row({ id: "2", vara: "1a vara civel" }),
    ], HOJE);
    expect(g).toHaveLength(1);
    expect(g[0].vara).toBe("1ª Vara Cível");
    expect(g[0].grafias).toHaveLength(2);
  });
  it("dentro do grupo: prazo crescente, sem prazo no fim", () => {
    const g = agruparPorVara([
      row({ id: "sem", prazo: null }),
      row({ id: "tarde", prazo: "2026-09-01" }),
      row({ id: "cedo", prazo: "2026-08-01" }),
    ], HOJE);
    expect(g[0].rows.map(r => r.id)).toEqual(["cedo", "tarde", "sem"]);
  });
  it("conta pendentes e vencidas do grupo", () => {
    const g = agruparPorVara([
      row({ id: "1", prazo: "2026-07-01" }),
      row({ id: "2", prazo: "2026-07-02", status: "cumprida" }),
      row({ id: "3", prazo: "2026-12-01" }),
    ], HOJE);
    expect(g[0]).toMatchObject({ pendentes: 2, vencidas: 1 });
  });
});

describe("linhagem", () => {
  const orig = row({ id: "orig", prazo: "2026-03-15", cumprida_em: "2026-03-20" });
  const mapa = new Map([[orig.id, orig]]);

  it("sem origem, não há linhagem", () => {
    expect(linhagem(row(), mapa)).toBeNull();
  });
  it("usa o prazo da original e aponta para ela", () => {
    const l = linhagem(row({ id: "nova", diligencia_origem_id: "orig" }), mapa);
    expect(l?.texto).toBe("rediligência de 15/03/2026");
    expect(l?.alvoId).toBe("orig");
    expect(l?.titulo).toMatch(/prazo da diligência original/);
  });
  it("sem prazo na original, cai para a data de cumprimento", () => {
    const semPrazo = row({ id: "o2", prazo: null, cumprida_em: "2026-03-20" });
    const l = linhagem(row({ diligencia_origem_id: "o2" }), new Map([[semPrazo.id, semPrazo]]));
    expect(l?.texto).toBe("rediligência de 20/03/2026");
    expect(l?.titulo).toMatch(/cumprida/);
  });
  it("original fora da lista: diz isso e não oferece link", () => {
    const l = linhagem(row({ diligencia_origem_id: "fantasma" }), mapa);
    expect(l?.alvoId).toBeNull();
    expect(l?.texto).toMatch(/fora desta lista/);
  });
});

describe("tradução das falhas (motivos que EXISTEM no banco)", () => {
  it("42501 nunca é lista vazia: é falta de acesso", () => {
    expect(falhaCumprir(null, { code: "42501" })).toMatch(/restrita a advogado\/sócio/);
    expect(falhaRegistrar(null, { code: "42501" })).toMatch(/restrita a advogado\/sócio/);
  });
  it("cumprir: diligencia_nao_encontrada e diligencia_ja_encerrada", () => {
    expect(falhaCumprir({ ok: false, motivo: "diligencia_nao_encontrada" }, null))
      .toBe("Diligência NÃO cumprida: essa diligência não existe mais (recarregue a lista).");
    expect(falhaCumprir({ ok: false, motivo: "diligencia_ja_encerrada", status_atual: "cumprida" }, null))
      .toMatch(/já está cumprida/);
  });
  it("cumprir: ok:true não é falha", () => {
    expect(falhaCumprir({ ok: true }, null)).toBeNull();
  });
  it("registrar: os três motivos do corpo da RPC", () => {
    expect(falhaRegistrar({ ok: false, motivo: "descricao_obrigatoria" }, null)).toMatch(/descreva o que precisa/);
    expect(falhaRegistrar({ ok: false, motivo: "tipo_invalido", mensagem: "Tipos: ..." }, null)).toMatch(/Tipos: \.\.\./);
    expect(falhaRegistrar({ ok: false, motivo: "processo_nao_informado", mensagem: "Informe o número" }, null)).toMatch(/Informe o número/);
  });
  it("motivo desconhecido não é escondido", () => {
    expect(falhaCumprir({ ok: false, motivo: "motivo_novo_do_banco" }, null)).toMatch(/motivo_novo_do_banco/);
  });
  it("toda falha diz o que NÃO foi feito", () => {
    expect(falhaCumprir({ ok: false, motivo: "x" }, null)).toMatch(/^Diligência NÃO cumprida/);
    expect(falhaRegistrar({ ok: false, motivo: "x" }, null)).toMatch(/^Diligência NÃO registrada/);
  });
});

describe("avisos do retorno", () => {
  it("cumprir: repassa o aviso do banco (balcão virtual sem protocolo)", () => {
    const av = avisosCumprir({ ok: true, sem_protocolo: true, aviso: "Cumprida SEM número de protocolo — fica sem comprovação do balcão virtual (registrado nas observações)." }, false);
    expect(av[0]).toMatch(/sem comprovação do balcão virtual/);
  });
  it("cumprir: sem protocolo em outro tipo, o banco cala e a tela fala", () => {
    const av = avisosCumprir({ ok: true, sem_protocolo: true, aviso: null }, false);
    expect(av[0]).toMatch(/não grava marca nenhuma/);
  });
  it("cumprir: pendência que não fechou é dita; sem pendência, nada é dito", () => {
    expect(avisosCumprir({ ok: true }, true)).toContain("A pendência ligada a esta diligência NÃO foi fechada (já estava concluída ou cancelada).");
    expect(avisosCumprir({ ok: true, pendencia_fechada: true }, true)[0]).toMatch(/foi fechada/);
    expect(avisosCumprir({ ok: true }, false)).toEqual([]);
  });
  it("cumprir: rediligência criada aparece com a data", () => {
    const av = avisosCumprir({ ok: true, rediligencia_id: "nova", rediligenciar_em: "2026-09-01" }, false);
    expect(av.join(" ")).toMatch(/Rediligência criada com prazo 01\/09\/2026/);
  });
  it("cumprir: retorno de falha não gera aviso", () => {
    expect(avisosCumprir({ ok: false, motivo: "x" }, true)).toEqual([]);
  });
  it("registrar: aviso de ponte ganha a leitura do número ambíguo", () => {
    const av = avisosRegistrar({ ok: true, aviso: "Processo ainda não cadastrado no sistema — diligência guardada pelo número. Vincular quando o processo for criado.", pendencia_prazo_criada: true });
    expect(av[0]).toMatch(/ainda não cadastrado/);
    expect(av[1]).toMatch(/MAIS DE UM processo/);
    expect(av[2]).toBe("Pendência de prazo criada em Tarefas.");
  });
  it("registrar: sem prazo, avisa que nenhuma pendência nasceu", () => {
    const av = avisosRegistrar({ ok: true, pendencia_prazo_criada: false });
    expect(av[0]).toMatch(/NENHUMA pendência foi criada/);
  });
});
