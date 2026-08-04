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

// ─── CREDENCIAL_GOV (pacote de 27/07 · tool registrar_credencial_gov) ─────────
// Estas frases não têm verbo de ação ("a senha dele É X"), então precisam de um
// padrão próprio — sem colocar "é" no verbo genérico, que faria "o processo é
// importante" acionar o classificador.
Deno.test("isOndaAcaoRequest: frases de credencial GOV acionam a classificação", () => {
  assertEquals(isOndaAcaoRequest("a senha do gov dele é Abc123@"), true);
  assertEquals(isOndaAcaoRequest("guarda a senha do INSS da Maria: Abc123@"), true);
  assertEquals(isOndaAcaoRequest("senha do gov: Abc123@, conta bronze"), true);
  assertEquals(isOndaAcaoRequest("a senha dele é Abc123@"), true);
  assertEquals(isOndaAcaoRequest("anota a credencial do gov.br dele"), true);
  assertEquals(isOndaAcaoRequest("a conta dela é bronze"), true);
  assertEquals(isOndaAcaoRequest("essa senha do gov não funciona mais"), true);
  // pedido COMPOSTO (cadastro + credencial) também precisa acionar
  assertEquals(isOndaAcaoRequest("inclua o telefone 71988887777 e a senha do gov Abc123@"), true);
});

Deno.test("normalizeRouteObject: CREDENCIAL_GOV e sinônimos", () => {
  assertEquals(normalizeRouteObject("CREDENCIAL_GOV"), "CREDENCIAL_GOV");
  assertEquals(normalizeRouteObject("credencial"), "CREDENCIAL_GOV");
  assertEquals(normalizeRouteObject("SENHA_GOV"), "CREDENCIAL_GOV");
  // não confundir com permissão de menu de colaborador
  assertEquals(normalizeRouteObject("PERMISSAO_MENU"), "PERMISSAO_MENU");
});

Deno.test("isOndaAcaoRequest: 'é' não virou gatilho genérico (anti-regressão)", () => {
  assertEquals(isOndaAcaoRequest("o processo é muito importante para o cliente"), false);
  assertEquals(isOndaAcaoRequest("esse cliente é antigo"), false);
});

// ─── Motor 1 · Cards 3/4/5 (28/07): banco, campanha, ligação, KPI, áudio ──────
// As frases do aceite têm de ACIONAR o classificador de objeto. Várias não têm
// verbo de ação ("ele recebe no Bradesco", "liguei para a dona Maria"), por isso há
// padrões próprios — mesmo motivo do CREDENCIAL_GOV.
Deno.test("isOndaAcaoRequest: relação bancária (Card 3)", () => {
  assertEquals(isOndaAcaoRequest("a dona Antonieta recebe no Agibank e tem consignado com o Agibank"), true);
  assertEquals(isOndaAcaoRequest("ele recebe no Bradesco"), true);
  assertEquals(isOndaAcaoRequest("já temos o extrato do Bradesco de 2025"), true);
  assertEquals(isOndaAcaoRequest("o cliente trouxe o contrato do BMG"), true);
  assertEquals(isOndaAcaoRequest("ele não reconhece esse cartão consignado"), true);
});

Deno.test("isOndaAcaoRequest: campanha (Card 4)", () => {
  assertEquals(isOndaAcaoRequest("cria uma campanha para ligar para todos os clientes que recebem no Bradesco, para pedir o extrato"), true);
  assertEquals(isOndaAcaoRequest("quero ligar para quem tem consignado com o Agibank"), true);
  assertEquals(isOndaAcaoRequest("monta uma fila de ligação dos clientes bronze"), true);
});

Deno.test("isOndaAcaoRequest: ligação registrada (Card 4)", () => {
  assertEquals(isOndaAcaoRequest("liguei para a dona Maria, não atendeu"), true);
  assertEquals(isOndaAcaoRequest("falei com o Sr. João, pediu retorno amanhã às 10"), true);
  assertEquals(isOndaAcaoRequest("número errado da Antonieta"), true);
  assertEquals(isOndaAcaoRequest("caiu na caixa postal"), true);
});

Deno.test("isOndaAcaoRequest: KPI de ligações (Card 4)", () => {
  assertEquals(isOndaAcaoRequest("quantas ligações fizemos hoje?"), true);
  assertEquals(isOndaAcaoRequest("como está a campanha do Bradesco?"), true);
  assertEquals(isOndaAcaoRequest("produtividade da recepção esta semana"), true);
});

