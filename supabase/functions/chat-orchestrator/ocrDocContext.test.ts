import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildOcrDocContext } from "./ocrDocContext.ts";

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
