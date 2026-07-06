// supabase/functions/_shared/ocr/merge.ts
//
// Regra anti-ALERTA-1 (§3 do briefing): quando DOIS documentos divergem no
// MESMO campo (ex.: duas datas de nascimento — uma do RG da autora, outra do
// RG do representante legal), NÃO escolher. Emitir ambos com atribuição e
// marcar `[REVISAR]`. Foi exatamente a falta disso que produziu o ALERTA 1:
// a data "2015" foi afirmada como da autora quando vinha do RG do representante.
//
// Esta camada opera sobre múltiplos ExtractionResult (um por documento) e
// produz um resultado consolidado. Um único documento passa por aqui inalterado.

import type { ExtractionResult, OcrField } from "./types.ts";

/** Normaliza o valor para comparar divergência (dígitos e caixa). */
function normValue(v: string): string {
  return v.replace(/\s+/g, "").toLowerCase();
}

/** Chave-base do campo, ignorando o sufixo de índice (cpf_2 → cpf). */
function baseKey(key: string): string {
  return key.replace(/_\d+$/, "");
}

/**
 * Consolida campos de vários documentos. Para cada chave-base:
 *  • valores concordantes → mantidos (review só se abaixo do limiar);
 *  • valores DIVERGENTES entre documentos → todos emitidos, cada um com sua
 *    `sourceDocument`, todos com `needsReview=true` e motivo explicando a
 *    divergência. Nenhum é escolhido sobre o outro.
 */
export function mergeExtractionResults(
  results: ExtractionResult[],
  opts?: { engine?: string },
): ExtractionResult {
  const warnings: string[] = [];
  for (const r of results) warnings.push(...r.warnings);

  // Agrupa TODOS os campos por chave-base.
  const groups = new Map<string, OcrField[]>();
  for (const r of results) {
    for (const f of r.fields) {
      const k = baseKey(f.key);
      const arr = groups.get(k) ?? [];
      arr.push(f);
      groups.set(k, arr);
    }
  }

  const mergedFields: OcrField[] = [];
  for (const [k, fs] of groups) {
    // Documentos distintos que contribuíram valores para esta chave.
    const docsWithValue = new Set(fs.map((f) => f.sourceDocument));
    const distinctValues = new Set(fs.map((f) => normValue(f.value)));

    const divergentAcrossDocs = distinctValues.size > 1 && docsWithValue.size > 1;

    if (divergentAcrossDocs) {
      // Anti-ALERTA-1: emite TODOS, sem escolher, com atribuição + REVISAR.
      const summary = fs
        .map((f) => `${f.value} (${f.sourceDocument})`)
        .join(" vs ");
      for (const f of fs) {
        mergedFields.push({
          ...f,
          needsReview: true,
          reviewReason: `divergência entre documentos no campo "${k}": ${summary} — não escolher, revisar`,
        });
      }
      warnings.push(`Campo "${k}" divergente entre documentos: ${summary}`);
    } else {
      // Concordância (ou origem única): mantém os campos como estão.
      for (const f of fs) mergedFields.push(f);
    }
  }

  // Texto consolidado: concatena os textos crus rotulados por documento,
  // preservando a fidelidade (nunca sintetiza um texto novo).
  const text = results
    .map((r) => {
      const label = r.fields[0]?.sourceDocument;
      const header = label ? `[${label}]\n` : "";
      return `${header}${r.text}`;
    })
    .join("\n\n");

  const confs = mergedFields.map((f) => f.confidence);
  const confidenceOverall = confs.length
    ? Math.round((confs.reduce((a, c) => a + c, 0) / confs.length) * 100) / 100
    : 0;

  return {
    text,
    fields: mergedFields,
    confidenceOverall,
    engine: opts?.engine ?? results[0]?.engine ?? "textract+map",
    warnings,
  };
}