Deno.test("isOndaAcaoRequest: áudio de autorização (Card 5)", () => {
  assertEquals(isOndaAcaoRequest("esse áudio é a autorização da dona Maria"), true);
  assertEquals(isOndaAcaoRequest("anexa a gravação da autorização do Ivan"), true);
  assertEquals(isOndaAcaoRequest("segue o áudio dele autorizando o escritório"), true);
});

Deno.test("normalizeRouteObject: objetos do Motor 1 + sinônimos", () => {
  assertEquals(normalizeRouteObject("RELACAO_BANCARIA"), "RELACAO_BANCARIA");
  assertEquals(normalizeRouteObject("banco"), "RELACAO_BANCARIA");
  assertEquals(normalizeRouteObject("CAMPANHA"), "CAMPANHA");
  assertEquals(normalizeRouteObject("LIGACAO"), "LIGACAO");
  assertEquals(normalizeRouteObject("chamada"), "LIGACAO");
  assertEquals(normalizeRouteObject("KPI_LIGACOES"), "KPI_LIGACOES");
  assertEquals(normalizeRouteObject("kpi"), "KPI_LIGACOES");
  assertEquals(normalizeRouteObject("AUDIO_AUTORIZACAO"), "AUDIO_AUTORIZACAO");
  assertEquals(normalizeRouteObject("autorizacao"), "AUDIO_AUTORIZACAO");
});

// Anti-regressão: conversa e as frases antigas seguem como antes.
Deno.test("isOndaAcaoRequest: Motor 1 não criou gatilho amplo demais", () => {
  assertEquals(isOndaAcaoRequest("bom dia, tudo bem?"), false);
  assertEquals(isOndaAcaoRequest("obrigado!"), false);
  assertEquals(isOndaAcaoRequest("esse cliente é antigo"), false);
});

// GOTCHA pt-BR (28/07): `\w` é ASCII, então `coment\w*` casa só "coment" e o
// lookahead (?![\wÀ-ÿ]) REJEITA por causa do "á" de "comentário" — a frase inteira
// deixava de acionar o classificador. Em cauda de palavra use [\wÀ-ÿ]*.
Deno.test("isOndaAcaoRequest: palavras com CAUDA ACENTUADA acionam", () => {
  assertEquals(isOndaAcaoRequest("coloca um comentário no card do Adalberto"), true);
  assertEquals(isOndaAcaoRequest("faz a atualização do processo do Ivan"), true);
  assertEquals(isOndaAcaoRequest("monta uma fila de ligação dos clientes bronze"), true);
  assertEquals(isOndaAcaoRequest("quantas ligações fizemos hoje?"), true);
  assertEquals(isOndaAcaoRequest("esse áudio é a autorização da dona Maria"), true);
  assertEquals(isOndaAcaoRequest("anexa a gravação da autorização do Ivan"), true);
});

/* ══ Motores 2 e 3 (Cards 6/7/8/9/10) ══════════════════════════════════════ */

Deno.test("normalizeRouteObject: objetos dos Motores 2 e 3 + sinônimos", () => {
  assertEquals(normalizeRouteObject("RECLAMACAO_ADMIN"), "RECLAMACAO_ADMIN");
  assertEquals(normalizeRouteObject("reclamação"), "RECLAMACAO_ADMIN");
  assertEquals(normalizeRouteObject("RECLAMACAO_RESPOSTA"), "RECLAMACAO_RESPOSTA");
  assertEquals(normalizeRouteObject("RECLAMACAO_CONSULTA"), "RECLAMACAO_CONSULTA");
  assertEquals(normalizeRouteObject("EXECUCAO_INICIAR"), "EXECUCAO_INICIAR");
  assertEquals(normalizeRouteObject("execução"), "EXECUCAO_INICIAR");
  assertEquals(normalizeRouteObject("EXECUCAO_FASE"), "EXECUCAO_FASE");
  assertEquals(normalizeRouteObject("EXECUCAO_CONSULTA"), "EXECUCAO_CONSULTA");
  assertEquals(normalizeRouteObject("EXECUCAO_REVISAO"), "EXECUCAO_REVISAO");
  assertEquals(normalizeRouteObject("tickler"), "EXECUCAO_REVISAO");
  assertEquals(normalizeRouteObject("EVENTO_PROCESSUAL"), "EVENTO_PROCESSUAL");
  assertEquals(normalizeRouteObject("sentença"), "EVENTO_PROCESSUAL");
  assertEquals(normalizeRouteObject("FILA_GOV"), "FILA_GOV");
  assertEquals(normalizeRouteObject("CREDENCIAL_GOV_STATUS"), "CREDENCIAL_GOV_STATUS");
  assertEquals(normalizeRouteObject("CONVERSAO_GOV"), "CONVERSAO_GOV");
  // CREDENCIAL_GOV (guardar senha no cofre) NÃO virou status por engano.
  assertEquals(normalizeRouteObject("CREDENCIAL_GOV"), "CREDENCIAL_GOV");
});

