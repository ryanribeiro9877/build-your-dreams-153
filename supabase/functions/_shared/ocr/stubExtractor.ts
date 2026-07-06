// supabase/functions/_shared/ocr/stubExtractor.ts
//
// Extrator STUB (reconciliação Briefing 1 ↔ Briefing 2). Migrado do antigo
// `ocr-attachment/extractor.ts` (Briefing 1) para o local canônico `_shared/ocr/`
// e reescrito sobre a interface `Extractor` única (ver ./types.ts).
//
// Devolve texto sintético derivado da atribuição do documento. NÃO lê o binário
// e NÃO exige credencial/região AWS — existe só para exercitar o fluxo
// ponta-a-ponta (download → extract → UPDATE) com a flag ligada em teste local.
// `fields` sai vazio de propósito: a extração estruturada real é do Textract
// (ver ./textractExtractor.ts). Selecionado por `OCR_ENGINE=stub` (ver ./registry.ts).

import type { Extractor, ExtractionResult, ExtractorInput } from "./types.ts";

export const STUB_ENGINE = "stub";

export const stubExtractor: Extractor = {
  engine: STUB_ENGINE,
  extract(input: ExtractorInput): Promise<ExtractionResult> {
    const label = input.sourceDocument ?? "documento";
    return Promise.resolve({
      text: `[OCR STUB] conteúdo simulado de ${label}`,
      fields: [],
      confidenceOverall: 1,
      engine: STUB_ENGINE,
      warnings: [],
    });
  },
};
