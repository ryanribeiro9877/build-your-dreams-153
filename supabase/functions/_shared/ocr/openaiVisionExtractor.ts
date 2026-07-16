// supabase/functions/_shared/ocr/openaiVisionExtractor.ts
//
// Extrator baseado em VISÃO (OpenAI Vision) — alternativa ao Textract quando não
// há credencial AWS no projeto. Segue o MESMO contrato/estratégia do
// `textractExtractor`:
//   1. OCR bruto = o modelo de visão da OpenAI transcreve a imagem (texto cru).
//   2. Mapeamento DETERMINÍSTICO primeiro (CPF com dígito verificador, data/RG/
//      CEP por regex) — a regra vence a inferência do modelo nesses campos.
//   3. Campos ESTRUTURADOS que a visão leu (nome/filiação/órgão emissor/…) só
//      entram para as chaves que a regra NÃO capturou, com confiança temperada.
// Cada OcrField sai com `confidence`, `sourceDocument`, `needsReview`. Assim o
// consumidor nunca afirma PII incerta como fato (filosofia anti-ALERTA-1).
//
// REGRA DURA (herdada do reforço LLM): vai a OpenAI DIRETO. `assertOpenAiDirect`
// recusa qualquer modelo com "/" (rota OpenRouter, trajeto opaco — dossiê D3).
//
// PII: diferente do reforço de texto (que manda só o TEXTO), aqui a IMAGEM vai à
// OpenAI. Esse trânsito de PII a terceiro só é permitido com o gate de OCR
// aberto (OCR_ENABLED) — o registry é quem controla isso.

import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  type Extractor,
  type ExtractionResult,
  type ExtractorInput,
  type ExtractorOptions,
  type OcrField,
} from "./types.ts";
import { extractDeterministicFields } from "./deterministic.ts";
import { assertOpenAiDirect } from "./llmReinforcement.ts";

export const OPENAI_VISION_ENGINE = "openai-vision";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 60_000;
// Confiança da visão é temperada: inferência do modelo < regra determinística.
const LLM_CONFIDENCE_WEIGHT = 0.7;

// Chaves que a visão pode devolver (1:1 com colunas do cadastro que o consumidor
// sabe aplicar). Qualquer chave fora desta lista é ignorada.
const VISION_FIELD_KEYS = [
  "full_name", "cpf", "rg", "rg_issuer", "rg_uf", "birth_date",
  "mother_name", "father_name", "nationality", "gender", "marital_status",
  "cep", "address", "city", "state",
];

const VISION_PROMPT =
  "Você é um OCR de documentos brasileiros (RG, CPF, CNH, comprovantes). Analise " +
  "a IMAGEM e responda SOMENTE em JSON, sem texto fora do JSON, no formato:\n" +
  '{"text":"<transcrição LITERAL de todo o texto visível, linha a linha>",' +
  '"fields":[{"key":"<chave>","value":"<valor>","confidence":<número 0..1>}]}\n' +
  "Chaves permitidas em fields: full_name, cpf, rg, rg_issuer (órgão emissor, ex.: " +
  "SSP/MG), rg_uf, birth_date (dd/mm/aaaa), mother_name, father_name, nationality, " +
  "gender (masculino/feminino), marital_status, cep, address, city, state.\n" +
  "Regras: transcreva EXATAMENTE o que lê (não corrija, não complete). Só inclua um " +
  "campo se conseguir LER com clareza; confidence reflete SUA certeza real. NUNCA " +
  "invente valores — prefira omitir a chutar. Datas em dd/mm/aaaa. CPF e RG com a " +
  "pontuação como aparecem. Se a imagem não for um documento legível, devolva text " +
  "com o que houver e fields vazio.";

/** Resultado bruto de uma chamada de visão (trocável para teste). */
interface VisionRawResult {
  text: string;
  fields: Array<{ key: string; value: string; confidence: number }>;
  usage?: { inputTokens: number; outputTokens: number };
}

/** Função de visão injetável (default = OpenAI). Recebe binário + prompt. */
export type VisionCallFn = (input: {
  bytes: Uint8Array;
  mimeType?: string;
  prompt: string;
}) => Promise<VisionRawResult>;

