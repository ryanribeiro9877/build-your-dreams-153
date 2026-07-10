// supabase/functions/_shared/transcription/index.ts
//
// Ponto de entrada do módulo de transcrição. O consumidor (Edge Function
// `transcribe-attendance-audio`) importa daqui — `getTranscriber` é o ÚNICO
// seletor do módulo.

export * from "./types.ts";
export { stubTranscriber, STUB_ENGINE } from "./stubTranscriber.ts";
export { createOpenAiWhisper, assertOpenAiDirect, OPENAI_WHISPER_ENGINE } from "./openaiWhisper.ts";
export { getTranscriber } from "./registry.ts";
