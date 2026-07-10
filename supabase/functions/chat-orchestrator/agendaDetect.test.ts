import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAgendarAtendimentoRequest, isReuniaoAcaoRequest, looksLikePecaRequest } from "./agendaDetect.ts";

Deno.test("agendar: reconhece pedidos de agendamento", () => {
  for (const m of [
    "agenda um atendimento pro cliente João amanhã 10h",
    "agendar reunião com a Maria sexta 14h",
    "marca uma reunião pra terça de manhã",
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
  ]) {
    assertEquals(isReuniaoAcaoRequest(m), false, `acao: ${m}`);
    assertEquals(isAgendarAtendimentoRequest(m), false, `agendar: ${m}`);
  }
});

Deno.test("guarda de peça", () => {
  assertEquals(looksLikePecaRequest("faz uma petição inicial"), true);
  assertEquals(looksLikePecaRequest("agenda reunião amanhã"), false);
});
