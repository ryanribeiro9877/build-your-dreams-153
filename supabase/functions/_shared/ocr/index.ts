// supabase/functions/_shared/ocr/index.ts
//
// Ponto de entrada do módulo OCR. O consumidor (Edge Function `ocr-attachment`
// do Briefing 1) importa daqui — `getExtractor` é o ÚNICO seletor do repo.

export * from "./types.ts";
export { extractDeterministicFields, formatCpf, isValidCpf } from "./deterministic.ts";
export { mergeExtractionResults } from "./merge.ts";
export { createTextractExtractor, TEXTRACT_ENGINE } from "./textractExtractor.ts";
export { makeTextractRawOcr, type TextractConfig } from "./textractClient.ts";
export { assertOpenAiDirect, makeOpenAiReinforcement } from "./llmReinforcement.ts";
export { createOpenAiVisionExtractor, OPENAI_VISION_ENGINE } from "./openaiVisionExtractor.ts";
export { stubExtractor, STUB_ENGINE } from "./stubExtractor.ts";
export { getExtractor, type SecretGetter } from "./registry.ts";