// As frases são as dos ACEITES do briefing de 29/07, ao pé da letra: se o hint
// não casar, o classificador de objeto nem é chamado e o pedido cai no fluxo
// genérico (foi essa a causa-raiz do A6 no reteste v170).
Deno.test("isOndaAcaoRequest: frases dos aceites dos Motores 2 e 3", () => {
  assertEquals(isOndaAcaoRequest("registra reclamação no Bacen pra ABIGAIL, tarifa indevida, protocolo BCB-123, prazo fatal 13/08"), true);
  assertEquals(isOndaAcaoRequest("quais reclamações vencem essa semana?"), true);
  assertEquals(isOndaAcaoRequest("sentença procedente no processo 0801234-56.2025.8.05.0001"), true);
  assertEquals(isOndaAcaoRequest("execução ajuizada no processo X"), true);
  assertEquals(isOndaAcaoRequest("o réu pagou, pede alvará"), true);
  assertEquals(isOndaAcaoRequest("quais clientes são bronze?"), true);
  assertEquals(isOndaAcaoRequest("a senha da ABIGAIL tá errada"), true);
  assertEquals(isOndaAcaoRequest("olhei a execução, volta em 10 dias"), true);
  assertEquals(isOndaAcaoRequest("entrou o Sisbajud no processo do Ivan"), true);
  assertEquals(isOndaAcaoRequest("a penhora deu negativa"), true);
  assertEquals(isOndaAcaoRequest("abri um Procon pro Adalberto"), true);
  assertEquals(isOndaAcaoRequest("a dona Maria é bronze, precisa vir converter a conta"), true);
});

Deno.test("isOndaAcaoRequest: Motores 2 e 3 não viraram gatilho amplo demais", () => {
  assertEquals(isOndaAcaoRequest("bom dia, tudo bem?"), false);
  assertEquals(isOndaAcaoRequest("valeu, era isso"), false);
  assertEquals(isOndaAcaoRequest("me explica o que é penhora"), true);   // cita penhora: hint solta, o LLM decide
});

/* ══ P2 (Cards 11/13/14/15): diligência, audiência, apólice, procuração ══════ */

Deno.test("normalizeRouteObject: objetos do P2 + sinônimos", () => {
  assertEquals(normalizeRouteObject("DILIGENCIA_REGISTRAR"), "DILIGENCIA_REGISTRAR");
  assertEquals(normalizeRouteObject("diligência"), "DILIGENCIA_REGISTRAR");
  assertEquals(normalizeRouteObject("DILIGENCIA_CUMPRIR"), "DILIGENCIA_CUMPRIR");
  assertEquals(normalizeRouteObject("cumprir_diligencia"), "DILIGENCIA_CUMPRIR");
  assertEquals(normalizeRouteObject("DILIGENCIA_CONSULTA"), "DILIGENCIA_CONSULTA");
  assertEquals(normalizeRouteObject("diligencias"), "DILIGENCIA_CONSULTA");
  assertEquals(normalizeRouteObject("AUDIENCIA_PREPARO"), "AUDIENCIA_PREPARO");
  assertEquals(normalizeRouteObject("preparar_audiencia"), "AUDIENCIA_PREPARO");
  assertEquals(normalizeRouteObject("LEMBRETE_AUDIENCIA"), "LEMBRETE_AUDIENCIA");
  assertEquals(normalizeRouteObject("lembrete"), "LEMBRETE_AUDIENCIA");
  assertEquals(normalizeRouteObject("APOLICE_REGISTRAR"), "APOLICE_REGISTRAR");
  assertEquals(normalizeRouteObject("apólice"), "APOLICE_REGISTRAR");
  assertEquals(normalizeRouteObject("susep"), "APOLICE_REGISTRAR");
  assertEquals(normalizeRouteObject("APOLICE_UPDATE"), "APOLICE_UPDATE");
  assertEquals(normalizeRouteObject("APOLICE_CONSULTA"), "APOLICE_CONSULTA");
  assertEquals(normalizeRouteObject("apolices"), "APOLICE_CONSULTA");
  assertEquals(normalizeRouteObject("PROCURACAO_REGISTRAR"), "PROCURACAO_REGISTRAR");
  assertEquals(normalizeRouteObject("procuração"), "PROCURACAO_REGISTRAR");
  assertEquals(normalizeRouteObject("PROCURACAO_CONSULTA"), "PROCURACAO_CONSULTA");
  assertEquals(normalizeRouteObject("procurações"), "PROCURACAO_CONSULTA");
  assertEquals(normalizeRouteObject("CAMPANHA_PROCURACAO"), "CAMPANHA_PROCURACAO");
  assertEquals(normalizeRouteObject("campanha_renovacao"), "CAMPANHA_PROCURACAO");
});

