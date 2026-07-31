import { describe, it, expect, vi } from "vitest";

// audienciaCard13 importa DOCUMENT_TYPE_LABELS de components/clients/shared, que
// arrasta react-router. Só precisamos das constantes puras; stub do módulo evita
// carregar a árvore de UI no teste de lógica.
vi.mock("@/components/clients/shared", () => ({
  DOCUMENT_TYPE_LABELS: { procuracao: "Procuração", extrato_inss: "Extrato INSS" },
}));

import {
  agruparDescartes, avisoTeseNaoResolvida, colunaLetra, colunasDuplicadas,
  detectarLinhaCabecalho, docLabel, ensaioLiberaConfirmacao, faltamColunasObrigatorias,
  linhaAbsoluta, mesmosOffsets, parsearOffsets, resumoImportacao, rotuloDiasLembrete,
  semaforoDocumentos, teseViaLabel, textoResultadoLembrete, traduzirErroRpc,
  traduzirFalhaLembrete, traduzirFalhaPreparacao,
} from "../audienciaCard13";

/* Todo dado de exemplo é FICTÍCIO (repo público). */

describe("traduzirErroRpc — 42501 nunca vira lista vazia", () => {
  it("42501 diz que é falta de acesso e o que NÃO foi feito", () => {
    const t = traduzirErroRpc({ code: "42501", message: "sem permissão" }, "Importação NÃO realizada");
    expect(t).toContain("Importação NÃO realizada");
    expect(t).toContain("você não tem acesso");
  });

  it("reconhece o gate da importação pela mensagem (sem code)", () => {
    expect(traduzirErroRpc({ message: "importação de audiências restrita a quem gerencia audiências" }, "X"))
      .toContain("você não tem acesso");
  });

  it("22007 (data vazia em coluna date) tem texto próprio", () => {
    expect(traduzirErroRpc({ code: "22007" }, "Lembrete NÃO registrado")).toContain("data em formato inválido");
  });

  it("erro desconhecido preserva a mensagem do servidor", () => {
    expect(traduzirErroRpc({ message: "boom" }, "Preparação NÃO gerada")).toBe("Preparação NÃO gerada: boom.");
  });
});

describe("motivos que EXISTEM no banco", () => {
  it("status_invalido e lembrete_nao_encontrado (registrar_lembrete_audiencia)", () => {
    expect(traduzirFalhaLembrete("status_invalido", "Status: feito, nao_atendeu ou cancelado."))
      .toBe("Lembrete NÃO registrado: o status enviado não é aceito (use Feito, Não atendeu ou Cancelar).");
    expect(traduzirFalhaLembrete("lembrete_nao_encontrado")).toContain("não existe mais");
  });

  it("motivo desconhecido cai na mensagem da RPC, depois no próprio motivo", () => {
    expect(traduzirFalhaLembrete("xyz", "explicação do servidor")).toContain("explicação do servidor");
    expect(traduzirFalhaLembrete("xyz")).toContain("xyz");
    expect(traduzirFalhaLembrete()).toContain("motivo não informado");
  });

  it("audiencia_nao_encontrada (preparar_audiencia)", () => {
    expect(traduzirFalhaPreparacao("audiencia_nao_encontrada")).toContain("audiência não encontrada");
    expect(traduzirFalhaPreparacao("audiencia_nao_encontrada")).toContain("NÃO gerada");
  });
});

describe("textoResultadoLembrete — pendencia_encerrada é DERIVADO", () => {
  it("nao_atendeu diz que a pendência FICA ABERTA e repassa a nota da RPC", () => {
    const t = textoResultadoLembrete({
      ok: true, status: "nao_atendeu", pendencia_encerrada: false,
      nota: "Pendência permanece aberta para nova tentativa.",
    });
    expect(t).toContain("NÃO ATENDEU");
    expect(t).toContain("ABERTA");
    expect(t).toContain("Pendência permanece aberta");
  });

  // A armadilha medida: a flag vem true mesmo sem UPDATE efetivo na tarefa.
  it("feito com pendencia_encerrada=true NÃO afirma que a pendência foi fechada", () => {
    const t = textoResultadoLembrete({ ok: true, status: "feito", pendencia_encerrada: true });
    expect(t).toContain("DERIVADO");
    expect(t).toContain("não confirma");
    expect(t).not.toMatch(/pendência fechada/i);
  });

  it("cancelado sem tarefa vinculada explica que não havia o que encerrar", () => {
    const t = textoResultadoLembrete({ ok: true, status: "cancelado", pendencia_encerrada: false });
    expect(t).toContain("CANCELADO");
    expect(t).toContain("Não havia tarefa");
  });
});

