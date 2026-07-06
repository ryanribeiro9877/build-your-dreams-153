import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { getExtractor } from "./registry.ts";
import { assertOpenAiDirect } from "./llmReinforcement.ts";
import { TEXTRACT_ENGINE } from "./textractExtractor.ts";

function secretsFrom(map: Record<string, string>) {
  return (key: string) => map[key] ?? null;
}

Deno.test("gate OFF (OCR_ENABLED != true) → null, mesmo com engine setado", async () => {
  const ext = await getExtractor(secretsFrom({ OCR_ENGINE: "textract" }));
  assertEquals(ext, null);
});

Deno.test("gate ON mas engine ausente/none → null", async () => {
  assertEquals(await getExtractor(secretsFrom({ OCR_ENABLED: "true" })), null);
  assertEquals(
    await getExtractor(secretsFrom({ OCR_ENABLED: "true", OCR_ENGINE: "none" })),
    null,
  );
});

Deno.test("OCR_ENGINE=stub (gate ON) → stubExtractor, sem exigir credencial AWS", async () => {
  const ext = await getExtractor(secretsFrom({ OCR_ENABLED: "true", OCR_ENGINE: "stub" }));
  assert(ext);
  assertEquals(ext!.engine, "stub");
  // Stub não lê o binário nem exige AWS: extrai texto sintético direto.
  const out = await ext!.extract({ bytes: new Uint8Array([1]), sourceDocument: "doc_teste" });
  assert(out.text.includes("doc_teste"));
  assertEquals(out.fields.length, 0);
});

Deno.test("OCR_ENGINE=textract com credenciais → extrator textract+map", async () => {
  const ext = await getExtractor(
    secretsFrom({
      OCR_ENABLED: "true",
      OCR_ENGINE: "textract",
      AWS_ACCESS_KEY_ID: "AKIAFAKE",
      AWS_SECRET_ACCESS_KEY: "secretfake",
      AWS_REGION: "sa-east-1",
    }),
  );
  assert(ext);
  assertEquals(ext!.engine, TEXTRACT_ENGINE);
});

Deno.test("textract sem credenciais AWS → erro claro", async () => {
  await assertRejects(
    () => getExtractor(secretsFrom({ OCR_ENABLED: "true", OCR_ENGINE: "textract" })),
    Error,
    "AWS_ACCESS_KEY_ID",
  );
});

Deno.test("região diferente de sa-east-1 → erro (residência em SP)", async () => {
  await assertRejects(
    () =>
      getExtractor(
        secretsFrom({
          OCR_ENABLED: "true",
          OCR_ENGINE: "textract",
          AWS_ACCESS_KEY_ID: "AKIAFAKE",
          AWS_SECRET_ACCESS_KEY: "secretfake",
          AWS_REGION: "us-east-1",
        }),
      ),
    Error,
    "sa-east-1",
  );
});

Deno.test("engine desconhecido → null (no-op), não lança", async () => {
  // Reconciliação: engine desconhecido não quebra o fluxo — devolve null e loga.
  const ext = await getExtractor(secretsFrom({ OCR_ENABLED: "true", OCR_ENGINE: "vision" }));
  assertEquals(ext, null);
});

Deno.test("reforço LLM: modelo OpenRouter (com barra) é recusado no registry", async () => {
  await assertRejects(
    () =>
      getExtractor(
        secretsFrom({
          OCR_ENABLED: "true",
          OCR_ENGINE: "textract",
          AWS_ACCESS_KEY_ID: "AKIAFAKE",
          AWS_SECRET_ACCESS_KEY: "secretfake",
          AWS_REGION: "sa-east-1",
          OCR_LLM_MODEL: "anthropic/claude-sonnet-5",
          OPENAI_API_KEY: "sk-fake",
        }),
      ),
    Error,
    "OpenRouter",
  );
});

// ── guarda OpenAI-direto isolada ──────────────────────────────────────────────
Deno.test("assertOpenAiDirect: aceita modelo sem barra, recusa com barra e vazio", () => {
  assertOpenAiDirect("gpt-4o-mini"); // não lança
  let threw = false;
  try {
    assertOpenAiDirect("openrouter/auto");
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
