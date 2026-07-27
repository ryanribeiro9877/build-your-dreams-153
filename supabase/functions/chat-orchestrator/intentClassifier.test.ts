import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type IntentCategory, mentionsAttachments, normalizeIntent, routePathFor, shouldClassify,
  isAwaitingCollectionMeta, isCollectionEscape, isErrorMeta, findActiveCollection,
  isCollectionContinuation, isCadastroClienteRequest, isTarefaChatRequest,
  isDocChecklistRequest, isPecaExplicitRequest, normalizeRouteObject,
  isOndaAcaoRequest, isAceiteAtualizarProcesso, isRecusaAbrirOutro,
} from "./intentClassifier.ts";

// ─── LLM-first: parsing do classificador de objeto ───────────────────────────
Deno.test("normalizeRouteObject: mapeia categorias e cai em OUTRO no desconhecido", () => {
  assertEquals(normalizeRouteObject("CADASTRO"), "CADASTRO");
  assertEquals(normalizeRouteObject("cadastro"), "CADASTRO");
  assertEquals(normalizeRouteObject("AGENDA_CLIENTE"), "AGENDA_CLIENTE");
  assertEquals(normalizeRouteObject("agenda"), "AGENDA_CLIENTE");
  assertEquals(normalizeRouteObject("Tarefa_Interna"), "TAREFA_INTERNA");
  assertEquals(normalizeRouteObject("tarefa"), "TAREFA_INTERNA");
  assertEquals(normalizeRouteObject("OUTRO"), "OUTRO");
  assertEquals(normalizeRouteObject("peça jurídica"), "OUTRO");
  assertEquals(normalizeRouteObject(null), "OUTRO");
  assertEquals(normalizeRouteObject(undefined), "OUTRO");
});

// ─── B1 (E2E 24/07): objetos das Ondas 1-3 ────────────────────────────────────
Deno.test("normalizeRouteObject: objetos das Ondas 1-3 + sinônimos do LLM", () => {
  assertEquals(normalizeRouteObject("PROCESSO_CREATE"), "PROCESSO_CREATE");
  assertEquals(normalizeRouteObject("processo"), "PROCESSO_CREATE");
  assertEquals(normalizeRouteObject("PROCESSO_UPDATE"), "PROCESSO_UPDATE");
  assertEquals(normalizeRouteObject("andamento"), "PROCESSO_UPDATE");
  assertEquals(normalizeRouteObject("KIT_DOCUMENTAL"), "KIT_DOCUMENTAL");
  assertEquals(normalizeRouteObject("documentos"), "KIT_DOCUMENTAL");
  assertEquals(normalizeRouteObject("RESUMO_DIA"), "RESUMO_DIA");
  assertEquals(normalizeRouteObject("resumo"), "RESUMO_DIA");
  assertEquals(normalizeRouteObject("PROTOCOLO"), "PROTOCOLO");
  assertEquals(normalizeRouteObject("TAREFA_UPDATE"), "TAREFA_UPDATE");
  assertEquals(normalizeRouteObject("CLIENTE_UPDATE"), "CLIENTE_UPDATE");
  assertEquals(normalizeRouteObject("AGENDA_CONSULTA"), "AGENDA_CONSULTA");
  assertEquals(normalizeRouteObject("AGENDA_UPDATE"), "AGENDA_UPDATE");
  assertEquals(normalizeRouteObject("AUDIENCIA"), "AUDIENCIA");
  assertEquals(normalizeRouteObject("PERMISSAO_MENU"), "PERMISSAO_MENU");
  assertEquals(normalizeRouteObject("menu"), "PERMISSAO_MENU");
  // TAREFA_UPDATE não pode ser confundido com TAREFA (criar)
  assertEquals(normalizeRouteObject("tarefa"), "TAREFA_INTERNA");
});

