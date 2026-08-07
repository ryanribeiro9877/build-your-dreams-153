import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  avisoPrazoPassado, dataOuNull, intOuNull, mensagemMotivoP2,
  normalizarStatusDiligencia, normalizarStatusLembrete,
  notasApolices, notasApoliceRegistrada, notasCampanhaRenovacao,
  notasDiligenciaCumprida, notasDiligenciaRegistrada, notasDocumentosObrigatorios,
  notasLembreteAudiencia,
  notasPreparoAudiencia, notasProcuracaoRegistrada, notasProcuracoes,
  resumoDiligencias,
} from "./p2.ts";

/* ─── Entrada ─────────────────────────────────────────────────────────────── */

Deno.test("dataOuNull: vazio vira null (string vazia em coluna date = 22007)", () => {
  assertEquals(dataOuNull("").valor, null);
  assertEquals(dataOuNull(undefined).valor, null);
  assertEquals(dataOuNull(null).valor, null);
  assertEquals(dataOuNull("2026-08-13").valor, "2026-08-13");
});

Deno.test("dataOuNull: formato fora de AAAA-MM-DD não vira gravação silenciosa", () => {
  assertEquals(dataOuNull("13/08/2026").valor, null);
  assertEquals(dataOuNull("13/08/2026").invalida, "13/08/2026");
  assertEquals(dataOuNull("amanhã").invalida, "amanhã");
});

Deno.test("intOuNull: faixa respeitada e fora da faixa é ERRO (não coage)", () => {
  assertEquals(intOuNull(24, 1, 120).valor, 24);
  assertEquals(intOuNull("24", 1, 120).valor, 24);
  assertEquals(intOuNull("", 1, 120).valor, null);
  assertEquals(intOuNull(0, 1, 120).invalido, "0");
  assertEquals(intOuNull(999, 1, 120).invalido, "999");
  assertEquals(intOuNull("mês que vem", 1, 120).invalido, "mês que vem");
});

/* ─── Status: a RPC coage em silêncio; aqui vira pergunta ─────────────────── */

Deno.test("normalizarStatusDiligencia: sinônimos pt-BR e acento", () => {
  assertEquals(normalizarStatusDiligencia("pendentes").valor, "pendente");
  assertEquals(normalizarStatusDiligencia("Cumpridas").valor, "cumprida");
  assertEquals(normalizarStatusDiligencia("concluídas").valor, "cumprida");
  assertEquals(normalizarStatusDiligencia("prejudicada").valor, "prejudicada");
  assertEquals(normalizarStatusDiligencia("todas").valor, "todas");
  // Omitido = null → o handler nem passa o argumento (default 'pendente' da RPC).
  assertEquals(normalizarStatusDiligencia("").valor, null);
  assertEquals(normalizarStatusDiligencia(undefined).erro, undefined);
});

Deno.test("normalizarStatusDiligencia: valor desconhecido é ERRO, não 'pendente'", () => {
  // A RPC coage qualquer coisa para 'pendente': perguntar pelas "arquivadas"
  // devolveria as pendentes e o usuário acreditaria na resposta errada.
  const r = normalizarStatusDiligencia("arquivadas");
  assertEquals(r.valor, null);
  assert(r.erro && r.erro.includes("pendente, cumprida, prejudicada ou todas"), r.erro);
});

Deno.test("normalizarStatusLembrete: nao_atendeu em várias formas", () => {
  assertEquals(normalizarStatusLembrete("não atendeu").valor, "nao_atendeu");
  assertEquals(normalizarStatusLembrete("nao_atendeu").valor, "nao_atendeu");
  assertEquals(normalizarStatusLembrete("caixa postal").valor, "nao_atendeu");
  assertEquals(normalizarStatusLembrete("avisado").valor, "feito");
  assertEquals(normalizarStatusLembrete("cancelou").valor, "cancelado");
  // Vazio NÃO vira "feito": assumir aviso que não houve é registro falso.
  assertEquals(normalizarStatusLembrete("").valor, null);
  assert(normalizarStatusLembrete("sei lá").erro);
});

/* ─── Tradução de motivo (19 dos 27 não têm `mensagem` no banco) ──────────── */

Deno.test("mensagemMotivoP2: motivo SEM mensagem no banco ganha texto pt-BR", () => {
  for (const motivo of [
    "descricao_obrigatoria", "diligencia_nao_encontrada", "diligencia_ja_encerrada",
    "seguradora_obrigatoria", "apolice_nao_encontrada",
    "lembrete_nao_encontrado", "audiencia_nao_encontrada",
  ]) {
    const msg = mensagemMotivoP2({ ok: false, motivo }, "nada foi registrado");
    assert(msg && msg.length > 20, `motivo ${motivo} sem tradução`);
  }
});

