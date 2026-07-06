import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { mergeExtractionResults } from "./merge.ts";
import type { ExtractionResult, OcrField } from "./types.ts";

function field(key: string, value: string, sourceDocument: string): OcrField {
  return {
    key,
    value,
    confidence: 0.95,
    sourceDocument,
    method: "regex",
    needsReview: false,
  };
}

function result(fields: OcrField[], text: string): ExtractionResult {
  return { text, fields, confidenceOverall: 0.95, engine: "textract+map", warnings: [] };
}

// ── TESTE ANTI-ALERTA-1 ───────────────────────────────────────────────────────
// Dois documentos com o MESMO campo divergente (data de nascimento): o RG da
// autora diz 05/03/1990; o RG do representante legal diz 12/07/2015. NÃO
// escolher — emitir ambos com atribuição e marcar [REVISAR].
Deno.test("dois docs com data de nascimento divergente → ambos emitidos + REVISAR, sem escolher", () => {
  const autora = result(
    [field("date", "05/03/1990", "RG_autora")],
    "NASC 05/03/1990",
  );
  const representante = result(
    [field("date", "12/07/2015", "RG_representante_legal")],
    "NASC 12/07/2015",
  );

  const merged = mergeExtractionResults([autora, representante]);
  const dates = merged.fields.filter((f) => f.key === "date");

  // Ambos presentes — nenhum foi descartado.
  assertEquals(dates.length, 2);
  const values = dates.map((f) => f.value).sort();
  assertEquals(values, ["05/03/1990", "12/07/2015"]);

  // Ambos com atribuição preservada e marcados para review.
  const byDoc = new Map(dates.map((f) => [f.sourceDocument, f]));
  assert(byDoc.has("RG_autora"));
  assert(byDoc.has("RG_representante_legal"));
  for (const f of dates) {
    assertEquals(f.needsReview, true);
    assert(f.reviewReason?.includes("divergência entre documentos"));
  }

  // O warning consolidado registra a divergência.
  assert(merged.warnings.some((w) => w.includes("divergente entre documentos")));
});

Deno.test("dois docs concordam no mesmo campo → mantidos sem review forçado", () => {
  const a = result([field("cpf", "529.982.247-25", "RG_autora")], "x");
  const b = result([field("cpf", "529.982.247-25", "comprovante")], "y");
  const merged = mergeExtractionResults([a, b]);
  const cpfs = merged.fields.filter((f) => f.key === "cpf");
  // Valores iguais → não força review por divergência.
  for (const f of cpfs) assertEquals(f.needsReview, false);
});

Deno.test("documento único passa inalterado", () => {
  const only = result([field("cpf", "529.982.247-25", "RG_autora")], "x");
  const merged = mergeExtractionResults([only]);
  assertEquals(merged.fields.length, 1);
  assertEquals(merged.fields[0].needsReview, false);
});

Deno.test("texto consolidado rotula cada documento pela atribuição", () => {
  const a = result([field("cpf", "1", "RG_autora")], "TEXTO A");
  const b = result([field("cpf", "2", "RG_representante_legal")], "TEXTO B");
  const merged = mergeExtractionResults([a, b]);
  assert(merged.text.includes("[RG_autora]"));
  assert(merged.text.includes("[RG_representante_legal]"));
  assert(merged.text.includes("TEXTO A"));
});
