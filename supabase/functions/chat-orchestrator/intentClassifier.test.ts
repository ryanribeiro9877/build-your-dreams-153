import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  eligibleForFastPath, mentionsAttachments, normalizeIntent,
} from "./intentClassifier.ts";

// ─── normalizeIntent: assimetria (só TRIVIAL explícito vira TRIVIAL) ─────────
Deno.test("normalizeIntent: TRIVIAL explícito", () => {
  assertEquals(normalizeIntent("TRIVIAL"), "TRIVIAL");
  assertEquals(normalizeIntent("trivial"), "TRIVIAL");
  assertEquals(normalizeIntent(" Trivial "), "TRIVIAL");
});
Deno.test("normalizeIntent: NEGOCIO explícito (com e sem acento)", () => {
  assertEquals(normalizeIntent("NEGOCIO"), "NEGOCIO");
  assertEquals(normalizeIntent("negócio"), "NEGOCIO");
});
Deno.test("normalizeIntent: desconhecido/vazio/nulo → INCERTO (nunca TRIVIAL)", () => {
  assertEquals(normalizeIntent("INCERTO"), "INCERTO");
  assertEquals(normalizeIntent(""), "INCERTO");
  assertEquals(normalizeIntent(null), "INCERTO");
  assertEquals(normalizeIntent(undefined), "INCERTO");
  assertEquals(normalizeIntent("talvez"), "INCERTO");
  assertEquals(normalizeIntent("{json quebrado"), "INCERTO");
});

// ─── mentionsAttachments: anexo é sinal de NEGÓCIO ───────────────────────────
Deno.test("mentionsAttachments: detecta marcador de anexos do front", () => {
  assertEquals(mentionsAttachments("bom dia [Arquivos: contrato.pdf]"), true);
  assertEquals(mentionsAttachments("[Arquivo: rg.jpg]"), true);
  assertEquals(mentionsAttachments("oi, tudo bem?"), false);
});

// ─── eligibleForFastPath: pré-filtro determinístico (só libera candidatura) ──
Deno.test("eligibleForFastPath: saudação curta é elegível", () => {
  assertEquals(eligibleForFastPath("bom dia", { enabled: true, maxChars: 500 }), true);
});
Deno.test("eligibleForFastPath: flag OFF nunca libera", () => {
  assertEquals(eligibleForFastPath("oi", { enabled: false, maxChars: 500 }), false);
});
Deno.test("eligibleForFastPath: vazio não é elegível", () => {
  assertEquals(eligibleForFastPath("   ", { enabled: true, maxChars: 500 }), false);
});
Deno.test("eligibleForFastPath: mensagem longa cai na cadeia completa", () => {
  const longa = "a".repeat(600);
  assertEquals(eligibleForFastPath(longa, { enabled: true, maxChars: 500 }), false);
});
Deno.test("eligibleForFastPath: com anexo cai na cadeia completa", () => {
  assertEquals(
    eligibleForFastPath("bom dia [Arquivos: peticao.pdf]", { enabled: true, maxChars: 500 }),
    false,
  );
});
