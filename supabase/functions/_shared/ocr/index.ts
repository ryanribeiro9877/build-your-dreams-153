// supabase/functions/_shared/ocr/index.ts
//
// Ponto de entrada do módulo OCR. O consumidor (futura Edge Function
// `ocr-attachment` do Briefing 1) importa daqui.

export * from "./types.ts";
export { extractDeterministicFields, formatCpf, isValidCpf } from "./deterministic.ts";
export { mergeExtractionResults } from "./merge.ts";
export { createTextractExtractor, TEXTRACT_ENGINE } from "./textractExtractor.ts";
export { makeTextractRawOcr, type TextractConfig } from "./textractClient.ts";
export { assertOpenAiDirect, makeOpenAiReinforcement } from "./llmReinforcement.ts";
export { getExtractor, type SecretGetter } from "./registry.ts";