Deno.test("mensagemMotivoP2: diligencia_ja_encerrada usa o status_atual do banco", () => {
  const msg = mensagemMotivoP2(
    { ok: false, motivo: "diligencia_ja_encerrada", status_atual: "cumprida" },
    "a diligência NÃO foi marcada como cumprida",
  );
  assert(msg && msg.includes("cumprida"), msg ?? "");
});

Deno.test("mensagemMotivoP2: data_assinatura_obrigatoria diz ASSINADA, não upload", () => {
  const msg = mensagemMotivoP2({
    ok: false, motivo: "data_assinatura_obrigatoria",
    mensagem: "A data de ASSINATURA é o que define a vigência — não use a data do upload.",
  }, "a procuração NÃO foi registrada") ?? "";
  assert(/ASSINADA/.test(msg), msg);
  assert(/upload/i.test(msg), msg);
});

Deno.test("mensagemMotivoP2: repassa a `mensagem` quando o banco manda uma", () => {
  const msg = mensagemMotivoP2({
    ok: false, motivo: "tipo_invalido",
    mensagem: "Tipos: balcao_virtual, concluso_analise, expedicao_alvara, peticao, carta_precatoria, outro.",
  }, "a diligência NÃO foi registrada") ?? "";
  assert(msg.includes("carta_precatoria"), msg);
  assert(msg.includes("NÃO foi registrada"), msg);
});

Deno.test("mensagemMotivoP2: motivo de OUTRO card devolve null (usa o tradutor genérico)", () => {
  // `ambiguo`/`cliente_nao_encontrado` são do tradutor de cliente, que já existe.
  assertEquals(mensagemMotivoP2({ ok: false, motivo: "ambiguo" }, "x"), null);
  assertEquals(mensagemMotivoP2({ ok: false, motivo: "cliente_nao_encontrado" }, "x"), null);
  // Motivos que o briefing citava mas o banco NÃO tem nestes cards.
  assertEquals(mensagemMotivoP2({ ok: false, motivo: "protocolo_obrigatorio" }, "x"), null);
  assertEquals(mensagemMotivoP2({ ok: false, motivo: "desfecho_invalido" }, "x"), null);
});

/* ─── Card 11: diligências ────────────────────────────────────────────────── */

Deno.test("avisoPrazoPassado: a RPC aceita prazo vencido sem dizer nada", () => {
  const hoje = new Date(2026, 6, 30); // 30/07/2026 (mês é 0-based)
  assert(avisoPrazoPassado("2026-07-24", hoje));
  assertEquals(avisoPrazoPassado("2026-08-13", hoje), null);
  assertEquals(avisoPrazoPassado("2026-07-30", hoje), null);   // hoje não é passado
  assertEquals(avisoPrazoPassado(null, hoje), null);
});

Deno.test("notasDiligenciaRegistrada: caminho PONTE e ausência de pendência", () => {
  const notas = notasDiligenciaRegistrada({
    ok: true, processo_vinculado: false, pendencia_prazo_criada: false,
    aviso: "Processo ainda não cadastrado no sistema — diligência guardada pelo número. Vincular quando o processo for criado.",
  }, null);
  assert(notas.some((n) => /guardada pelo número/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /NÃO nasceu pendência/.test(n)), notas.join(" | "));
});

Deno.test("notasDiligenciaRegistrada: prazo no passado entra como aviso nosso", () => {
  const hoje = new Date(2026, 6, 30);
  const notas = notasDiligenciaRegistrada(
    { ok: true, processo_vinculado: true, pendencia_prazo_criada: true }, "2026-07-01", hoje,
  );
  assertEquals(notas.length, 1);
  assert(/já passou/.test(notas[0]), notas[0]);
});

Deno.test("notasDiligenciaCumprida: sem_protocolo SOZINHO não é alerta", () => {
  // Os 6 tipos devolvem sem_protocolo=true; só balcao_virtual traz `aviso`.
  const semAviso = notasDiligenciaCumprida({ ok: true, sem_protocolo: true, pendencia_fechada: true });
  assertEquals(semAviso.length, 1);
  assert(/não é obrigatório/.test(semAviso[0]), semAviso[0]);
  assert(!/SEM comprova/i.test(semAviso[0]), semAviso[0]);

  const comAviso = notasDiligenciaCumprida({
    ok: true, sem_protocolo: true, pendencia_fechada: true,
    aviso: "Cumprida SEM número de protocolo — fica sem comprovação do balcão virtual (registrado nas observações).",
  });
  assert(comAviso.some((n) => /sem comprovação/.test(n)), comAviso.join(" | "));
});

