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
    "o cliente não compareceu",
    "reagenda pra 14h",
  ]) assertEquals(isReuniaoAcaoRequest(m), true, m);
});

Deno.test("guarda de peça", () => {
  assertEquals(looksLikePecaRequest("faz uma petição inicial"), true);
  assertEquals(looksLikePecaRequest("agenda reunião amanhã"), false);
});
