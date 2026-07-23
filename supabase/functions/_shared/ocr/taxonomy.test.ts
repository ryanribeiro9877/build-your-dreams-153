import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  DOC_TYPES, DOC_TYPE_LABELS, DOC_TYPE_DESCRIPTIONS, DOC_TYPE_TO_DOCUMENT_TYPE,
  IDENTITY_DOC_TYPES, docTypeToDocumentType, docTypePromptList,
} from "./taxonomy.ts";

Deno.test("taxonomia inclui os tipos novos do briefing", () => {
  for (const t of ["declaracao_hipossuficiencia", "contrato_honorarios", "termo_cooperado", "ficha_cadastral", "sentenca", "peticao"]) {
    assert((DOC_TYPES as readonly string[]).includes(t), `faltou ${t}`);
  }
});

Deno.test("todo doc_type tem label, descrição e mapeamento", () => {
  for (const t of DOC_TYPES) {
    assert(DOC_TYPE_LABELS[t], `sem label: ${t}`);
    assert(DOC_TYPE_DESCRIPTIONS[t], `sem descrição: ${t}`);
    assert(DOC_TYPE_TO_DOCUMENT_TYPE[t], `sem document_type: ${t}`);
  }
});

Deno.test("docTypeToDocumentType casa com o vocabulário do checklist", () => {
  assertEquals(docTypeToDocumentType("identidade"), "rg");
  assertEquals(docTypeToDocumentType("cnh"), "rg");
  assertEquals(docTypeToDocumentType("comprovante_residencia"), "comprovante");
  assertEquals(docTypeToDocumentType("procuracao"), "procuracao");
  assertEquals(docTypeToDocumentType("contrato_honorarios"), "contrato_honorarios");
  assertEquals(docTypeToDocumentType("declaracao_hipossuficiencia"), "declaracao_hipossuficiencia");
  assertEquals(docTypeToDocumentType("termo_cooperado"), "termo_cooperado");
  assertEquals(docTypeToDocumentType("peticao"), "peticao_inicial");
  assertEquals(docTypeToDocumentType("sentenca"), "sentenca");
  assertEquals(docTypeToDocumentType("ficha_cadastral"), "ficha_cadastral");
});

Deno.test("docTypeToDocumentType: desconhecido/vazio → outro", () => {
  assertEquals(docTypeToDocumentType("xpto"), "outro");
  assertEquals(docTypeToDocumentType(null), "outro");
  assertEquals(docTypeToDocumentType(undefined), "outro");
});

Deno.test("IDENTITY_DOC_TYPES = identidade + cnh; prompt lista os tipos", () => {
  assert(IDENTITY_DOC_TYPES.has("identidade") && IDENTITY_DOC_TYPES.has("cnh"));
  assert(!IDENTITY_DOC_TYPES.has("procuracao"));
  const list = docTypePromptList();
  assert(list.includes("procuracao") && list.includes("sentenca (") && list.includes("outro"));
});
