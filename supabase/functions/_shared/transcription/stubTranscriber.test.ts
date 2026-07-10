import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { STUB_ENGINE, stubTranscriber } from "./stubTranscriber.ts";

Deno.test("stubTranscriber devolve texto sintético sem rede", async () => {
  const out = await stubTranscriber.transcribe({ bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/webm" });
  assertEquals(out.engine, STUB_ENGINE);
  assert(out.text.length > 0, "texto não pode ser vazio");
  assert(out.text.includes("STUB"), "texto do stub deve conter marcador STUB");
});

Deno.test("stubTranscriber não exige mimeType", async () => {
  const out = await stubTranscriber.transcribe({ bytes: new Uint8Array([9]) });
  assertEquals(out.engine, STUB_ENGINE);
  assert(out.text.length > 0);
});
