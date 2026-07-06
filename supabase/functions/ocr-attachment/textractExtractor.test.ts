// Testes das funções PURAS do extrator híbrido (Briefing 2). Não tocam AWS/LLM —
// provam os critérios de aceite determinísticos: validação de CPF por dígito,
// marcação de incerteza abaixo do limiar, e anti-ALERTA-1 (divergência entre
// documentos). Usa Deno.test + asserts inline (sem import remoto → roda offline).
//
// Rodar: deno test supabase/functions/ocr-attachment/textractExtractor.test.ts

import {
  isValidCPF,
  mapDeterministicFields,
  reconcileFields,
  type OcrLine,
} from "./textractExtractor.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}
function assertEquals<T>(a: T, b: T, msg: string): void {
  if (a !== b) throw new Error(`ASSERT: ${msg} (esperado ${b}, veio ${a})`);
}

Deno.test("isValidCPF: dígito verificador", () => {
  assert(isValidCPF("529.982.247-25"), "CPF válido conhecido deve passar");
  assert(isValidCPF("52998224725"), "CPF válido sem máscara deve passar");
  assert(!isValidCPF("111.111.111-11"), "sequência repetida deve falhar");
  assert(!isValidCPF("529.982.247-24"), "dígito verificador errado deve falhar");
  assert(!isValidCPF("123.456.789-00"), "CPF inválido comum deve falhar");
  assert(!isValidCPF("123"), "comprimento errado deve falhar");
});

Deno.test("documento legível: CPF válido → alta confiança + atribuição", () => {
  const lines: OcrLine[] = [
    { text: "REPÚBLICA FEDERATIVA DO BRASIL", confidence: 0.99 },
    { text: "CPF 529.982.247-25", confidence: 0.98 },
    { text: "DATA NASC 10/05/1980", confidence: 0.97 },
  ];
  const fields = mapDeterministicFields(lines, "rg_autora.jpg", 0.85);
  const cpf = fields.find((f) => f.key === "cpf");
  assert(cpf, "deve capturar cpf");
  assert(cpf!.confidence >= 0.9, "cpf válido deve ter alta confiança");
  assert(cpf!.needsReview === false, "cpf válido acima do limiar não precisa revisão");
  assertEquals(cpf!.sourceDocument, "rg_autora.jpg", "atribuição deve ser o documento");
  assert(fields.some((f) => f.key === "data"), "deve capturar data");
});

Deno.test("documento ilegível: baixa confiança → needsReview (nunca afirma)", () => {
  const lines: OcrLine[] = [
    { text: "CPF 529.982.247-25", confidence: 0.42 }, // OCR borrado
    { text: "DATA 10/05/1980", confidence: 0.40 },
  ];
  const fields = mapDeterministicFields(lines, "rg_borrado.jpg", 0.85);
  // CPF: dígito confere → confiança sobe (validação determinística vence o OCR ruim).
  const cpf = fields.find((f) => f.key === "cpf");
  assert(cpf && cpf.confidence >= 0.9, "cpf com dígito válido é confiável mesmo com OCR ruim");
  // Data: sem validação forte + linha ruim → abaixo do limiar → needsReview.
  const data = fields.find((f) => f.key === "data");
  assert(data && data.needsReview === true, "data de linha borrada deve precisar revisão");
});

Deno.test("CPF com dígito inválido → sinalizado (provável erro de OCR)", () => {
  const lines: OcrLine[] = [{ text: "CPF 529.982.247-24", confidence: 0.95 }];
  const fields = mapDeterministicFields(lines, "doc.jpg", 0.85);
  const cpf = fields.find((f) => f.key === "cpf");
  assert(cpf && cpf.needsReview === true, "cpf inválido deve precisar revisão");
  assertEquals(cpf!.reviewReason, "cpf_digito_invalido", "razão deve ser dígito inválido");
});

Deno.test("anti-ALERTA-1: datas divergentes entre documentos → ambas com [REVISAR]", () => {
  // Cenário do ALERTA-1: uma data vem do RG da autora, outra do RG do representante.
  const docAutora = mapDeterministicFields(
    [{ text: "NASC 10/05/1980", confidence: 0.97 }], "rg_autora.jpg", 0.85,
  );
  const docRepresentante = mapDeterministicFields(
    [{ text: "NASC 03/07/2015", confidence: 0.97 }], "rg_representante_legal.jpg", 0.85,
  );
  const reconciled = reconcileFields([...docAutora, ...docRepresentante]);
  const datas = reconciled.filter((f) => f.key === "data");
  assertEquals(datas.length, 2, "ambas as datas devem ser emitidas (não escolher uma)");
  assert(datas.every((f) => f.needsReview === true), "divergência → todas precisam revisão");
  assert(
    datas.every((f) => f.reviewReason === "divergencia_entre_documentos"),
    "razão deve ser divergência entre documentos",
  );
  // Atribuição preservada: dá para saber de qual documento veio cada valor.
  assert(
    datas.some((f) => f.sourceDocument === "rg_representante_legal.jpg") &&
      datas.some((f) => f.sourceDocument === "rg_autora.jpg"),
    "cada valor mantém a atribuição do seu documento",
  );
});

Deno.test("valores convergentes NÃO são marcados por divergência", () => {
  const a = mapDeterministicFields([{ text: "CPF 529.982.247-25", confidence: 0.98 }], "a.jpg", 0.85);
  const b = mapDeterministicFields([{ text: "CPF 529.982.247-25", confidence: 0.98 }], "b.jpg", 0.85);
  const reconciled = reconcileFields([...a, ...b]);
  const cpfs = reconciled.filter((f) => f.key === "cpf");
  assert(cpfs.every((f) => f.reviewReason !== "divergencia_entre_documentos"), "mesmo valor não é divergência");
});