// As 5 frases que erraram no E2E precisam ACIONAR o classificador de objeto
// (antes elas não casavam hint nenhum e nunca chegavam nele).
Deno.test("isOndaAcaoRequest: as 5 frases do E2E acionam a classificação", () => {
  assertEquals(isOndaAcaoRequest("abre um processo pro cliente Adalberto, tipo indenizatório, réu Agibank"), true);
  assertEquals(isOndaAcaoRequest("gera os documentos do cliente Adalberto"), true);
  assertEquals(isOndaAcaoRequest("me dá o resumo do meu dia"), true);
  assertEquals(isOndaAcaoRequest("cadastre uma pendência de procuração pro cliente X para sexta"), true);
  assertEquals(isOndaAcaoRequest("protocola a peça do cliente Adalberto"), true);
});

Deno.test("isOndaAcaoRequest: outras ações das ondas também acionam", () => {
  assertEquals(isOndaAcaoRequest("registra no processo do Adalberto que a contestação foi protocolada"), true);
  assertEquals(isOndaAcaoRequest("passa a pendência da procuração pra em andamento"), true);
  assertEquals(isOndaAcaoRequest("comenta no card do Adalberto que o cliente confirmou"), true);
  assertEquals(isOndaAcaoRequest("reagenda o atendimento do Adalberto para sexta 9h"), true);
  assertEquals(isOndaAcaoRequest("marca a audiência do processo do Adalberto para 12/08 às 10h"), true);
  assertEquals(isOndaAcaoRequest("dá acesso ao Kanban para a Kailane"), true);
  assertEquals(isOndaAcaoRequest("quais audiências dessa semana?"), true);
  assertEquals(isOndaAcaoRequest("o que eu tenho na agenda amanhã?"), true);
});

// Reteste 27/07: estas frases-âncora de PANORAMA PESSOAL não acionavam o
// classificador (faltava alvo "hoje/semana/situação/pendente" e verbo de ESTADO
// "como/está/tenho"), então "me dá o resumo do meu dia" morria em TRIVIAL.
Deno.test("isOndaAcaoRequest: panorama pessoal (todas as frases-âncora do briefing)", () => {
  assertEquals(isOndaAcaoRequest("me dá o resumo do meu dia"), true);
  assertEquals(isOndaAcaoRequest("como está meu dia"), true);
  assertEquals(isOndaAcaoRequest("como está meu dia?"), true);
  assertEquals(isOndaAcaoRequest("o que eu tenho pra hoje"), true);
  assertEquals(isOndaAcaoRequest("minha situação hoje"), true);
  assertEquals(isOndaAcaoRequest("o que está pendente pra mim hoje"), true);
  assertEquals(isOndaAcaoRequest("como está minha semana"), true);
  assertEquals(isOndaAcaoRequest("quais meus compromissos de hoje?"), true);
});

// Reteste 27/07: "protocola a peça do cliente X" caía em NEGOCIO_SEM_INSUMO
// (questionário de peça). O hint precisa acionar a classificação nas variações.
Deno.test("isOndaAcaoRequest: protocolar em suas variações", () => {
  assertEquals(isOndaAcaoRequest("protocola a peça do [TESTE] CLIENTE E2E ONDAS"), true);
  assertEquals(isOndaAcaoRequest("protocola a inicial do Adalberto"), true);
  assertEquals(isOndaAcaoRequest("já protocolei a peça da Maria"), true);
  assertEquals(isOndaAcaoRequest("conclui o protocolo do Adalberto"), true);
});

Deno.test("isOndaAcaoRequest: conversa e frases sem objeto do domínio → false", () => {
  assertEquals(isOndaAcaoRequest(""), false);
  assertEquals(isOndaAcaoRequest("bom dia!"), false);
  assertEquals(isOndaAcaoRequest("obrigado, era só isso"), false);
  assertEquals(isOndaAcaoRequest("quem é você?"), false);
  // fala com substantivo do domínio mas SEM verbo de pedido → não aciona
  assertEquals(isOndaAcaoRequest("o processo é muito importante para o cliente"), false);
});