interface OpenAiVisionDeps {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Injetável para teste; default = chamada OpenAI real. */
  call?: VisionCallFn;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/** base64 em blocos (evita estourar a pilha com imagens grandes). */
function base64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Cria a função de visão ligada à OpenAI DIRETO. Pede JSON estrito. */
function makeOpenAiVisionCall(deps: OpenAiVisionDeps): VisionCallFn {
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async ({ bytes, mimeType, prompt }): Promise<VisionRawResult> => {
    const dataUrl = `data:${mimeType || "image/png"};base64,${base64(bytes)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await doFetch(OPENAI_ENDPOINT, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deps.apiKey}`,
        },
        body: JSON.stringify({
          model: deps.model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          }],
          response_format: { type: "json_object" },
          max_completion_tokens: 2000,
        }),
      });
      if (!resp.ok) {
        throw new Error(`OpenAI Vision ${resp.status}: ${await resp.text()}`);
      }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content ?? "{}";
      let parsed: { text?: unknown; fields?: unknown } = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = {};
      }
      const text = typeof parsed?.text === "string" ? parsed.text : "";
      const rawFields = Array.isArray(parsed?.fields) ? parsed.fields : [];
      const fields = rawFields
        .filter((f): f is { key: string; value: unknown; confidence: unknown } =>
          !!f && typeof f.key === "string" && f.value != null)
        .map((f) => ({
          key: f.key,
          value: String(f.value),
          confidence: clamp01(Number(f.confidence)),
        }));
      const u = data?.usage ?? {};
      return {
        text,
        fields,
        usage: {
          inputTokens: Number(u.prompt_tokens) || 0,
          outputTokens: Number(u.completion_tokens) || 0,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Constrói o extrator OpenAI Vision. Satisfaz a interface `Extractor` e é
 * selecionado por `OCR_ENGINE=openai-vision` (ver ./registry.ts).
 */
export function createOpenAiVisionExtractor(deps: OpenAiVisionDeps): Extractor {
  assertOpenAiDirect(deps.model); // recusa modelo com "/" (OpenRouter)
  const call = deps.call ?? makeOpenAiVisionCall(deps);

  return {
    engine: OPENAI_VISION_ENGINE,
    async extract(input: ExtractorInput, options?: ExtractorOptions): Promise<ExtractionResult> {
      const threshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
      const sourceDocument =
        input.sourceDocument ?? options?.defaultSourceDocument ?? "documento";
      const warnings: string[] = [];

      // 1. OCR bruto (visão).
      const raw = await call({ bytes: input.bytes, mimeType: input.mimeType, prompt: VISION_PROMPT });
      const text = raw.text ?? "";
      if (!text.trim()) warnings.push("Visão não retornou transcrição.");

      // A visão não dá confiança por linha; usamos uma confiança de linha uniforme
      // e razoável para o mapeamento determinístico herdar. O dígito verificador do
      // CPF ainda derruba a confiança de CPFs inválidos, independentemente disso.
      const lines = text
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => ({ text: t, confidence: 0.92 }));

      // 2. Mapeamento determinístico sobre a transcrição.
      const detFields = extractDeterministicFields(text, lines, sourceDocument, threshold);
      const detKeys = new Set(detFields.map((f) => f.key.replace(/_\d+$/, "")));

      // 3. Campos estruturados da visão — só para chaves que a regra NÃO pegou.
      const visionFields: OcrField[] = [];
      const seenVision = new Set<string>();
      for (const vf of raw.fields) {
        if (!VISION_FIELD_KEYS.includes(vf.key)) continue;
        if (detKeys.has(vf.key) || seenVision.has(vf.key)) continue; // regra vence; sem duplicar
        const value = (vf.value || "").trim();
        if (!value) continue;
        seenVision.add(vf.key);
        const confidence = round2(clamp01(vf.confidence) * LLM_CONFIDENCE_WEIGHT);
        const below = confidence < threshold;
        visionFields.push({
          key: vf.key,
          value,
          confidence,
          sourceDocument,
          method: "llm",
          needsReview: below,
          reviewReason: below ? "confiança abaixo do limiar (visão)" : undefined,
        });
      }

      const fields = [...detFields, ...visionFields];
      const confidenceOverall = fields.length > 0
        ? round2(fields.reduce((a, f) => a + f.confidence, 0) / fields.length)
        : 0;

      const result: ExtractionResult = {
        text,
        fields,
        confidenceOverall,
        engine: OPENAI_VISION_ENGINE,
        warnings,
      };
      if (raw.usage) {
        result.usage = {
          inputTokens: raw.usage.inputTokens,
          outputTokens: raw.usage.outputTokens,
          model: deps.model,
        };
      }
      return result;
    },
  };
}