Deno.test("notasDiligenciaCumprida: rediligência e pendência inexistente", () => {
  const notas = notasDiligenciaCumprida({
    ok: true, sem_protocolo: false, pendencia_fechada: false,
    rediligencia_id: "00000000-0000-0000-0000-000000000000", rediligenciar_em: "2026-08-20",
  });
  assert(notas.some((n) => /2026-08-20/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /Não havia pendência/.test(n)), notas.join(" | "));
});

Deno.test("resumoDiligencias: soma vencidas, sem prazo e as guardadas pelo número", () => {
  const r = resumoDiligencias({
    ok: true, total: 3,
    diligencias: [
      { vencida: true, processo_vinculado: true, prazo: "2026-07-01" },
      { vencida: false, processo_vinculado: false, prazo: "2026-08-30" },
      { vencida: false, processo_vinculado: true, prazo: null },
    ],
  });
  assertEquals(r.vencidas, 1);
  assertEquals(r.sem_prazo, 1);
  assertEquals(r.sem_processo_vinculado, 1);
  assertEquals(r.notas.length, 3);
});

/* ─── Card 14: apólices ───────────────────────────────────────────────────── */

Deno.test("notasApolices: premio_mensal_somado NULL não é prêmio zero", () => {
  const notas = notasApolices({
    ok: true, total: 2, premio_mensal_somado: null,
    apolices: [{ reconhecida: true, periodicidade: "anual" }, { reconhecida: true, periodicidade: "unico" }],
  }, true);
  assert(notas.some((n) => /não se aplica/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /não é o mesmo que prêmio zero/.test(n)), notas.join(" | "));
});

Deno.test("notasApolices: soma presente não gera a nota do NULL", () => {
  const notas = notasApolices({
    ok: true, total: 1, premio_mensal_somado: 43.9,
    apolices: [{ reconhecida: true, periodicidade: "mensal" }],
  }, true);
  assertEquals(notas.filter((n) => /não se aplica/.test(n)).length, 0);
});

Deno.test("notasApolices: TRÊS estados de reconhecida contados separados", () => {
  const notas = notasApolices({
    ok: true, total: 3, premio_mensal_somado: 100,
    apolices: [{ reconhecida: false }, { reconhecida: null }, { reconhecida: true }],
  }, true);
  assert(notas.some((n) => /1 apólice\(s\) que o cliente NÃO reconhece/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /1 sem confirmação do cliente/.test(n)), notas.join(" | "));
});

Deno.test("notasApolices: consulta sem filtro avisa que veio a base inteira", () => {
  const semFiltro = notasApolices({ ok: true, total: 120, premio_mensal_somado: 9, apolices: [] }, false);
  assert(semFiltro.some((n) => /base INTEIRA/.test(n)), semFiltro.join(" | "));
  const comFiltro = notasApolices({ ok: true, total: 120, premio_mensal_somado: 9, apolices: [] }, true);
  assertEquals(comFiltro.filter((n) => /base INTEIRA/.test(n)).length, 0);
});

Deno.test("notasApoliceRegistrada: repassa a `nota` dos três estados", () => {
  assertEquals(notasApoliceRegistrada({ ok: true, nota: null }).length, 0);
  const n = notasApoliceRegistrada({
    ok: true, nota: "Apólice NÃO reconhecida pelo cliente — insumo da tese de seguro não autorizado (SUSEP).",
  });
  assert(n[0].includes("SUSEP"), n[0]);
});

/* ─── Card 15: procurações ────────────────────────────────────────────────── */

Deno.test("notasProcuracoes: vencida = escritório sem poderes", () => {
  const notas = notasProcuracoes({
    ok: true, total: 2, ja_vencidas: 1,
    procuracoes: [
      { vencida: true, dias_para_vencer: -10, tem_pdf: true },
      { vencida: false, dias_para_vencer: 12, tem_pdf: false },
    ],
  }, true);
  assert(notas.some((n) => /sem poderes até renovar/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /vence\(m\) em até 30 dias/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /sem PDF anexado/.test(n)), notas.join(" | "));
});