// ─── #2: exceção "pedido de peça explícito" do atalho doc-identidade→cadastro ──
Deno.test("isPecaExplicitRequest: pedidos claros de peça → true", () => {
  assertEquals(isPecaExplicitRequest("gere a petição inicial com base neste RG"), true);
  assertEquals(isPecaExplicitRequest("faça uma contestação"), true);
  assertEquals(isPecaExplicitRequest("redija o contrato de honorários"), true);
  assertEquals(isPecaExplicitRequest("elabore um recurso de apelação"), true);
  assertEquals(isPecaExplicitRequest("monte a procuração"), true);
});

Deno.test("isPecaExplicitRequest: anexar documento sem pedir peça → false", () => {
  assertEquals(isPecaExplicitRequest("segue o RG do cliente"), false);
  assertEquals(isPecaExplicitRequest("esse é o documento de identidade dele"), false);
  assertEquals(isPecaExplicitRequest("cadastra esse cliente"), false);
  assertEquals(isPecaExplicitRequest("aqui está o RG"), false);
  assertEquals(isPecaExplicitRequest(""), false);
});

// ─── CADASTRO-MODELO-A: disparo do formulário (isCadastroClienteRequest) ──────
Deno.test("isCadastroClienteRequest: pedidos de cadastro → true", () => {
  assertEquals(isCadastroClienteRequest("quero cadastrar um cliente"), true);
  assertEquals(isCadastroClienteRequest("cadastrar cliente"), true);
  assertEquals(isCadastroClienteRequest("cadastro de cliente novo"), true);
  assertEquals(isCadastroClienteRequest("adicionar um novo cliente"), true);
  assertEquals(isCadastroClienteRequest("registrar cliente"), true);
});
Deno.test("isCadastroClienteRequest: consultas/leituras de cliente → false", () => {
  assertEquals(isCadastroClienteRequest("consulte o CPF do cliente Fulano"), false);
  assertEquals(isCadastroClienteRequest("busque o cliente João"), false);
  assertEquals(isCadastroClienteRequest("quais os dados do cliente X"), false);
  assertEquals(isCadastroClienteRequest("mostre o cliente Maria"), false);
  assertEquals(isCadastroClienteRequest("qual o telefone do cliente Y"), false);
});
Deno.test("isCadastroClienteRequest: sem alvo cliente / vazio → false", () => {
  assertEquals(isCadastroClienteRequest("crie uma tarefa"), false);
  assertEquals(isCadastroClienteRequest("gere uma petição"), false);
  assertEquals(isCadastroClienteRequest(""), false);
  assertEquals(isCadastroClienteRequest("bom dia"), false);
});
// TRILHA-A defeito: "tarefa … cliente" era roteado para cadastro. Intenção de
// tarefa TEM PRECEDÊNCIA sobre cadastro, MESMO com a palavra "cliente" na frase.
Deno.test("isCadastroClienteRequest: intenção de tarefa vence cadastro (mesmo com 'cliente')", () => {
  assertEquals(isCadastroClienteRequest("cria uma tarefa pra eu ligar pro cliente João amanhã 10h"), false);
  assertEquals(isCadastroClienteRequest("me lembra de ligar pro cliente Maria amanhã"), false);
  assertEquals(isCadastroClienteRequest("agenda uma tarefa de revisão pro cliente X na sexta"), false);
});
// Contraprova: cadastro genuíno (com "cliente") NÃO regride — segue disparando o form.
Deno.test("isCadastroClienteRequest: cadastro genuíno com 'cliente' continua true", () => {
  assertEquals(isCadastroClienteRequest("cadastra o cliente João da Silva"), true);
  assertEquals(isCadastroClienteRequest("adiciona o cliente novo"), true);
});

