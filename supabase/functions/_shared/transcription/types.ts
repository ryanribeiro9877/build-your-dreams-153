// supabase/functions/_shared/transcription/types.ts
//
// Contrato de transcrição (interface `Transcriber`) — espelho de `_shared/ocr/`.
//
// Define o CONTRATO que todo transcritor implementa, para que o binário de
// speech-to-text (Whisper OpenAI, stub, …) fique atrás de uma interface
// trocável. `openaiWhisper` (ver ./openaiWhisper.ts) é a primeira implementação
// real; `stubTranscriber` (ver ./stubTranscriber.ts) exercita o fluxo sem rede.
//
// GOVERNANÇA: transcrição de atendimento é PII sensível → o motor real vai a
// OpenAI DIRETO (Whisper), nunca OpenRouter (ver assertOpenAiDirect em
// ./openaiWhisper.ts, espelho do `_shared/ocr/llmReinforcement.ts`).

/** Entrada do transcritor: o binário do áudio + pistas opcionais. */
export interface TranscriberInput {
  /** Binário do áudio (um bloco de gravação). */
  bytes: Uint8Array;
  /** MIME (ex.: "audio/webm"); opcional, define a extensão enviada ao Whisper. */
  mimeType?: string;
  /** Idioma (ISO-639-1, ex.: "pt") — melhora a acurácia. Opcional. */
  language?: string;
}

/** Resultado da transcrição de um bloco de áudio. */
export interface TranscriptionResult {
  /** Texto transcrito (fonte da verdade; nunca inventado). Pode vir vazio. */
  text: string;
  /** Identificador do motor. Ex.: "openai-whisper", "stub". */
  engine: string;
  /** Duração do áudio em segundos, quando o motor informa. Opcional. */
  durationSec?: number;
}

/**
 * Contrato do transcritor. `openaiWhisper` e `stubTranscriber` implementam esta
 * interface e são selecionados por `TRANSCRIPTION_ENGINE` (ver ./registry.ts).
 */
export interface Transcriber {
  /** Identificador do motor, ecoado em `TranscriptionResult.engine`. */
  readonly engine: string;
  /** Transcreve um único bloco de áudio. */
  transcribe(input: TranscriberInput): Promise<TranscriptionResult>;
}

/** Getter de secret trocável (env do edge ou chave BYOK resolvida). */
export type SecretGetter = (key: string) => Promise<string | null> | string | null;
