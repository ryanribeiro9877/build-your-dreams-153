import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type IntentCategory, mentionsAttachments, normalizeIntent, routePathFor, shouldClassify,
  isAwaitingCollectionMeta, isCollectionEscape, isErrorMeta, findActiveCollection,
  isCollectionContinuation, isCadastroClienteRequest, isTarefaChatRequest,
} from "./intentClassifier.ts";

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