// A ORDEM importa: "CAMPANHA_PROCURACAO" contém "PROCURACAO" e "DILIGENCIA_
// CONSULTA" contém "DILIGENCIA" — o prefixo comum não pode sequestrar o objeto.
Deno.test("normalizeRouteObject: prefixo comum não sequestra o objeto do P2", () => {
  assertEquals(normalizeRouteObject("CAMPANHA_RENOVACAO_PROCURACAO"), "CAMPANHA_PROCURACAO");
  assertEquals(normalizeRouteObject("CAMPANHA"), "CAMPANHA");          // a do Motor 1 segue
  assertEquals(normalizeRouteObject("AUDIENCIA"), "AUDIENCIA");        // marcar/consultar audiência
  assertEquals(normalizeRouteObject("PROTOCOLO"), "PROTOCOLO");        // não virou diligência
});

// Sem HINT o classificador de objeto NEM É CHAMADO: estas frases não têm verbo
// da lista genérica ("faz", "assinada", "avisei" não estão em ONDA_VERBO_RE).
Deno.test("isOndaAcaoRequest: diligências (Card 11)", () => {
  assertEquals(isOndaAcaoRequest("faz um balcão virtual no processo 0801234-56.2026.8.05.0001 pedindo agilidade na análise, prazo 24/08"), true);
  assertEquals(isOndaAcaoRequest("coloca concluso para análise"), true);
  assertEquals(isOndaAcaoRequest("precisa diligenciar a expedição de alvará"), true);
  assertEquals(isOndaAcaoRequest("fiz a diligência, protocolo 123"), true);
  assertEquals(isOndaAcaoRequest("quais diligências vencem essa semana?"), true);
  assertEquals(isOndaAcaoRequest("junta essa petição no processo"), true);
  assertEquals(isOndaAcaoRequest("carta precatória expedida"), true);
});

Deno.test("isOndaAcaoRequest: apólices de seguro (Card 14)", () => {
  assertEquals(isOndaAcaoRequest("a apólice da seguradora EXEMPLO está descontando 43,90 por mês"), true);
  assertEquals(isOndaAcaoRequest("ele tem um prestamista descontando no extrato"), true);
  assertEquals(isOndaAcaoRequest("esse número de processo SUSEP consta na proposta"), true);
  assertEquals(isOndaAcaoRequest("tem 3 seguros que ele nunca contratou"), true);
  assertEquals(isOndaAcaoRequest("quanto de prêmio mensal a gente tem mapeado?"), true);
  assertEquals(isOndaAcaoRequest("aquele seguro foi cancelado e restituíram"), true);
});

Deno.test("isOndaAcaoRequest: procuração e campanha de renovação (Card 15)", () => {
  assertEquals(isOndaAcaoRequest("a procuração de FULANO DE TAL foi assinada em 03/03"), true);
  assertEquals(isOndaAcaoRequest("procuração ad judicia, validade 24 meses"), true);
  assertEquals(isOndaAcaoRequest("quais procurações vencem esse mês?"), true);
  assertEquals(isOndaAcaoRequest("monta a campanha de renovação de procuração"), true);
  assertEquals(isOndaAcaoRequest("quem está com procuração vencida?"), true);
});

