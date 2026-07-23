import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildOcrDocContext, computeAge } from "./ocrDocContext.ts";

// Data de referência fixa para a aritmética de idade (23/07/2026).
const NOW = new Date("2026-07-23T12:00:00Z");

Deno.test("doc com doc_type gera bloco com tipo, campos e marca [REVISAR]", () => {
  const out = buildOcrDocContext([{
    file_name: "rg.png",
    ocr_confidence: 0.91,
    ocr_fields: [
      { key: "doc_type", value: "identidade", needsReview: false },
      { key: "cpf", value: "123.456.789-09", needsReview: false },
      { key: "full_name", value: "Fulano de Tal", needsReview: false },
      { key: "mother_name", value: "Maria", needsReview: true },
    ],
  }]);
  assertStringIncludes(out, "identidade");
  assertStringIncludes(out, "cpf = 123.456.789-09");
  assertStringIncludes(out, "mother_name = Maria [REVISAR]");
  assertStringIncludes(out, "0.91");
  // doc_type não aparece como bullet de campo
  assert(!out.includes("• doc_type"), "doc_type não deve virar bullet");
  // guia de ação anexada (cadastro novo + CPF existente = pendência de revisão)
  assertStringIncludes(out, "consultar_cliente");
  assertStringIncludes(out, "cadastrar_cliente");
  assertStringIncludes(out, "não duplique");
});

Deno.test("doc sem doc_type → bloco vazio", () => {
  const out = buildOcrDocContext([{
    file_name: "contrato.pdf",
    ocr_confidence: 0.8,
    ocr_fields: [{ key: "cpf", value: "111", needsReview: false }],
  }]);
  assertEquals(out, "");
});

Deno.test("lista vazia / ocr_fields nulo → bloco vazio (defensivo)", () => {
  assertEquals(buildOcrDocContext([]), "");
  assertEquals(buildOcrDocContext([{ file_name: "x.png", ocr_confidence: null, ocr_fields: null }]), "");
});

// ── #1: aritmética de idade determinística (nunca no LLM) ────────────────────
Deno.test("computeAge: nascido 09/08/2005, em 23/07/2026 → 20 (ainda não fez aniversário)", () => {
  assertEquals(computeAge("09/08/2005", NOW), 20);
});

Deno.test("computeAge: aniversário já passou no ano corrente", () => {
  assertEquals(computeAge("01/03/2005", NOW), 21);
});

Deno.test("computeAge: aniversário é hoje → conta o ano", () => {
  assertEquals(computeAge("23/07/2000", NOW), 26);
});

Deno.test("computeAge: aceita ISO AAAA-MM-DD", () => {
  assertEquals(computeAge("2010-01-01", NOW), 16);
});

Deno.test("computeAge: data inválida/impossível → null", () => {
  assertEquals(computeAge("", NOW), null);
  assertEquals(computeAge("31/13/2005", NOW), null);
  assertEquals(computeAge("não é data", NOW), null);
  assertEquals(computeAge("09/08/1800", NOW), null); // > 130 anos
});

Deno.test("buildOcrDocContext injeta idade calculada pronta (maior de idade)", () => {
  const out = buildOcrDocContext([{
    file_name: "rg.png",
    ocr_confidence: 0.91,
    ocr_fields: [
      { key: "doc_type", value: "identidade", needsReview: false },
      { key: "birth_date", value: "09/08/2005", needsReview: false },
    ],
  }], NOW);
  assertStringIncludes(out, "idade calculada: 20 anos (maior de idade)");
});

Deno.test("buildOcrDocContext: menor de idade é rotulado corretamente", () => {
  const out = buildOcrDocContext([{
    file_name: "rg.png",
    ocr_confidence: 0.9,
    ocr_fields: [
      { key: "doc_type", value: "identidade", needsReview: false },
      { key: "birth_date", value: "2015-05-10", needsReview: false },
    ],
  }], NOW);
  assertStringIncludes(out, "menor de idade");
});

Deno.test("buildOcrDocContext: birth_date [REVISAR] → idade sai como a confirmar", () => {
  const out = buildOcrDocContext([{
    file_name: "rg.png",
    ocr_confidence: 0.66,
    ocr_fields: [
      { key: "doc_type", value: "identidade", needsReview: false },
      { key: "birth_date", value: "09/08/2005", needsReview: true },
    ],
  }], NOW);
  assertStringIncludes(out, "CONFIRME a data");
});

// ── #3: campos de baixa confiança nunca como fato ────────────────────────────
Deno.test("buildOcrDocContext: regra de confiança proíbe 'validei' e pede confirmação", () => {
  const out = buildOcrDocContext([{
    file_name: "rg.png",
    ocr_confidence: 0.66,
    ocr_fields: [
      { key: "doc_type", value: "identidade", needsReview: false },
      { key: "rg", value: "863.363.645-00", needsReview: true },
    ],
  }], NOW);
  assertStringIncludes(out, "rg = 863.363.645-00 [REVISAR]");
  assertStringIncludes(out, "li com baixa confiança, confirme:");
  assert(/PROIBIDO.*validei/s.test(out), "deve proibir dizer 'validei'");
});
