// supabase/functions/_shared/transcription/openaiWhisper.ts
//
// Transcritor real via OpenAI Whisper (espelho do `_shared/ocr/llmReinforcement.ts`).
//
// REGRA DURA (governança PII): vai a OpenAI DIRETO. O provider é derivado do
// formato do model_id (com "/" → OpenRouter; sem "/" → OpenAI). OpenRouter é
// trajeto opaco (reencaminha a sub-provedores) e está PROIBIDO para transcrição
// de atendimento — PII sensível. `assertOpenAiDirect` recusa qualquer modelo
// que roteie para OpenRouter. O endpoint é o de áudio do OpenAI, fixo.

import type { Transcriber, TranscriberInput, TranscriptionResult } from "./types.ts";

const WHISPER_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-1";
const DEFAULT_TIMEOUT_MS = 60_000; // áudio de ~10 min por bloco

export const OPENAI_WHISPER_ENGINE = "openai-whisper";

/**
 * Garante que o modelo vai para OpenAI DIRETO. Um "/" no id rotearia para
 * OpenRouter (mesma derivação `providerFromModel` do resto do repo). Lança se
 * o modelo não for OpenAI-direto ou for vazio.
 */
export function assertOpenAiDirect(model: string): void {
  if (!model || !model.trim()) {
    throw new Error("TRANSCRIPTION_MODEL vazio: defina um modelo OpenAI direto (sem barra).");
  }
  if (model.includes("/")) {
    throw new Error(
      `Transcrição proibida via OpenRouter (modelo "${model}" contém "/"). ` +
        "Use um modelo OpenAI DIRETO, sem barra (PII sensível — Whisper direto).",
    );
  }
}

/** Extensão de arquivo a partir do MIME (Whisper usa a extensão para decodificar). */
function extFromMime(mime?: string): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "webm";
}

interface OpenAiWhisperDeps {
  apiKey: string;
  /** Modelo Whisper; default "whisper-1". Deve ser OpenAI-direto (sem barra). */
  model?: string;
  timeoutMs?: number;
  /** Injetável para teste; default = fetch global. */
  fetchImpl?: typeof fetch;
}

/**
 * Cria um Transcriber que chama a OpenAI Whisper DIRETO. Envia o áudio como
 * multipart/form-data e pede `response_format=text` (corpo = texto puro).
 * Nunca vai a OpenRouter (assertOpenAiDirect).
 */
export function createOpenAiWhisper(deps: OpenAiWhisperDeps): Transcriber {
  const model = deps.model ?? DEFAULT_MODEL;
  assertOpenAiDirect(model);
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    engine: OPENAI_WHISPER_ENGINE,
    async transcribe(input: TranscriberInput): Promise<TranscriptionResult> {
      const ext = extFromMime(input.mimeType);
      const blob = new Blob([input.bytes], { type: input.mimeType || "audio/webm" });
      const form = new FormData();
      // Nome com extensão reconhecível é obrigatório para o Whisper decodificar.
      form.append("file", blob, `audio.${ext}`);
      form.append("model", model);
      form.append("response_format", "text");
      if (input.language) form.append("language", input.language);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        // Sem Content-Type manual: o fetch define o boundary do multipart.
        const resp = await doFetch(WHISPER_ENDPOINT, {
          method: "POST",
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${deps.apiKey}` },
          body: form,
        });
        if (!resp.ok) {
          throw new Error(`OpenAI Whisper ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
        }
        const text = (await resp.text()).trim();
        return { text, engine: OPENAI_WHISPER_ENGINE };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