Deno.test("notasProcuracaoRegistrada: anterior VENCIDA diz que o cliente ficou descoberto", () => {
  const notas = notasProcuracaoRegistrada({
    ok: true, renovou_anterior: true, status_da_anterior: "vencida",
    pendencia_renovacao_fechada: true,
    aviso: "Vence em menos de 30 dias (2026-08-20).",
  });
  assert(notas.some((n) => /descoberto/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /pendência de renovação aberta deste cliente foi encerrada/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /Vence em menos de 30 dias/.test(n)), notas.join(" | "));
});

Deno.test("notasProcuracaoRegistrada: sem anterior não inventa renovação", () => {
  const notas = notasProcuracaoRegistrada({ ok: true, renovou_anterior: false });
  assert(notas.some((n) => /Primeira procuração/.test(n)), notas.join(" | "));
  assertEquals(notas.filter((n) => /descoberto/.test(n)).length, 0);
});

Deno.test("notasCampanhaRenovacao: fila 0 com ok:true = campanha VAZIA", () => {
  const notas = notasCampanhaRenovacao({ ok: true, clientes_na_fila: 0, sem_telefone: 0 });
  assert(notas.some((n) => /criada VAZIA/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /ninguém para ligar/.test(n)), notas.join(" | "));
});

Deno.test("notasCampanhaRenovacao: repassa quantos estão SEM TELEFONE", () => {
  const notas = notasCampanhaRenovacao({
    ok: true, clientes_na_fila: 12, sem_telefone: 9,
    aviso: "9 de 12 clientes da fila estão SEM TELEFONE cadastrado — a fila é parcialmente inacionável até o import de telefones.",
  });
  assert(notas.some((n) => /SEM TELEFONE/.test(n)), notas.join(" | "));
  const ok = notasCampanhaRenovacao({ ok: true, clientes_na_fila: 5, sem_telefone: 0 });
  assert(ok.some((n) => /todos com telefone/.test(n)), ok.join(" | "));
});

/* ─── Card 13: audiência ──────────────────────────────────────────────────── */

Deno.test("notasPreparoAudiencia: tese não resolvida = lista de documentos INCOMPLETA", () => {
  const notas = notasPreparoAudiencia({
    ok: true, tese_resolvida: false, tese_resolvida_via: null, cliente_vinculado: true,
    documentos_esperados: ["procuracao"], documentos_faltando: ["procuracao"], lembretes: [],
    limitacao: "Documentos = âncora da tese (§24.1) + procuração. A matriz completa por tese (Card 12) segue pendente com o Rodrigo.",
  });
  assert(notas.some((n) => /INCOMPLETO/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /tipo_acao_apelidos/.test(n)), notas.join(" | "));
  // A limitacao é texto FIXO: repassada sempre, nunca usada como sinal.
  assert(notas.some((n) => /matriz completa por tese/.test(n)), notas.join(" | "));
});

Deno.test("notasPreparoAudiencia: limitacao aparece mesmo com a tese resolvida", () => {
  const notas = notasPreparoAudiencia({
    ok: true, tese_resolvida: true, tese_resolvida_via: "apelido", cliente_vinculado: true,
    documentos_faltando: [], lembretes: [{ status: "pendente" }],
    limitacao: "Documentos = âncora da tese (§24.1) + procuração. A matriz completa por tese (Card 12) segue pendente com o Rodrigo.",
  });
  assertEquals(notas.filter((n) => /INCOMPLETO/.test(n)).length, 0);
  assert(notas.some((n) => /matriz completa por tese/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /Todos os documentos esperados/.test(n)), notas.join(" | "));
});

Deno.test("notasPreparoAudiencia: audiência sem cliente cadastrado não conta como falta real", () => {
  const notas = notasPreparoAudiencia({
    ok: true, tese_resolvida: true, cliente_vinculado: false,
    documentos_faltando: ["procuracao", "contrato"], lembretes: [], limitacao: "x",
  });
  assert(notas.some((n) => /não por ausência real/.test(n)), notas.join(" | "));
  assertEquals(notas.filter((n) => /^Faltam 2 documento/.test(n)).length, 0);
});

Deno.test("notasLembreteAudiencia: nao_atendeu MANTÉM a pendência aberta", () => {
  const notas = notasLembreteAudiencia({
    ok: true, status: "nao_atendeu", pendencia_encerrada: false,
    nota: "Pendência permanece aberta para nova tentativa.",
  });
  assert(notas.some((n) => /permanece aberta/.test(n)), notas.join(" | "));
  assert(notas.some((n) => /tentar ligar de novo/.test(n)), notas.join(" | "));
  assertEquals(notas.filter((n) => /Não havia pendência vinculada/.test(n)).length, 0);
});