// ─── TAREFA-CHAT (card 4.1): disparo do cartão de confirmação (isTarefaChatRequest) ──
Deno.test("isTarefaChatRequest: cria tarefa explícita", () => {
  assertEquals(isTarefaChatRequest("cria uma tarefa pra eu ligar pro João amanhã 10h"), true);
});
Deno.test("isTarefaChatRequest: agendar/lembrete", () => {
  assertEquals(isTarefaChatRequest("me lembra de enviar o contrato até sexta"), true);
  assertEquals(isTarefaChatRequest("agenda uma tarefa de revisão pra segunda"), true);
});
Deno.test("isTarefaChatRequest: NÃO confunde com cadastro de cliente", () => {
  assertEquals(isTarefaChatRequest("cadastrar cliente João da Silva"), false);
});
Deno.test("isTarefaChatRequest: NÃO confunde com consulta", () => {
  assertEquals(isTarefaChatRequest("quais as tarefas do time hoje?"), false);
  assertEquals(isTarefaChatRequest("mostra as tarefas atrasadas"), false);
});

// ─── DOC-CHECKLIST (card 6.3): precedência sobre CADASTRO (isDocChecklistRequest) ──
const BUG_FRASE = "Para o cliente Joao Teste da Silva, registre a pendência dos documentos: RG, comprovante de residência e extrato do empréstimo.";
Deno.test("DOC-CHECKLIST: a frase que abriu o cadastro indevidamente NÃO é mais cadastro", () => {
  // Regressão do bug reproduzido em produção: "cliente" + "registre" casava
  // CADASTRO_ALVO+VERBO e abria o form; agora o guard de checklist barra.
  assertEquals(isCadastroClienteRequest(BUG_FRASE), false);
  assertEquals(isDocChecklistRequest(BUG_FRASE), true);
});
Deno.test("DOC-CHECKLIST: cadastro genuíno segue funcionando (não regride)", () => {
  assertEquals(isCadastroClienteRequest("cadastra o cliente João Silva"), true);
  assertEquals(isCadastroClienteRequest("quero cadastrar um cliente"), true);
  assertEquals(isCadastroClienteRequest("novo cliente pessoa física"), true);
  assertEquals(isDocChecklistRequest("cadastra o cliente João Silva"), false);
});
Deno.test("DOC-CHECKLIST: consulta de documentos NÃO é checklist", () => {
  assertEquals(isDocChecklistRequest("quais os documentos do cliente X?"), false);
});
Deno.test("DOC-CHECKLIST: tarefa segue intacta (precedência de tarefa preservada)", () => {
  assertEquals(isCadastroClienteRequest("cria uma tarefa pra ligar pro cliente amanhã às 9h"), false);
  assertEquals(isTarefaChatRequest("cria uma tarefa pra ligar pro cliente amanhã às 9h"), true);
  assertEquals(isDocChecklistRequest("cria uma tarefa pra ligar pro cliente amanhã às 9h"), false);
});
Deno.test("DOC-CHECKLIST: variações de checklist escapam do cadastro", () => {
  assertEquals(isCadastroClienteRequest("Monte a checklist de documentos do atendimento do cliente Y"), false);
  assertEquals(isCadastroClienteRequest("solicite os documentos RG e comprovante do cliente Z"), false);
});

// ─── normalizeIntent: assimetria dupla (default seguro = NEGOCIO_COM_INSUMO) ──
Deno.test("normalizeIntent: TRIVIAL explícito", () => {
  assertEquals(normalizeIntent("TRIVIAL"), "TRIVIAL");
  assertEquals(normalizeIntent(" trivial "), "TRIVIAL");
});
Deno.test("normalizeIntent: SEM_INSUMO explícito (variações)", () => {
  assertEquals(normalizeIntent("NEGOCIO_SEM_INSUMO"), "NEGOCIO_SEM_INSUMO");
  assertEquals(normalizeIntent("negócio_sem_insumo"), "NEGOCIO_SEM_INSUMO");
  assertEquals(normalizeIntent("SEM_INSUMO"), "NEGOCIO_SEM_INSUMO");
});
Deno.test("normalizeIntent: COM_INSUMO explícito", () => {
  assertEquals(normalizeIntent("NEGOCIO_COM_INSUMO"), "NEGOCIO_COM_INSUMO");
});
Deno.test("normalizeIntent: CONSULTA explícito (AGT-CONSULTA)", () => {
  assertEquals(normalizeIntent("CONSULTA"), "CONSULTA");
  assertEquals(normalizeIntent(" consulta "), "CONSULTA");
});
Deno.test("normalizeIntent: ACAO_COM_TOOL explícito (variações + acento)", () => {
  assertEquals(normalizeIntent("ACAO_COM_TOOL"), "ACAO_COM_TOOL");
  assertEquals(normalizeIntent("AÇÃO_COM_TOOL"), "ACAO_COM_TOOL");
  assertEquals(normalizeIntent(" acao "), "ACAO_COM_TOOL");
  assertEquals(normalizeIntent("AÇÃO"), "ACAO_COM_TOOL");
});
Deno.test("normalizeIntent: desconhecido/vazio/nulo → COM_INSUMO (gerar; nunca TRIVIAL nem bloqueio)", () => {
  const casos: (string | null | undefined)[] = ["", null, undefined, "talvez", "INCERTO", "NEGOCIO", "{quebrado"];
  for (const c of casos) {
    const r: IntentCategory = normalizeIntent(c);
    assertEquals(r, "NEGOCIO_COM_INSUMO");
  }
});

