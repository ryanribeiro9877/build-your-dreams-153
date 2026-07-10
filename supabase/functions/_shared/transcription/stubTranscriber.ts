// supabase/functions/_shared/transcription/stubTranscriber.ts
//
// Transcritor STUB (espelho do `_shared/ocr/stubExtractor.ts`). Devolve texto
// sintético e NÃO faz rede — existe só para exercitar o fluxo ponta-a-ponta
// (download dos blocos → transcribe → gravação de `transcricao_atendimento`)
// com a flag ligada em teste, sem gastar Whisper. Selecionado por
// `TRANSCRIPTION_ENGINE=stub` (ver ./registry.ts).

import type { Transcriber, TranscriberInput, TranscriptionResult } from "./types.ts";

export const STUB_ENGINE = "stub";

export const stubTranscriber: Transcriber = {
  engine: STUB_ENGINE,
  transcribe(input: TranscriberInput): Promise<TranscriptionResult> {
    const size = input.bytes?.byteLength ?? 0;
    const mime = input.mimeType ? `, ${input.mimeType}` : "";
    return Promise.resolve({
      text: `[TRANSCRIÇÃO STUB] conteúdo simulado do bloco de áudio (${size} bytes${mime}).`,
      engine: STUB_ENGINE,
    });
  },
};
