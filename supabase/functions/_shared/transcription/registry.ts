// supabase/functions/_shared/transcription/registry.ts
//
// Seleção do transcritor por `TRANSCRIPTION_ENGINE` — ÚNICO `getTranscriber`
// do módulo (espelho do `getExtractor` do OCR). Monta o transcritor a partir de
// SECRETS (nunca do código).
//
// ENGINES:
//   • "stub"                     → transcritor sintético (sem rede, sem chave).
//   • "openai" | "whisper"       → Whisper OpenAI DIRETO. Exige chave (BYOK,
//                                  resolvida pelo chamador via SecretGetter);
//                                  sem chave → null (desligado).
//   • ausente/none/off/desconhecido → null (transcrição desligada), com log no
//                                  caso de engine desconhecido.
//
// NOTA (cinto-e-suspensório): a flag dura `TRANSCRIPTION_ENABLED` (default OFF)
// vive na Edge Function (index.ts), como o `ocr_disabled` do `ocr-attachment`.
// Aqui o gate é o próprio engine (default sem valor → null). Dois interruptores
// independentes, ambos OFF por padrão.

import type { SecretGetter, Transcriber } from "./types.ts";
import { stubTranscriber } from "./stubTranscriber.ts";
import { assertOpenAiDirect, createOpenAiWhisper } from "./openaiWhisper.ts";

async function get(getSecret: SecretGetter, key: string): Promise<string | null> {
  const v = await getSecret(key);
  const s = (v ?? "").toString().trim();
  return s || null;
}

/**
 * Devolve o transcritor selecionado por TRANSCRIPTION_ENGINE, ou null quando a
 * transcrição está desligada (engine ausente/none/off), o engine é desconhecido
 * (com log), ou o engine "openai" está sem chave resolvida.
 */
export async function getTranscriber(getSecret: SecretGetter): Promise<Transcriber | null> {
  const engine = ((await get(getSecret, "TRANSCRIPTION_ENGINE")) ?? "").toLowerCase();
  if (!engine || engine === "none" || engine === "off") return null;

  if (engine === "stub") {
    // Stub: texto sintético, sem dependência externa (nem chave). Só para teste.
    return stubTranscriber;
  }

  if (engine === "openai" || engine === "whisper" || engine === "openai-whisper") {
    // Chave via BYOK (llm_provider_configs + get_provider_key_decrypted),
    // resolvida pelo chamador e entregue como OPENAI_API_KEY no SecretGetter.
    const apiKey = await get(getSecret, "OPENAI_API_KEY");
    if (!apiKey) return null; // sem chave → transcrição desligada (não quebra o fluxo)
    const model = (await get(getSecret, "TRANSCRIPTION_MODEL")) ?? "whisper-1";
    assertOpenAiDirect(model); // recusa modelo com "/" (OpenRouter) — não silencia config inválida
    return createOpenAiWhisper({ apiKey, model });
  }

  console.warn(
    `[transcription] TRANSCRIPTION_ENGINE desconhecido: "${engine}". Suportado: "stub", "openai".`,
  );
  return null;
}