// ─── routePathFor: mapeamento categoria → caminho de auditoria ───────────────
// CONSULTA mantém "consulta" (loop de leitura síncrono no START, preservado);
// ACAO_COM_TOOL vai por "full" (cadeia com N3+tools, caminho curto no processStep).
Deno.test("routePathFor: cada categoria tem seu caminho", () => {
  assertEquals(routePathFor("TRIVIAL"), "fast");
  assertEquals(routePathFor("CONSULTA"), "consulta");
  assertEquals(routePathFor("NEGOCIO_SEM_INSUMO"), "need_info");
  assertEquals(routePathFor("NEGOCIO_COM_INSUMO"), "full");
  assertEquals(routePathFor("ACAO_COM_TOOL"), "full");
});

// ─── mentionsAttachments: marcador de anexos do front ────────────────────────
Deno.test("mentionsAttachments: detecta marcador de anexos", () => {
  assertEquals(mentionsAttachments("gere uma peça [Arquivos: foto.png]"), true);
  assertEquals(mentionsAttachments("[Arquivo: contrato.pdf]"), true);
  assertEquals(mentionsAttachments("oi, tudo bem?"), false);
});

// ─── shouldClassify: só libera a chamada do classificador ────────────────────
Deno.test("shouldClassify: mensagem normal é classificável", () => {
  assertEquals(shouldClassify("gere uma peça", { enabled: true, maxChars: 500 }), true);
});
Deno.test("shouldClassify: flag OFF nunca classifica (→ cadeia completa)", () => {
  assertEquals(shouldClassify("oi", { enabled: false, maxChars: 500 }), false);
});
Deno.test("shouldClassify: vazio não é classificável", () => {
  assertEquals(shouldClassify("   ", { enabled: true, maxChars: 500 }), false);
});
Deno.test("shouldClassify: mensagem longa vai direto à cadeia completa (gerar)", () => {
  assertEquals(shouldClassify("a".repeat(600), { enabled: true, maxChars: 500 }), false);
});

// ─── CHAT-COLETA-CONTINUIDADE: detecção de coleta ativa ──────────────────────
Deno.test("isAwaitingCollectionMeta: pergunta de coleta (final + ACAO_COM_TOOL) = true", () => {
  assertEquals(isAwaitingCollectionMeta({ kind: "final", intent: "ACAO_COM_TOOL", agent_name: "Especialista Cadastro ProJuris" }), true);
});
Deno.test("isAwaitingCollectionMeta: ActionCard/execução concluída NÃO são coleta ativa", () => {
  // action_proposal (aguardando clique) e action_done (executado) não têm intent.
  assertEquals(isAwaitingCollectionMeta({ kind: "action_proposal", proposal: {} }), false);
  assertEquals(isAwaitingCollectionMeta({ kind: "action_done", ok: true }), false);
});
Deno.test("isAwaitingCollectionMeta: outros finais/stages/nulos = false", () => {
  assertEquals(isAwaitingCollectionMeta({ kind: "final", intent: "CONSULTA" }), false);
  assertEquals(isAwaitingCollectionMeta({ kind: "final", path: "full", intent: "NEGOCIO_COM_INSUMO" }), false);
  assertEquals(isAwaitingCollectionMeta({ kind: "stage", stage: "executing_n3" }), false);
  assertEquals(isAwaitingCollectionMeta(null), false);
  assertEquals(isAwaitingCollectionMeta(undefined), false);
  assertEquals(isAwaitingCollectionMeta("final"), false);
});

