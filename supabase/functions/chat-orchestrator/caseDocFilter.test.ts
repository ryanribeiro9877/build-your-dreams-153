import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isCaseDocumentAttachment } from "./caseDocFilter.ts";

Deno.test("audio/* não é documento de caso (voz = comando)", () => {
  assertEquals(isCaseDocumentAttachment("audio/webm"), false);
  assertEquals(isCaseDocumentAttachment("audio/webm;codecs=opus"), false);
  assertEquals(isCaseDocumentAttachment("AUDIO/OGG"), false);
});

Deno.test("imagem/pdf/texto/nulo são documentos de caso", () => {
  assertEquals(isCaseDocumentAttachment("image/png"), true);
  assertEquals(isCaseDocumentAttachment("application/pdf"), true);
  assertEquals(isCaseDocumentAttachment("text/plain"), true);
  assertEquals(isCaseDocumentAttachment(null), true);
});