Deno.test("isOndaAcaoRequest: preparo e lembrete de audiência (Card 13)", () => {
  assertEquals(isOndaAcaoRequest("avisei FULANO DE TAL da audiência"), true);
  assertEquals(isOndaAcaoRequest("liguei pra lembrar da audiência e não atendeu"), true);
  assertEquals(isOndaAcaoRequest("o que falta para a audiência de amanhã?"), true);
  assertEquals(isOndaAcaoRequest("confirmei a audiência com o cliente"), true);
  assertEquals(isOndaAcaoRequest("quais documentos a audiência exige?"), true);
});

// GOTCHA pt-BR (o mesmo do Motor 1): `\w` é ASCII, então `dilig\w*` casa só
// "dilig" e o lookahead (?![\wÀ-ÿ]) REPROVA no "ê" de "diligência". Estas três
// palavras — diligência, procuração, apólice — são exatamente as que reprovariam.
Deno.test("isOndaAcaoRequest: cauda acentuada do P2 aciona (diligência/procuração/apólice)", () => {
  assertEquals(isOndaAcaoRequest("diligência"), true);
  assertEquals(isOndaAcaoRequest("diligências"), true);
  assertEquals(isOndaAcaoRequest("procuração"), true);
  assertEquals(isOndaAcaoRequest("procurações"), true);
  assertEquals(isOndaAcaoRequest("apólice"), true);
  assertEquals(isOndaAcaoRequest("apólices"), true);
});

Deno.test("isOndaAcaoRequest: P2 não criou gatilho amplo demais", () => {
  assertEquals(isOndaAcaoRequest("bom dia, tudo bem?"), false);
  assertEquals(isOndaAcaoRequest("obrigado, era isso mesmo"), false);
  // "seguro" como ADJETIVO não aciona: só com contratação/desconto/reconhecimento perto.
  assertEquals(isOndaAcaoRequest("esse caminho é mais seguro"), false);
  assertEquals(isOndaAcaoRequest("fica seguro que eu resolvo"), false);
});

/* ─── A.6 (I-04/I-05): objetos SEM tool no chat, para a recusa sair pela regra ─ */

Deno.test("normalizeRouteObject: EXTRATO_DECISAO e MATRIZ_DOCUMENTOS (+ sinônimos)", () => {
  assertEquals(normalizeRouteObject("EXTRATO_DECISAO"), "EXTRATO_DECISAO");
  assertEquals(normalizeRouteObject("LANCAMENTO_EXTRATO"), "EXTRATO_DECISAO");
  assertEquals(normalizeRouteObject("decidir_lancamento_extrato"), "EXTRATO_DECISAO");
  assertEquals(normalizeRouteObject("MATRIZ_DOCUMENTOS"), "MATRIZ_DOCUMENTOS");
  assertEquals(normalizeRouteObject("matriz"), "MATRIZ_DOCUMENTOS");
  assertEquals(normalizeRouteObject("MATRIZ_DOCUMENTAL"), "MATRIZ_DOCUMENTOS");
});

Deno.test("isOndaAcaoRequest: decisão de lançamento de extrato aciona", () => {
  assertEquals(isOndaAcaoRequest("confirma esse lançamento do extrato"), true);
  assertEquals(isOndaAcaoRequest("rejeita o lançamento da análise do extrato"), true);
  assertEquals(isOndaAcaoRequest("esses lançamentos podem ser confirmados"), true);
});

Deno.test("isOndaAcaoRequest: matriz de documentos aciona", () => {
  assertEquals(isOndaAcaoRequest("importa a matriz de documentos das teses"), true);
  assertEquals(isOndaAcaoRequest("substitui a matriz documental"), true);
});

// O gatilho do extrato NÃO pode roubar as frases de vínculo bancário do Card 3:
// "já temos o extrato do banco X" continua sendo RELACAO_BANCARIA (o hint ainda
// aciona, mas por outro padrão — o que importa é não passar a casar por decisão).
Deno.test("A.6: 'matriz' e 'extrato' isolados não viram os novos objetos", () => {
  assertEquals(normalizeRouteObject("EXTRATO"), "OUTRO");
  assertEquals(normalizeRouteObject("DOCUMENTOS"), "KIT_DOCUMENTAL");
  // Frase sem nenhum dos dois temas continua fora do gatilho.
  assertEquals(isOndaAcaoRequest("a matriz do prédio é bonita"), false);
});