// ─── CHAT-COLETA-CONTINUIDADE: escape hatch conservador ──────────────────────
Deno.test("isCollectionEscape: respostas de coleta NÃO são escape (default continuar)", () => {
  for (const m of ["física", "jurídica", "Ryan Ribeiro", "111.222.333-44", "30130-000", "Rua das Flores", "não tem", "sem complemento", "meu@email.com"]) {
    assertEquals(isCollectionEscape(m), false, `"${m}" não deveria ser escape`);
  }
});
Deno.test("isCollectionEscape: abandono explícito = escape", () => {
  for (const m of ["cancela", "pode cancelar", "cancelar", "deixa pra depois", "deixa para amanhã", "esquece isso", "muda de assunto"]) {
    assertEquals(isCollectionEscape(m), true, `"${m}" deveria ser escape`);
  }
});
Deno.test("isCollectionEscape: início claro de outra ação/peça = escape", () => {
  assertEquals(isCollectionEscape("gere uma petição inicial"), true);
  assertEquals(isCollectionEscape("redija uma contestação"), true);
  assertEquals(isCollectionEscape("faça uma procuração"), true);
});

// ─── CHAT-COLETA-CONTINUIDADE-FIX: robustez a erro transitório do provedor ───
const COLLECT_Q = { agent_id: "spec-1", metadata: { kind: "final", intent: "ACAO_COM_TOOL", agent_name: "Especialista Cadastro ProJuris" } };
const ERR = { agent_id: "spec-1", metadata: { kind: "error", error: "openrouter 451" } };

Deno.test("isErrorMeta: só metadata.kind='error'", () => {
  assertEquals(isErrorMeta({ kind: "error", error: "x" }), true);
  assertEquals(isErrorMeta({ kind: "final", intent: "ACAO_COM_TOOL" }), false);
  assertEquals(isErrorMeta(null), false);
});

Deno.test("findActiveCollection: última msg é a pergunta de coleta → continua", () => {
  assertEquals(findActiveCollection([COLLECT_Q]), { agentId: "spec-1" });
});

Deno.test("findActiveCollection: bolha de erro (451) ANTES da pergunta → PULA erro e continua", () => {
  // Mais recente primeiro: erro transitório do provedor, depois a pergunta de coleta.
  assertEquals(findActiveCollection([ERR, COLLECT_Q]), { agentId: "spec-1" });
  // Vários erros seguidos também são pulados.
  assertEquals(findActiveCollection([ERR, ERR, COLLECT_Q]), { agentId: "spec-1" });
});

Deno.test("findActiveCollection: último turno real NÃO é coleta → não continua", () => {
  assertEquals(findActiveCollection([{ agent_id: "a", metadata: { kind: "final", intent: "CONSULTA" } }]), null);
  // ActionCard/execução encerram a coleta (não são erro, são turno real):
  assertEquals(findActiveCollection([{ agent_id: "a", metadata: { kind: "action_done", ok: true } }, COLLECT_Q]), null);
  assertEquals(findActiveCollection([{ agent_id: "a", metadata: { kind: "action_proposal", proposal: {} } }, COLLECT_Q]), null);
});

Deno.test("findActiveCollection: vazio / só erros → null", () => {
  assertEquals(findActiveCollection([]), null);
  assertEquals(findActiveCollection([ERR, ERR]), null);
});

// ─── CHAT-COLETA-CONTINUIDADE: detecção de turno de continuação de coleta ────
Deno.test("isCollectionContinuation: chain de continuação → true", () => {
  assertEquals(isCollectionContinuation([
    { level: 0, path: "continuacao_coleta", intent: "ACAO_COM_TOOL", agent: "Especialista Cadastro ProJuris", resumed: true },
  ]), true);
});

