import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAgendarAtendimentoRequest, isReuniaoAcaoRequest, looksLikePecaRequest } from "./agendaDetect.ts";

Deno.test("agendar: reconhece pedidos de agendamento", () => {
  for (const m of [
    "agenda um atendimento pro cliente João amanhã 10h",
    "agendar reunião com a Maria sexta 14h",
    "marca uma reunião pra terça de manhã",
    // "agendamento" (substantivo) é sinal FORTE — dispensa o objeto reunião/atendimento.
    "marque um agendamento para ana cristina com o cliente ryan ribeiro de oliveira hoje às 11:00",
    "quero um agendamento com o dr. joão amanhã",
    "preciso marcar um agendamento pro cliente",
    // "horario" só no caminho de agendar, COM verbo.
    "marca um horário pra terça de manhã com a Maria",
    "agende um horário com o cliente sexta 14h",
  ]) assertEquals(isAgendarAtendimentoRequest(m), true, m);
});

Deno.test("agendar: NÃO captura pedido de peça", () => {
  for (const m of [
    "faz uma petição inicial de aposentadoria",
    "redige a contestação do processo",
    "preciso de um recurso inominado",
  ]) assertEquals(isAgendarAtendimentoRequest(m), false, m);
});

Deno.test("acao: reconhece ciclo/reagendar", () => {
  for (const m of [
    "confirma a reunião das 10h do João amanhã",
    "marca como realizada a reunião da Maria",
    "cancela a reunião de amanhã",
    "o cliente não compareceu à reunião",
    "reagenda pra 14h",
  ]) assertEquals(isReuniaoAcaoRequest(m), true, m);
});

// Falso-positivo: verbos genéricos SEM objeto de reunião não são capturados
// (o detector é sempre-ligado; capturar isso sequestraria tarefas/pagamentos).
Deno.test("agenda/acao: NÃO captura pedidos genéricos sem contexto de reunião", () => {
  for (const m of [
    "ver a agenda de hoje",
    "realizar tarefa de ligar pro cliente amanhã",
    "o pagamento já foi realizado",
    "confirma o pagamento amanhã",
    // "horario" NÃO está no objeto de ação — não pode sequestrar confirmação de pagamento.
    "confirma o horário do pagamento",
    // "agenda" (calendário) sem objeto de reunião nem "agendamento" continua fora.
    "abre a agenda da semana",
  ]) {
    assertEquals(isReuniaoAcaoRequest(m), false, `acao: ${m}`);
    assertEquals(isAgendarAtendimentoRequest(m), false, `agendar: ${m}`);
  }
});

Deno.test("guarda de peça", () => {
  assertEquals(looksLikePecaRequest("faz uma petição inicial"), true);
  assertEquals(looksLikePecaRequest("agenda reunião amanhã"), false);
});