// `pendencia_encerrada` é DERIVADO do status (e o UPDATE tem WHERE completed_at IS
// NULL), então vem true mesmo quando ZERO linhas foram atualizadas. O chat NÃO pode
// afirmar o fechamento — só relatar o indicador, como a tela já fazia. Antes as duas
// pontas discordavam e a errada era a do chat.
Deno.test("notasLembreteAudiencia: feito RELATA o indicador, não afirma o fechamento", () => {
  const notas = notasLembreteAudiencia({ ok: true, status: "feito", pendencia_encerrada: true, nota: null });
  const texto = notas.join(" | ");
  assert(/indicador/i.test(texto), texto);
  assert(/DERIVADO/i.test(texto), texto);
  // Não pode sair afirmação seca de fato consumado.
  assertEquals(/pendência do lembrete foi encerrada\./.test(texto), false);
  assertEquals(notas.filter((n) => /permanece aberta/.test(n)).length, 0);
});

/* ─── Conferência documental: ok:false que NÃO é falha ────────────────────── */

// Payload verbatim de consultar_documentos_obrigatorios('RMC') sob contexto de
// usuário, lido do banco em 07/08/2026. É o caso que virava "não consultei a
// matriz": ok:false, `motivo` AUSENTE e a lista da tese presente e correta.
const CONFERENCIA_SEM_CLIENTE = {
  ok: false,
  conferencia_completa: false,
  motivo_incompletude: "cliente_nao_vinculado",
  pode_afirmar_suficiencia: false,
  tese: "Cartão consignado RMC/RCC",
  cliente_vinculado: false,
  eixo_tese_matriz: {
    matriz_configurada: true,
    exigidos: ["cpf", "comprovante_residencia", "hiscon", "hiscre", "sentenca_procedente"],
    faltando: [],
  },
  faltando_total: [],
  aviso: "A matriz da tese ESTÁ cadastrada e a lista acima é o que ela exige — mas sem cliente vinculado não há dossiê para conferir. Isto é falta de vínculo, não ausência de documento.",
};

Deno.test("documentos obrigatórios: sem cliente, a lista da tese é ENTREGUE (não é falha)", () => {
  const notas = notasDocumentosObrigatorios(CONFERENCIA_SEM_CLIENTE);
  const texto = notas.join(" | ");
  // Tem de afirmar que a matriz está cadastrada e quantos documentos a tese exige.
  assert(/matriz desta tese ESTÁ cadastrada/.test(texto), texto);
  assert(/5 documento\(s\)/.test(texto), texto);
  // E tem de dizer que NADA foi conferido contra dossiê — sem cliente não há dossiê.
  assert(/NADA foi conferido contra dossiê/.test(texto), texto);
  // O aviso autoritativo do banco é repassado.
  assert(/falta de vínculo, não ausência de documento/.test(texto), texto);
});

Deno.test("documentos obrigatórios: matriz não cadastrada proíbe afirmar suficiência", () => {
  const notas = notasDocumentosObrigatorios({
    ok: false, conferencia_completa: false,
    motivo_incompletude: "matriz_da_tese_nao_cadastrada",
    eixo_tese_matriz: { matriz_configurada: false, exigidos: [] },
    faltando_total: [],
  });
  const texto = notas.join(" | ");
  assert(/NÃO está cadastrada/.test(texto), texto);
  assert(/NÃO é o kit completo/.test(texto), texto);
});

Deno.test("documentos obrigatórios: sem tese, conferiu só o set do cliente", () => {
  const notas = notasDocumentosObrigatorios({
    ok: false, conferencia_completa: false, motivo_incompletude: "tese_nao_informada",
    faltando_total: ["cpf"],
  });
  assert(/APENAS o set obrigatório do tipo de cliente/.test(notas.join(" | ")), notas.join(" | "));
});

Deno.test("documentos obrigatórios: conferência completa lista o que falta", () => {
  const notas = notasDocumentosObrigatorios({
    ok: false, conferencia_completa: true, motivo_incompletude: "incompleta",
    faltando_total: ["hiscon", "hiscre"],
  });
  const texto = notas.join(" | ");
  assert(/faltam 2 documento\(s\)/.test(texto), texto);
  assert(/hiscon, hiscre/.test(texto), texto);
});

Deno.test("documentos obrigatórios: nada falta é dito como tal", () => {
  const notas = notasDocumentosObrigatorios({
    ok: true, conferencia_completa: true, motivo_incompletude: null, faltando_total: [],
  });
  assert(/nada falta no dossiê/.test(notas.join(" | ")), notas.join(" | "));
});
