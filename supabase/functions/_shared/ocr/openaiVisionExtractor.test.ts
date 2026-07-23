import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createOpenAiVisionExtractor, type VisionCallFn } from "./openaiVisionExtractor.ts";

// Fábrica: extrator com uma função de visão INJETADA (sem rede) que devolve um
// doc_type + campos controlados.
function extractorWith(raw: { text: string; fields: Array<{ key: string; value: string; confidence: number }>; doc_type?: string }) {
  const call: VisionCallFn = () => Promise.resolve(raw);
  return createOpenAiVisionExtractor({ apiKey: "x", model: "gpt-4o-mini", call });
}

Deno.test("doc_type da visão entra em fields (key=doc_type), não é campo de cadastro", async () => {
  const ex = extractorWith({
    text: "REPÚBLICA FEDERATIVA DO BRASIL\nCARTEIRA DE IDENTIDADE",
    fields: [{ key: "full_name", value: "Fulano de Tal", confidence: 0.95 }],
    doc_type: "identidade",
  });
  const r = await ex.extract({ bytes: new Uint8Array([1, 2, 3]), sourceDocument: "rg.png" });
  const dt = r.fields.find((f) => f.key === "doc_type");
  assert(dt, "esperava um OcrField doc_type");
  assertEquals(dt!.value, "identidade");
  assertEquals(dt!.needsReview, false);
});

Deno.test("doc_type fora do enum é ignorado", async () => {
  const ex = extractorWith({ text: "algo", fields: [], doc_type: "passaporte_alienigena" });
  const r = await ex.extract({ bytes: new Uint8Array([1]), sourceDocument: "x.png" });
  assertEquals(r.fields.find((f) => f.key === "doc_type"), undefined);
});

Deno.test("sem doc_type → nenhum campo doc_type", async () => {
  const ex = extractorWith({ text: "algo", fields: [] });
  const r = await ex.extract({ bytes: new Uint8Array([1]), sourceDocument: "x.png" });
  assertEquals(r.fields.find((f) => f.key === "doc_type"), undefined);
});
