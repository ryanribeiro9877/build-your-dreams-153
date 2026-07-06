import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createTextractExtractor, TEXTRACT_ENGINE } from "./textractExtractor.ts";
import type { LlmReinforcementFn, RawOcrFn, RawOcrResult } from "./types.ts";

const VALID_CPF = "529.982.247-25";

// RawOcrFn falso: devolve linhas sintéticas (sem AWS, sem credenciais).
function fakeRawOcr(result: RawOcrResult): RawOcrFn {
  return async () => result;
}

const emptyInput = { bytes: new Uint8Array([1, 2, 3]) };

Deno.test("documento sintético legível → texto + CPF validado com alta confiança", async () => {
  const raw: RawOcrResult = {
    fullText: `REPÚBLICA FEDERATIVA DO BRASIL\nNOME MARIA DA SILVA\nCPF ${VALID_CPF}\nNASC 05/03/1990`,
    lines: [
      { text: "REPÚBLICA FEDERATIVA DO BRASIL", confidence: 0.99 },
      { text: "NOME MARIA DA SILVA", confidence: 0.98 },
      { text: `CPF ${VALID_CPF}`, confidence: 0.98 },
      { text: "NASC 05/03/1990", confidence: 0.97 },
    ],
  };
  const extractor = createTextractExtractor({ rawOcr: fakeRawOcr(raw) });
  const out = await extractor.extract({ ...emptyInput, sourceDocument: "RG_autora" });

  assertEquals(out.engine, TEXTRACT_ENGINE);
  assert(out.text.includes(VALID_CPF));
  const cpf = out.fields.find((f) => f.key === "cpf");
  assert(cpf, "cpf capturado");
  assertEquals(cpf!.method, "deterministic");
  assertEquals(cpf!.sourceDocument, "RG_autora");
  assert(cpf!.confidence >= 0.85);
  assertEquals(cpf!.needsReview, false);
});

Deno.test("documento sintético borrado → campos abaixo do limiar, marcados incertos", async () => {
  // Linhas com baixa confiança (ilegível). Provar o princípio anti-alucinação:
  // nada é afirmado — tudo needsReview.
  const raw: RawOcrResult = {
    fullText: `CPF ${VALID_CPF}\nNASC 05/03/1990`,
    lines: [
      { text: `CPF ${VALID_CPF}`, confidence: 0.45 },
      { text: "NASC 05/03/1990", confidence: 0.4 },
    ],
  };
  const extractor = createTextractExtractor({ rawOcr: fakeRawOcr(raw) });
  const out = await extractor.extract({ ...emptyInput, sourceDocument: "doc" });

  assert(out.fields.length > 0, "ainda captura campos");
  for (const f of out.fields) {
    assert(f.needsReview, `campo ${f.key} deve exigir review`);
    assert(f.confidence < 0.85, `campo ${f.key} deve ficar abaixo do limiar`);
  }
  assert(out.confidenceOverall < 0.85);
});

Deno.test("OCR sem linhas → warning de ilegível, confiança 0", async () => {
  const extractor = createTextractExtractor({
    rawOcr: fakeRawOcr({ fullText: "", lines: [] }),
  });
  const out = await extractor.extract(emptyInput);
  assertEquals(out.fields.length, 0);
  assertEquals(out.confidenceOverall, 0);
  assert(out.warnings.some((w) => w.includes("ilegível")));
});

Deno.test("reforço LLM só roda para chaves não capturadas pela regra", async () => {
  let called = false;
  let receivedMissing: string[] = [];
  const reinforce: LlmReinforcementFn = async ({ missingKeys }) => {
    called = true;
    receivedMissing = missingKeys;
    return [{ key: "full_name", value: "MARIA DA SILVA", confidence: 0.95 }];
  };
  const raw: RawOcrResult = {
    fullText: `CPF ${VALID_CPF}`,
    lines: [{ text: `CPF ${VALID_CPF}`, confidence: 0.98 }],
  };
  const extractor = createTextractExtractor({ rawOcr: fakeRawOcr(raw), reinforce });
  const out = await extractor.extract(
    { ...emptyInput, expectedFields: ["cpf", "full_name"] },
    { enableLlmReinforcement: true },
  );

  assert(called, "reforço chamado");
  // cpf já foi capturado pela regra → não deve ser pedido ao LLM.
  assert(!receivedMissing.includes("cpf"));
  assert(receivedMissing.includes("full_name"));
  const name = out.fields.find((f) => f.key === "full_name");
  assert(name, "campo do LLM incorporado");
  assertEquals(name!.method, "llm");
  // 0.95 * 0.7 = 0.665 → abaixo do limiar → review (LLM é temperado).
  assert(name!.confidence < 0.85);
  assert(name!.needsReview);
});

Deno.test("reforço LLM desligado por default (não chama sem flag)", async () => {
  let called = false;
  const reinforce: LlmReinforcementFn = async () => {
    called = true;
    return [];
  };
  const raw: RawOcrResult = { fullText: "layout bagunçado", lines: [{ text: "x", confidence: 0.9 }] };
  const extractor = createTextractExtractor({ rawOcr: fakeRawOcr(raw), reinforce });
  await extractor.extract(emptyInput); // sem enableLlmReinforcement
  assert(!called, "não deve chamar LLM sem a flag");
});

Deno.test("falha no reforço LLM não derruba a extração (warning)", async () => {
  const reinforce: LlmReinforcementFn = async () => {
    throw new Error("boom");
  };
  const raw: RawOcrResult = {
    fullText: `CPF ${VALID_CPF}`,
    lines: [{ text: `CPF ${VALID_CPF}`, confidence: 0.98 }],
  };
  const extractor = createTextractExtractor({ rawOcr: fakeRawOcr(raw), reinforce });
  const out = await extractor.extract(
    { ...emptyInput, expectedFields: ["full_name"] },
    { enableLlmReinforcement: true },
  );
  assert(out.fields.find((f) => f.key === "cpf"), "extração determinística sobrevive");
  assert(out.warnings.some((w) => w.includes("Reforço LLM pulado")));
});
