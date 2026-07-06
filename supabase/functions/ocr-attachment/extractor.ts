// supabase/functions/ocr-attachment/extractor.ts
//
// Contrato ESTÁVEL do extrator de OCR. Este arquivo define a interface que o
// extrator real (Briefing 2: Textract/híbrido) vai implementar SEM alterar quem
// o consome — a Edge Function `ocr-attachment` só conhece esta interface, nunca
// um provedor concreto.
//
// Aqui entra APENAS o `stubExtractor` (texto sintético) para validar o
// encanamento ponta-a-ponta sem depender de provedor externo. O extrator
// dedicado do Briefing 2 registra-se na mesma `getExtractor()` por `OCR_ENGINE`.

export interface OcrField {
  key: string; // ex.: "cpf", "rg", "nome", "data_nascimento"
  value: string;
  confidence: number; // 0..1
  sourceDocument: string; // nome/id do anexo de origem — ATRIBUIÇÃO (hardening no Briefing 2)
}

export interface OcrResult {
  text: string; // texto cru concatenado → vira extracted_text
  fields: OcrField[]; // estruturado (pode vir vazio no stub)
  confidenceOverall: number;
  engine: string; // "stub" | "textract" | ...
}

export interface Extractor {
  extract(bytes: Uint8Array, mime: string, fileName: string): Promise<OcrResult>;
}

// Extrator STUB: devolve texto sintético derivado do nome do arquivo. Não lê o
// binário — só existe para exercitar o fluxo (download → extract → UPDATE) com a
// flag ligada em ambiente de teste. `fields` vazio de propósito; o Briefing 2
// preenche a extração estruturada real.
export const stubExtractor: Extractor = {
  extract(_bytes: Uint8Array, _mime: string, fileName: string): Promise<OcrResult> {
    return Promise.resolve({
      text: `[OCR STUB] conteúdo simulado de ${fileName}`,
      fields: [],
      confidenceOverall: 1,
      engine: "stub",
    });
  },
};

// Resolve o extrator pela env `OCR_ENGINE` (default: "stub"). O Briefing 2
// adiciona os cases reais (ex.: "textract") aqui — a Edge Function não muda.
export function getExtractor(engine?: string | null): Extractor {
  switch ((engine || "stub").trim().toLowerCase()) {
    case "stub":
      return stubExtractor;
    default:
      // Engine desconhecido: cai no stub para não quebrar o fluxo (a flag só liga
      // em teste). O Briefing 2 troca este fallback pelo extrator dedicado.
      return stubExtractor;
  }
}
