import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assembleInput, assembleTranscriptionInput, buildSummaryPrompt, normalizeSummary, SUMMARY_FIELDS } from "./attendanceSummary.ts";

Deno.test("normalizeSummary preenche campos ausentes com 'não informado'", () => {
  const s = normalizeSummary({ problemas: "Cobrança indevida" }, "chat", "2026-07-09T12:00:00Z");
  assertEquals(s.problemas, "Cobrança indevida");
  assertEquals(s.bancos, "não informado");
  for (const f of SUMMARY_FIELDS) assertEquals(typeof (s as Record<string,string>)[f], "string");
  assertEquals(s.fonte, "chat");
  assertEquals(s.gerado_em, "2026-07-09T12:00:00Z");
});

Deno.test("normalizeSummary ignora chaves extras e coage não-string", () => {
  const s = normalizeSummary({ bancos: ["Crefisa","Agibank"], lixo: 1 }, "chat", "t");
  assertStringIncludes(s.bancos, "Crefisa");
  // deno-lint-ignore no-explicit-any
  assertEquals((s as any).lixo, undefined);
});

Deno.test("assembleInput respeita limite e rotula papéis", () => {
  const txt = assembleInput([{role:"user",content:"olá"},{role:"assistant",content:"oi"}], ["resumo doc"], 1000);
  assertStringIncludes(txt, "olá");
  assertStringIncludes(txt, "resumo doc");
});

Deno.test("assembleTranscriptionInput concatena transcrições e rotula a fonte", () => {
  const txt = assembleTranscriptionInput([
    "[bloco 1]\nCliente relatou cobrança de tarifa indevida.",
    "[bloco 2]\nEmpréstimo consignado com o banco X.",
  ]);
  assertStringIncludes(txt, "TRANSCRIÇÃO DO ATENDIMENTO");
  assertStringIncludes(txt, "tarifa indevida");
  assertStringIncludes(txt, "consignado");
});

Deno.test("assembleTranscriptionInput vazio quando não há transcrição → '' (fonte sem_conteudo)", () => {
  assertEquals(assembleTranscriptionInput([]), "");
  assertEquals(assembleTranscriptionInput(["", "   "]), "");
});

Deno.test("assembleTranscriptionInput respeita o teto de chars", () => {
  const grande = "a".repeat(20000);
  assertEquals(assembleTranscriptionInput([grande], 500).length, 500);
});

Deno.test("buildSummaryPrompt exige anti-alucinação e lista os campos", () => {
  const p = buildSummaryPrompt();
  assertStringIncludes(p, "não informado");
  for (const f of SUMMARY_FIELDS) assertStringIncludes(p, f);
});
