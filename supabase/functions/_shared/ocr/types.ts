// supabase/functions/_shared/ocr/types.ts
//
// Contrato do OCR (interface `Extractor`) — Briefing 1/Briefing 2.
//
// Este arquivo define o CONTRATO que todo extrator implementa, para que o
// binário de OCR bruto (AWS Textract, Vision, Tesseract, …) fique atrás de
// uma interface trocável. O `textractExtractor` (ver ./textractExtractor.ts)
// é a primeira implementação concreta.
//
// Princípio central (anti-ALERTA-1): CADA campo carrega `confidence` e
// `sourceDocument`. Valor incerto (abaixo do limiar) ou com atribuição
// divergente NUNCA é afirmado como fato — vira `[A PREENCHER]`/`[REVISAR]`
// para o consumidor do texto. Ver ./merge.ts para a regra de divergência
// entre documentos.

/** Limiar de confiança default (§3 do briefing). Configurável via OcrEngineOptions. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

/** Como um campo foi mapeado a partir do texto cru. */
export type FieldMethod =
  | "deterministic" // regra + validação (ex.: CPF com dígito verificador)
  | "regex" // regex sem validação semântica (data, RG, CEP)
  | "llm"; // passe de reforço (OpenAI direto) para layout bagunçado

/**
 * Um campo estruturado extraído do documento. A confiança e a atribuição
 * são obrigatórias — é o que teria evitado o ALERTA 1 (data atribuída à
 * autora quando o anexo era o RG do representante legal).
 */
export interface OcrField {
  /** Chave semântica do campo. Ex.: "cpf", "birth_date", "rg", "cep". */
  key: string;
  /** Valor capturado, normalizado (dígitos/format canônico quando aplicável). */
  value: string;
  /** Confiança agregada em [0,1] (legibilidade do OCR × certeza da regra). */
  confidence: number;
  /**
   * Atribuição de documento: de qual documento este campo veio.
   * Ex.: "RG_autora", "RG_representante_legal", "comprovante_residencia".
   * É a peça que permite sinalizar quando o dado vem de quem não se espera.
   */
  sourceDocument: string;
  /** Como o campo foi mapeado. */
  method: FieldMethod;
  /**
   * true quando o campo NÃO deve ser afirmado: confiança abaixo do limiar,
   * dígito verificador que não confere, ou atribuição divergente entre
   * documentos. O consumidor trata como `[A PREENCHER]` e sinaliza `[REVISAR]`.
   */
  needsReview: boolean;
  /** Motivo legível do review (para auditoria e para o texto de saída). */
  reviewReason?: string;
}

/** Uma linha de texto cru vinda do OCR bruto, com confiança normalizada [0,1]. */
export interface OcrLine {
  text: string;
  confidence: number; // 0..1 (Textract devolve 0..100; normalizamos aqui)
}

/** Saída do OCR bruto (Textract DetectDocumentText, ou equivalente trocável). */
export interface RawOcrResult {
  /** Texto cru concatenado, na ordem de leitura. */
  fullText: string;
  /** Linhas individuais com confiança — insumo para a confiança por campo. */
  lines: OcrLine[];
}

/** Entrada do extrator: o binário da imagem + atribuição/pistas opcionais. */
export interface ExtractorInput {
  /** Binário da imagem. */
  bytes: Uint8Array;
  /** MIME (ex.: "image/png"); opcional, informativo. */
  mimeType?: string;
  /**
   * Rótulo do documento, definido por quem chama (ex.: "RG_autora").
   * Vira o `sourceDocument` de todos os campos deste documento. Se ausente,
   * usa-se `defaultSourceDocument` das opções, ou "documento".
   */
  sourceDocument?: string;
  /** Campos que o chamador espera (pista para o passe de reforço LLM). */
  expectedFields?: string[];
}

/** Resultado final: texto cru + campos com confiança + atribuição + agregado. */
export interface ExtractionResult {
  /** Texto cru de alta fidelidade (fonte da verdade; nunca inventado). */
  text: string;
  /** Campos estruturados, cada um com confiança e atribuição. */
  fields: OcrField[];
  /** Confiança agregada do documento em [0,1]. */
  confidenceOverall: number;
  /** Identificador do motor. Ex.: "textract+map". */
  engine: string;
  /** Avisos não-fatais (ex.: "OCR bruto sem linhas", "reforço LLM pulado"). */
  warnings: string[];
  /**
   * Uso de tokens do provedor, quando o motor é baseado em LLM (ex.: OpenAI
   * Vision). OPCIONAL e aditivo — extratores sem custo de LLM (stub) ou cujo
   * custo não é medido aqui (Textack bruto) simplesmente não o setam. O
   * consumidor usa para logar custo em `ai_generations`.
   */
  usage?: { inputTokens: number; outputTokens: number; model: string };
}

/** Opções de execução do extrator. */
export interface ExtractorOptions {
  /** Limiar de confiança; default DEFAULT_CONFIDENCE_THRESHOLD (0.85). */
  confidenceThreshold?: number;
  /** Liga o passe de reforço LLM (OpenAI direto) para campos que a regra não pegou. */
  enableLlmReinforcement?: boolean;
  /** Atribuição default quando `input.sourceDocument` não é informado. */
  defaultSourceDocument?: string;
}

/**
 * Contrato do extrator. `textractExtractor` implementa esta interface e é
 * selecionado por `OCR_ENGINE` (ver ./registry.ts).
 */
export interface Extractor {
  /** Identificador do motor, ecoado em `ExtractionResult.engine`. */
  readonly engine: string;
  /** Extrai texto + campos de um único documento (imagem). */
  extract(input: ExtractorInput, options?: ExtractorOptions): Promise<ExtractionResult>;
}

/** Função de OCR bruto (trocável): binário → texto + linhas com confiança. */
export type RawOcrFn = (input: ExtractorInput) => Promise<RawOcrResult>;

/**
 * Passe de reforço por LLM (trocável). Recebe o TEXTO já extraído (nunca a
 * imagem) e as chaves que a regra determinística NÃO capturou; devolve campos
 * adicionais. Deve ir a OpenAI DIRETO — nunca OpenRouter (ver ./llmReinforcement.ts).
 */
export type LlmReinforcementFn = (args: {
  text: string;
  missingKeys: string[];
  sourceDocument: string;
}) => Promise<Array<{ key: string; value: string; confidence: number }>>;