describe("rotuloDiasLembrete", () => {
  const hoje = new Date(2026, 6, 30); // 30/07/2026 local

  it("hoje, futuro e atraso", () => {
    expect(rotuloDiasLembrete("2026-07-30", false, hoje)).toMatchObject({ dias: 0, texto: "hoje", cls: "p" });
    expect(rotuloDiasLembrete("2026-08-02", false, hoje)).toMatchObject({ dias: 3, cls: "n" });
    expect(rotuloDiasLembrete("2026-07-27", false, hoje)).toMatchObject({ dias: -3, cls: "d" });
    expect(rotuloDiasLembrete("2026-07-27", false, hoje).texto).toBe("atrasado 3 dia(s)");
  });

  // A data é `date` puro: interpretar como UTC jogaria o dia para trás no fuso -03.
  it("data de hoje não vira 'atrasado 1 dia' por causa de fuso", () => {
    expect(rotuloDiasLembrete("2026-07-30", false, new Date(2026, 6, 30, 23, 59)).texto).toBe("hoje");
  });

  it("lembrete encerrado não é cobrança: perde o vermelho", () => {
    expect(rotuloDiasLembrete("2026-07-27", true, hoje)).toMatchObject({ cls: "n", texto: "há 3 dia(s)" });
  });

  it("data ilegível não inventa dia", () => {
    expect(rotuloDiasLembrete("", false, hoje).texto).toBe("sem data");
  });
});

describe("preparação — a tela não pode mentir", () => {
  it("tese resolvida: sem aviso", () => {
    expect(avisoTeseNaoResolvida({ ok: true, tese_resolvida: true, tipo_acao: "Revisional" })).toBeNull();
  });

  // MEDIDO: sem tese a RPC devolve documentos_esperados = ['procuracao'] e a
  // preparação PARECE completa.
  it("tese NÃO resolvida: avisa que a lista não é da tese e manda cadastrar apelido", () => {
    const a = avisoTeseNaoResolvida({
      ok: true, tese_resolvida: false, tipo_acao: "ACAO FICTICIA",
      documentos_esperados: ["procuracao"],
    });
    expect(a).toContain("NÃO casou");
    expect(a).toContain("tipo_acao_apelidos");
    expect(a).toContain("apenas a procuração");
  });

  it("teseViaLabel cobre os três valores do banco e o nulo", () => {
    expect(teseViaLabel("processo")).toContain("processo");
    expect(teseViaLabel("nome_exato")).toContain("nome");
    expect(teseViaLabel("apelido")).toContain("tipo_acao_apelidos");
    expect(teseViaLabel(null)).toBe("não resolvida");
  });

  it("semáforo: cliente sem vínculo vem antes de tudo (todos aparecem faltando)", () => {
    const s = semaforoDocumentos({
      ok: true, cliente_vinculado: false,
      documentos_esperados: ["procuracao", "extrato_inss"], documentos_faltando: ["procuracao", "extrato_inss"],
    });
    expect(s.cls).toBe("d");
    expect(s.texto).toContain("sem cliente vinculado");
  });

  it("semáforo: nada faltando = ok; faltando = vermelho com a fração", () => {
    expect(semaforoDocumentos({
      ok: true, cliente_vinculado: true,
      documentos_esperados: ["procuracao"], documentos_presentes: ["procuracao"], documentos_faltando: [],
    })).toMatchObject({ cls: "ok" });
    const s = semaforoDocumentos({
      ok: true, cliente_vinculado: true,
      documentos_esperados: ["procuracao", "extrato_inss"], documentos_faltando: ["extrato_inss"],
    });
    expect(s.cls).toBe("d");
    expect(s.texto).toContain("1 de 2");
  });

  it("docLabel usa o vocabulário do repo e não esconde código desconhecido", () => {
    expect(docLabel("procuracao")).toBe("Procuração");
    expect(docLabel("codigo_novo")).toBe("codigo_novo");
  });
});

