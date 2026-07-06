// supabase/functions/_shared/ocr/textractExtractor.ts
//
// Extrator híbrido liderado por OCR dedicado (Briefing 2):
//   1. OCR bruto (Textract sa-east-1, trocável) → texto + confiança por linha.
//   2. Mapeamento determinístico primeiro (CPF com dígito, data/RG/CEP por
//      regex) — minimiza PII a terceiro.
//   3. LLM de reforço (OpenAI DIRETO) só para o que a regra não pegou — envia
//      o TEXTO, nunca a imagem.
// Cada OcrField sai com `confidence` e `sourceDocument`. `engine = "textract+map"`.
//
// As dependências externas (OCR bruto e reforço LLM) são INJETADAS: em produção
// vêm de ./textractClient.ts e ./llmReinforcement.ts; em teste, fakes síncronos
// (documento sintético) — nenhuma credencial, nenhuma chamada real.

import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  type Extractor,
  type ExtractionResult,
  type ExtractorInput,
  type ExtractorOptions,
  type LlmReinforcementFn,
  type OcrField,
  type RawOcrFn,
} from "./types.ts";
import { extractDeterministicFields } from "./deterministic.ts";

export const TEXTRACT_ENGINE = "textract+map";

// Chaves que o passe de reforço pode tentar quando a regra não capturou.
// CPF e data NÃO entram (resolvidos por regra; minimização de PII).
const REINFORCEABLE_KEYS = ["full_name", "mother_name", "father_name", "rg_issuer", "address"];

// Confiança do LLM é temperada: inferência é menos certa que regra determinística.
const LLM_CONFIDENCE_WEIGHT = 0.7;

interface TextractExtractorDeps {
  /** OCR bruto (default: Textract). */
  rawOcr: RawOcrFn;
  /** Reforço LLM opcional (default: OpenAI direto). Ausente = sem reforço. */
  reinforce?: LlmReinforcementFn;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Constrói o extrator Textract. Injete `rawOcr` (e opcionalmente `reinforce`).
 * Retorna um objeto que satisfaz a interface `Extractor` do Briefing 1.
 */
export function createTextractExtractor(deps: TextractExtractorDeps): Extractor {
  return {
    engine: TEXTRACT_ENGINE,
    async extract(input: ExtractorInput, options?: ExtractorOptions): Promise<ExtractionResult> {
      const threshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
      const sourceDocument =
        input.sourceDocument ?? options?.defaultSourceDocument ?? "documento";
      const warnings: string[] = [];

      // 1. OCR bruto.
      const raw = await deps.rawOcr(input);
      const text = raw.fullText ?? "";
      if (raw.lines.length === 0) {
        warnings.push("OCR bruto não retornou linhas: documento possivelmente ilegível.");
      }

      // 2. Mapeamento determinístico.
      const fields: OcrField[] = extractDeterministicFields(
        text,
        raw.lines,
        sourceDocument,
        threshold,
      );

      // 3. Reforço LLM só no que sobrou (layout bagunçado), se habilitado.
      const enableLlm = options?.enableLlmReinforcement && !!deps.reinforce;
      if (enableLlm && deps.reinforce) {
        const captured = new Set(fields.map((f) => f.key.replace(/_\d+$/, "")));
        const requested = input.expectedFields?.length ? input.expectedFields : REINFORCEABLE_KEYS;
        const missing = requested.filter((k) => !captured.has(k));
        if (missing.length > 0) {
          try {
            const llmFields = await deps.reinforce({ text, missingKeys: missing, sourceDocument });
            for (const lf of llmFields) {
              const confidence = round2(Math.max(0, Math.min(1, lf.confidence)) * LLM_CONFIDENCE_WEIGHT);
              const belowThreshold = confidence < threshold;
              fields.push({
                key: lf.key,
                value: lf.value,
                confidence,
                sourceDocument,
                method: "llm",
                needsReview: belowThreshold,
                reviewReason: belowThreshold ? "confiança abaixo do limiar (reforço LLM)" : undefined,
              });
            }
          } catch (e) {
            warnings.push(`Reforço LLM pulado: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // Agregado: média das confianças dos campos; sem campos, média das linhas.
      let confidenceOverall: number;
      if (fields.length > 0) {
        confidenceOverall = round2(
          fields.reduce((a, f) => a + f.confidence, 0) / fields.length,
        );
      } else if (raw.lines.length > 0) {
        confidenceOverall = round2(
          raw.lines.reduce((a, l) => a + (Number.isFinite(l.confidence) ? l.confidence : 0), 0) /
            raw.lines.length,
        );
      } else {
        confidenceOverall = 0;
      }

      return { text, fields, confidenceOverall, engine: TEXTRACT_ENGINE, warnings };
    },
  };
}
