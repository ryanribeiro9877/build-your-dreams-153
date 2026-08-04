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

/**
 * Extensão do arquivo para o Whisper (ele usa a extensão para decodificar).
 *
 * O MIME NÃO é confiável: um `.ogg` anexado à mão chega com `file.type` vazio no
 * navegador, o front grava `mime_type = null` e aqui o fallback devolvia "webm" —
 * ou seja, bytes OGG rotulados como WebM, que é o caminho de falha que a correção
 * do áudio (A.8) existia para consertar. Por isso a extensão do NOME DO ARQUIVO tem
 * prioridade sobre o MIME, e o fallback "webm" só vale quando não há nenhum dos dois
 * (o áudio do microfone, que é sempre WebM de verdade).
 */
function extDoAudio(mime?: string, fileName?: string): string {
  const peloNome = /\.([a-z0-9]{2,5})$/i.exec((fileName ?? "").trim())?.[1]?.toLowerCase();
  const CONHECIDAS: Record<string, string> = {
    ogg: "ogg", oga: "ogg", opus: "ogg", webm: "webm",
    m4a: "m4a", mp4: "m4a", mp3: "mp3", mpga: "mp3", mpeg: "mp3",
    wav: "wav", flac: "flac",
  };
  if (peloNome && CONHECIDAS[peloNome]) return CONHECIDAS[peloNome];

  const m = (mime ?? "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("flac")) return "flac";
  return "webm";
}

/** MIME coerente com a extensão escolhida — o Blob não pode contradizer o nome. */
function mimeDaExt(ext: string): string {
  const MAPA: Record<string, string> = {
    ogg: "audio/ogg", webm: "audio/webm", m4a: "audio/mp4",
    mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac",
  };
  return MAPA[ext] ?? "audio/webm";
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
      const ext = extDoAudio(input.mimeType, input.fileName);
      // Cast puramente de tipo (runtime inalterado): sob libs de TS mais estritas,
      // Uint8Array<ArrayBufferLike> não casa com BlobPart (que exige ArrayBuffer,
      // não SharedArrayBuffer). Os bytes vêm sempre de um ArrayBuffer comum.
      // O type do Blob segue a EXTENSÃO escolhida, não o mimeType cru: se o nome diz
      // .ogg e o mime veio vazio, mandar "audio/webm" contradiz o nome do arquivo e o
      // Whisper falha na decodificação.
      const blob = new Blob([input.bytes as unknown as BlobPart], { type: mimeDaExt(ext) });
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