describe("offsets dos lembretes", () => {
  it("aceita o default e ordena do mais distante ao dia da audiência", () => {
    expect(parsearOffsets("7, 3, 1, 0")).toEqual({ offsets: [7, 3, 1, 0], erro: null });
    expect(parsearOffsets("0 1 3 7").offsets).toEqual([7, 3, 1, 0]);
  });

  it("remove repetido (o contador da RPC contaria duas vezes)", () => {
    expect(parsearOffsets("7,7,3").offsets).toEqual([7, 3]);
  });

  it("recusa em vez de consertar: negativo, texto, fora da faixa e vazio", () => {
    expect(parsearOffsets("-3").erro).toMatch(/inválido/);
    expect(parsearOffsets("abc").erro).toMatch(/ao menos um offset/);
    expect(parsearOffsets("400").erro).toMatch(/inválido/);
    expect(parsearOffsets("").offsets).toEqual([]);
    expect(parsearOffsets("").erro).toBeTruthy();
  });

  it("mesmosOffsets ignora a ordem", () => {
    expect(mesmosOffsets([7, 3, 1, 0], [0, 1, 3, 7])).toBe(true);
    expect(mesmosOffsets([7, 3], [7, 3, 1])).toBe(false);
    expect(mesmosOffsets(undefined, [])).toBe(true);
  });
});

describe("ensaioLiberaConfirmacao — dry-run obrigatório", () => {
  const ok = { ok: true, dry_run: true, audiencias_criadas: 12, offsets_usados: [7, 3, 1, 0] };

  it("sem ensaio não libera", () => {
    expect(ensaioLiberaConfirmacao(null, [7, 3, 1, 0])).toMatchObject({ libera: false });
    expect(ensaioLiberaConfirmacao(null, [7]).bloqueio).toMatch(/dry-run/);
  });

  it("libera com ensaio ok, dry_run=true e mesmos offsets", () => {
    expect(ensaioLiberaConfirmacao(ok, [0, 1, 3, 7])).toEqual({ libera: true, bloqueio: null });
  });

  // Confiamos no ECO do banco, não na nossa intenção: se o retorno não é de
  // ensaio, ele já gravou — não pode virar autorização para gravar de novo.
  it("retorno que não é de ensaio não libera", () => {
    expect(ensaioLiberaConfirmacao({ ...ok, dry_run: false }, [7, 3, 1, 0]).libera).toBe(false);
  });

  it("mexer nos offsets depois do ensaio invalida", () => {
    const r = ensaioLiberaConfirmacao(ok, [10, 5]);
    expect(r.libera).toBe(false);
    expect(r.bloqueio).toMatch(/offsets mudaram/);
  });

  it("ensaio com zero audiências novas não libera", () => {
    expect(ensaioLiberaConfirmacao({ ...ok, audiencias_criadas: 0 }, [7, 3, 1, 0]).libera).toBe(false);
  });
});

