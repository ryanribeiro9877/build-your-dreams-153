import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isAudioAttachment, isCaseDocumentAttachment } from "./caseDocFilter.ts";

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

/* ─── A.8 (teste A-05): o áudio precisa ser reconhecido ANTES da ingestão ───── */

Deno.test("áudio por MIME", () => {
  assertEquals(isAudioAttachment("audio/ogg"), true);
  assertEquals(isAudioAttachment("audio/webm;codecs=opus"), true);
  assertEquals(isAudioAttachment("AUDIO/MPEG"), true);
});

Deno.test("áudio por EXTENSÃO quando o mime vem vazio ou errado", () => {
  // O caso medido: .ogg anexado à mão, mime vazio → caía no ingestor de peça.
  assertEquals(isAudioAttachment(null, "autorizacao.ogg"), true);
  assertEquals(isAudioAttachment("", "autorizacao.oga"), true);
  assertEquals(isAudioAttachment("application/octet-stream", "voz.opus"), true);
  assertEquals(isAudioAttachment(null, "mensagem_de_voz.webm"), true);
  assertEquals(isAudioAttachment(null, "gravacao.m4a"), true);
  assertEquals(isAudioAttachment(null, "gravacao.MP3"), true);
  assertEquals(isAudioAttachment(null, "gravacao.wav"), true);
  assertEquals(isAudioAttachment(null, "gravacao.aac"), true);
  assertEquals(isAudioAttachment(null, "gravacao.amr"), true);
});

Deno.test("documento textual NÃO é confundido com áudio", () => {
  assertEquals(isAudioAttachment("application/pdf", "contrato.pdf"), false);
  assertEquals(isAudioAttachment(null, "extrato.pdf"), false);
  assertEquals(isAudioAttachment(null, "peca.docx"), false);
  // Nome que só CONTÉM "ogg" no meio não conta (a regra é a extensão final).
  assertEquals(isAudioAttachment(null, "logging.txt"), false);
  assertEquals(isAudioAttachment(null, ""), false);
  assertEquals(isAudioAttachment(null), false);
});

Deno.test("áudio reconhecido por extensão também sai dos documentos de caso", () => {
  assertEquals(isCaseDocumentAttachment(null, "autorizacao.ogg"), false);
  assertEquals(isCaseDocumentAttachment("application/pdf", "contrato.pdf"), true);
});
