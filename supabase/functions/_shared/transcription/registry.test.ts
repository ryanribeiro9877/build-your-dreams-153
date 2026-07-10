import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { getTranscriber } from "./registry.ts";
import { assertOpenAiDirect, OPENAI_WHISPER_ENGINE } from "./openaiWhisper.ts";
import { STUB_ENGINE } from "./stubTranscriber.ts";

function secretsFrom(map: Record<string, string>) {
  return (key: string) => map[key] ?? null;
}

Deno.test("engine ausente → null (transcrição desligada)", async () => {
  assertEquals(await getTranscriber(secretsFrom({})), null);
});

Deno.test("engine none/off → null", async () => {
  assertEquals(await getTranscriber(secretsFrom({ TRANSCRIPTION_ENGINE: "none" })), null);
  assertEquals(await getTranscriber(secretsFrom({ TRANSCRIPTION_ENGINE: "off" })), null);
});

Deno.test("TRANSCRIPTION_ENGINE=stub → stubTranscriber, sem exigir chave", async () => {
  const t = await getTranscriber(secretsFrom({ TRANSCRIPTION_ENGINE: "stub" }));
  assert(t);
  assertEquals(t!.engine, STUB_ENGINE);
  const out = await t!.transcribe({ bytes: new Uint8Array([1]) });
  assert(out.text.length > 0);
});

Deno.test("openai sem chave → null (BYOK não resolvido)", async () => {
  assertEquals(await getTranscriber(secretsFrom({ TRANSCRIPTION_ENGINE: "openai" })), null);
});

Deno.test("openai com chave → transcritor Whisper", async () => {
  const t = await getTranscriber(
    secretsFrom({ TRANSCRIPTION_ENGINE: "openai", OPENAI_API_KEY: "sk-fake" }),
  );
  assert(t);
  assertEquals(t!.engine, OPENAI_WHISPER_ENGINE);
});

Deno.test("engine desconhecido → null (no-op), não lança", async () => {
  assertEquals(await getTranscriber(secretsFrom({ TRANSCRIPTION_ENGINE: "vosk" })), null);
});

Deno.test("modelo OpenRouter (com barra) é recusado no registry", async () => {
  await assertRejects(
    () =>
      getTranscriber(
        secretsFrom({
          TRANSCRIPTION_ENGINE: "openai",
          OPENAI_API_KEY: "sk-fake",
          TRANSCRIPTION_MODEL: "anthropic/claude",
        }),
      ),
    Error,
    "OpenRouter",
  );
});

// ── guarda OpenAI-direto isolada ──────────────────────────────────────────────
Deno.test("assertOpenAiDirect: aceita sem barra, recusa com barra e vazio", () => {
  assertOpenAiDirect("whisper-1"); // não lança
  let threw = false;
  try {
    assertOpenAiDirect("openrouter/whisper");
  } catch {
    threw = true;
  }
  assert(threw, "modelo com barra deve lançar");
  threw = false;
  try {
    assertOpenAiDirect("");
  } catch {
    threw = true;
  }
  assert(threw, "modelo vazio deve lançar");
});
