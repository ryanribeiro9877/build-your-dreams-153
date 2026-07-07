import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type IntentCategory, mentionsAttachments, normalizeIntent, routePathFor, shouldClassify,
} from "./intentClassifier.ts";

// ─── normalizeIntent: assimetria dupla (default seguro = NEGOCIO_COM_INSUMO) ──
Deno.test("normalizeIntent: TRIVIAL explícito", () => {
  assertEquals(normalizeIntent("TRIVIAL"), "TRIVIAL");
  assertEquals(normalizeIntent(" trivial "), "TRIVIAL");
});
Deno.test("normalizeIntent: SEM_INSUMO explícito (variações)", () => {
  assertEquals(normalizeIntent("NEGOCIO_SEM_INSUMO"), "NEGOCIO_SEM_INSUMO");
  assertEquals(normalizeIntent("negócio_sem_insumo"), "NEGOCIO_SEM_INSUMO");
  assertEquals(normalizeIntent("SEM_INSUMO"), "NEGOCIO_SEM_INSUMO");
});
Deno.test("normalizeIntent: COM_INSUMO explícito", () => {
  assertEquals(normalizeIntent("NEGOCIO_COM_INSUMO"), "NEGOCIO_COM_INSUMO");
});
Deno.test("normalizeIntent: CONSULTA explícito (AGT-CONSULTA)", () => {
  assertEquals(normalizeIntent("CONSULTA"), "CONSULTA");
  assertEquals(normalizeIntent(" consulta "), "CONSULTA");
});
Deno.test("normalizeIntent: ACAO_COM_TOOL explícito (variações + acento)", () => {
  assertEquals(normalizeIntent("ACAO_COM_TOOL"), "ACAO_COM_TOOL");
  assertEquals(normalizeIntent("AÇÃO_COM_TOOL"), "ACAO_COM_TOOL");
  assertEquals(normalizeIntent(" acao "), "ACAO_COM_TOOL");
  assertEquals(normalizeIntent("AÇÃO"), "ACAO_COM_TOOL");
});
Deno.test("normalizeIntent: desconhecido/vazio/nulo → COM_INSUMO (gerar; nunca TRIVIAL nem bloqueio)", () => {
  const casos: (string | null | undefined)[] = ["", null, undefined, "talvez", "INCERTO", "NEGOCIO", "{quebrado"];
  for (const c of casos) {
    const r: IntentCategory = normalizeIntent(c);
    assertEquals(r, "NEGOCIO_COM_INSUMO");
  }
});

// ─── routePathFor: mapeamento categoria → caminho de auditoria ───────────────
// CONSULTA mantém "consulta" (loop de leitura síncrono no START, preservado);
// ACAO_COM_TOOL vai por "full" (cadeia com N3+tools, caminho curto no processStep).
Deno.test("routePathFor: cada categoria tem seu caminho", () => {
  assertEquals(routePathFor("TRIVIAL"), "fast");
  assertEquals(routePathFor("CONSULTA"), "consulta");
  assertEquals(routePathFor("NEGOCIO_SEM_INSUMO"), "need_info");
  assertEquals(routePathFor("NEGOCIO_COM_INSUMO"), "full");
  assertEquals(routePathFor("ACAO_COM_TOOL"), "full");
});

// ─── mentionsAttachments: marcador de anexos do front ────────────────────────
Deno.test("mentionsAttachments: detecta marcador de anexos", () => {
  assertEquals(mentionsAttachments("gere uma peça [Arquivos: foto.png]"), true);
  assertEquals(mentionsAttachments("[Arquivo: contrato.pdf]"), true);
  assertEquals(mentionsAttachments("oi, tudo bem?"), false);
});

// ─── shouldClassify: só libera a chamada do classificador ────────────────────
Deno.test("shouldClassify: mensagem normal é classificável", () => {
  assertEquals(shouldClassify("gere uma peça", { enabled: true, maxChars: 500 }), true);
});
Deno.test("shouldClassify: flag OFF nunca classifica (→ cadeia completa)", () => {
  assertEquals(shouldClassify("oi", { enabled: false, maxChars: 500 }), false);
});
Deno.test("shouldClassify: vazio não é classificável", () => {
  assertEquals(shouldClassify("   ", { enabled: true, maxChars: 500 }), false);
});
Deno.test("shouldClassify: mensagem longa vai direto à cadeia completa (gerar)", () => {
  assertEquals(shouldClassify("a".repeat(600), { enabled: true, maxChars: 500 }), false);
});