describe("resumoImportacao — rótulo diz o DESTINO da linha", () => {
  const ret = {
    ok: true, dry_run: true, audiencias_criadas: 500, duplicadas_ignoradas: 4,
    sem_match_cliente: 120, nome_ambiguo: 3, audiencias_passadas: 480, lembretes_criados: 40,
    offsets_usados: [7, 3, 1, 0], erros: [],
  };

  it("no ensaio fala em futuro e avisa que nada foi gravado", () => {
    const linhas = resumoImportacao(ret);
    const criadas = linhas.find((l) => l.chave === "audiencias_criadas");
    expect(criadas?.label).toContain("serão criadas");
    expect(criadas?.explica).toContain("ensaio");
  });

  it("na importação real fala em passado", () => {
    const criadas = resumoImportacao({ ...ret, dry_run: false })
      .find((l) => l.chave === "audiencias_criadas");
    expect(criadas?.label).toBe("Audiências criadas");
  });

  // sem_match/ambíguo NÃO descartam a audiência — a RPC insere com client_name.
  it("sem cliente e nome ambíguo dizem que ENTRAM sem vínculo", () => {
    const linhas = resumoImportacao(ret);
    expect(linhas.find((l) => l.chave === "sem_match_cliente")?.explica).toContain("NÃO são descartadas");
    expect(linhas.find((l) => l.chave === "nome_ambiguo")?.explica).toContain("sem vínculo");
  });

  it("passadas explicam por que não geram lembrete", () => {
    expect(resumoImportacao(ret).find((l) => l.chave === "audiencias_passadas")?.explica)
      .toContain("não geram lembrete");
  });

  it("linha de erros só aparece quando há erro", () => {
    expect(resumoImportacao(ret).some((l) => l.chave === "erros")).toBe(false);
    const comErro = resumoImportacao({ ...ret, erros: [{ cliente: "FULANO DE TAL", erro: "23514" }] });
    expect(comErro.find((l) => l.chave === "erros")).toMatchObject({ valor: 1, cls: "d" });
  });

  it("contador ausente vira 0 (não NaN nem 'undefined' na tela)", () => {
    expect(resumoImportacao({ ok: true, dry_run: true }).every((l) => Number.isInteger(l.valor))).toBe(true);
  });
});

describe("planilha — cabeçalho, colunas e linhas", () => {
  const abaFicticia: string[][] = [
    ["TABELA DE AUDIENCIAS", "", "", ""],
    ["Junho/2025", "", "", ""],
    ["Cliente x Réu", "Data da audiência", "Tese", "Nº do processo"],
    ["FULANO DE TAL x BANCO EXEMPLO S.A.", "dia 6 de Junho de 2025 às 09:00", "Revisional", "0000000-00.0000.0.00.0000"],
  ];

  it("acha a linha do cabeçalho depois do título/mês", () => {
    expect(detectarLinhaCabecalho(abaFicticia)).toBe(2);
  });

  it("devolve -1 quando não há cabeçalho reconhecível (a tela pergunta em vez de adivinhar)", () => {
    expect(detectarLinhaCabecalho([["a", "b"], ["c", "d"]])).toBe(-1);
  });

  it("linha reportada é a da PLANILHA, não a do recorte de dados", () => {
    // cabeçalho na linha 3 (índice 2) → 1ª linha de dados é a 4 da planilha
    expect(linhaAbsoluta(1, 2)).toBe(4);
    expect(linhaAbsoluta(1, 0)).toBe(2);
  });

  it("colunaLetra como o Excel mostra", () => {
    expect(colunaLetra(0)).toBe("A");
    expect(colunaLetra(25)).toBe("Z");
    expect(colunaLetra(26)).toBe("AA");
    expect(colunaLetra(-1)).toBe("?");
  });

  it("faltamColunasObrigatorias cobra partes e data", () => {
    expect(faltamColunasObrigatorias({})).toHaveLength(2);
    expect(faltamColunasObrigatorias({ partes: 0, data: 1 })).toEqual([]);
    expect(faltamColunasObrigatorias({ partes: 0 })[0]).toContain("Data");
  });

  it("colunasDuplicadas pega duas chaves na mesma célula", () => {
    expect(colunasDuplicadas({ partes: 0, data: 1 })).toEqual([]);
    expect(colunasDuplicadas({ partes: 0, data: 1, processo_numero: 0 })).toHaveLength(1);
  });

  it("agruparDescartes junta o mesmo motivo e ordena pelo maior grupo", () => {
    const g = agruparDescartes([
      { linha: 5, motivo: 'data não reconhecida: "6 de xxx"' },
      { linha: 6, motivo: 'data não reconhecida: "amanhã"' },
      { linha: 7, motivo: "sem cliente" },
      { linha: 8, motivo: 'data não reconhecida: "??"' },
    ]);
    expect(g[0]).toMatchObject({ motivo: "data não reconhecida", quantidade: 3 });
    expect(g[0].linhas).toEqual([5, 6, 8]);
    expect(g[1]).toMatchObject({ motivo: "sem cliente", quantidade: 1 });
  });
});