Deno.test("isCollectionContinuation: chain de cadeia completa (N1/N2/N3) → false", () => {
  assertEquals(isCollectionContinuation([
    { level: 1, agent: "Meu Assistente" },
    { level: 2, agent: "Diretor de Área" },
    { level: 3, agent: "Especialista Cadastro ProJuris" },
  ]), false);
});

Deno.test("isCollectionContinuation: vazio / null / não-array → false", () => {
  assertEquals(isCollectionContinuation([]), false);
  assertEquals(isCollectionContinuation(null), false);
  assertEquals(isCollectionContinuation(undefined), false);
  assertEquals(isCollectionContinuation("continuacao_coleta"), false);
  assertEquals(isCollectionContinuation([{ level: 0 }]), false);
});

// ─── A6.3 (reteste v170): aceite da oferta de atualizar o processo ─────────────
// O aviso de duplicata oferece atualizar o processo existente; responder "sim,
// atualiza" perdia o contexto e o agente repergunta va qual processo era.
Deno.test("isAceiteAtualizarProcesso: aceites curtos → true", () => {
  assertEquals(isAceiteAtualizarProcesso("sim, atualiza"), true);
  assertEquals(isAceiteAtualizarProcesso("sim"), true);
  assertEquals(isAceiteAtualizarProcesso("isso mesmo"), true);
  assertEquals(isAceiteAtualizarProcesso("pode atualizar"), true);
  assertEquals(isAceiteAtualizarProcesso("atualiza esse mesmo"), true);
  assertEquals(isAceiteAtualizarProcesso("ok, registra o andamento"), true);
  assertEquals(isAceiteAtualizarProcesso("por favor"), true);
});

Deno.test("isAceiteAtualizarProcesso: recusa/insistência → false (segue como novo)", () => {
  assertEquals(isAceiteAtualizarProcesso("não, abre outro"), false);
  assertEquals(isAceiteAtualizarProcesso("nao"), false);
  assertEquals(isAceiteAtualizarProcesso("é outro contrato, abre mesmo assim"), false);
  assertEquals(isAceiteAtualizarProcesso("quero um novo processo"), false);
});

Deno.test("isAceiteAtualizarProcesso: vazio e pedido longo → false", () => {
  assertEquals(isAceiteAtualizarProcesso(""), false);
  // pedido novo e longo não é aceite, mesmo contendo "registra"
  assertEquals(isAceiteAtualizarProcesso(
    "registra no processo do Adalberto que a contestação foi protocolada hoje e depois me diga como ficou o prazo da audiência que estava marcada para a semana que vem"
  ), false);
});

// ─── Reteste 3 (item 2): recusa da oferta = override com contexto ─────────────
Deno.test("isRecusaAbrirOutro: recusas explícitas → true", () => {
  assertEquals(isRecusaAbrirOutro("não, abre outro"), true);
  assertEquals(isRecusaAbrirOutro("nao, abre outro"), true);
  assertEquals(isRecusaAbrirOutro("é outro contrato, abre mesmo assim"), true);
  assertEquals(isRecusaAbrirOutro("quero um novo processo"), true);
});

Deno.test("isRecusaAbrirOutro: aceite e vazio → false", () => {
  assertEquals(isRecusaAbrirOutro("sim, atualiza"), false);
  assertEquals(isRecusaAbrirOutro("pode atualizar"), false);
  assertEquals(isRecusaAbrirOutro(""), false);
});

// Aceite e recusa são mutuamente exclusivos — nunca ambíguos no mesmo texto.
Deno.test("aceite × recusa: nunca os dois ao mesmo tempo", () => {
  for (const f of ["sim, atualiza", "não, abre outro", "pode atualizar", "quero um novo processo", "ok"]) {
    assertEquals(isAceiteAtualizarProcesso(f) && isRecusaAbrirOutro(f), false);
  }
});
