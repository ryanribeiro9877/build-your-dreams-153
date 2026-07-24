// Prova do PORTE Deno da engine do kit documental (Onda 2.3): JSZip via esm.sh
// carrega/gera um .docx no runtime Deno e o preenchedor puro (fillDocxTemplate)
// substitui {{placeholders}} — inclusive quando o Word FATIA o token entre runs.
// Não faz rede: monta o template em memória. Espelha a cobertura do vitest do
// front (src/lib/fillDocxTemplate.test.ts), garantindo paridade de comportamento.

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import JSZip from "https://esm.sh/jszip@3.10.1?no-dts";
import { fillDocxTemplate } from "./fillDocxTemplate.ts";
import { baseCooperadoValues, maskCpf, formatDateBr, renderCooperadoDoc, COOPERADO_DOC_DEFS } from "./cooperadoDocs.ts";
import { selectDocsToGenerate } from "./generate.ts";

// Constrói um .docx mínimo (zip com word/document.xml) a partir de um corpo XML.
async function makeDocx(bodyXml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${bodyXml}</w:body></w:document>`,
  );
  return await zip.generateAsync({ type: "uint8array" });
}

async function readDocumentXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return await zip.file("word/document.xml")!.async("string");
}

Deno.test("fillDocxTemplate: substitui placeholders simples e marca ausentes", async () => {
  const tpl = await makeDocx(
    "<w:p><w:r><w:t>Nome: {{nome}} CPF: {{cpf}} Cidade: {{cidade_uf}} Extra: {{inexistente}}</w:t></w:r></w:p>",
  );
  const r = await fillDocxTemplate(tpl, { nome: "Fulano de Tal", cpf: "111.222.333-44", cidade_uf: "Salvador/BA", vazio: "" });
  const xml = await readDocumentXml(r.bytes);
  assert(xml.includes("Nome: Fulano de Tal"), "nome preenchido");
  assert(xml.includes("CPF: 111.222.333-44"), "cpf preenchido");
  assert(xml.includes("Salvador/BA"), "cidade_uf preenchido");
  // placeholder não mapeado em values → [A PREENCHER] + em `unknown`.
  assert(xml.includes("[A PREENCHER: inexistente]"), "ausente marcado");
  assert(r.unknown.includes("inexistente"), "unknown reporta o não mapeado");
  assertEquals(r.count, 4);
});

Deno.test("fillDocxTemplate: preenche placeholder FATIADO entre runs (robustez OOXML)", async () => {
  // O Word costuma quebrar {{nome}} em runs separadas por causa da ortografia.
  const tpl = await makeDocx(
    "<w:p><w:r><w:t>Sr(a). {{</w:t></w:r><w:r><w:t>nome</w:t></w:r><w:r><w:t>}}, </w:t></w:r></w:p>",
  );
  const r = await fillDocxTemplate(tpl, { nome: "Maria Souza" });
  const xml = await readDocumentXml(r.bytes);
  assert(xml.includes("Maria Souza"), "placeholder fatiado foi preenchido");
  assert(!xml.includes("{{"), "não sobrou token cru");
  assertEquals(r.count, 1);
});

Deno.test("baseCooperadoValues: formatação determinística (CPF, data, cidade/uf)", () => {
  const now = new Date(Date.UTC(2026, 6, 23)); // 23/07/2026
  const v = baseCooperadoValues(
    { id: "x", full_name: "João", cpf: "12345678901", city: "Salvador", state: "BA" },
    { now },
  );
  assertEquals(v.nome, "João");
  assertEquals(v.cpf, "123.456.789-01");
  assertEquals(v.cidade_uf, "Salvador/BA");
  assertEquals(v.data, "23/07/2026");
  assertEquals(v.rg, null); // ausente → null (o preenchedor marca [A PREENCHER])
});

Deno.test("maskCpf / formatDateBr: casos de borda", () => {
  assertEquals(maskCpf(null), null);
  assertEquals(maskCpf("123"), "123"); // não tem 11 dígitos → devolve aparado
  assertEquals(formatDateBr("2026-05-14"), "14/05/2026"); // sem deslize de fuso
});

Deno.test("renderCooperadoDoc: preenche a partir da def + template", async () => {
  const def = COOPERADO_DOC_DEFS.find((d) => d.documentType === "procuracao")!;
  const tpl = await makeDocx("<w:p><w:r><w:t>Outorgante: {{nome}}, CPF {{cpf}}.</w:t></w:r></w:p>");
  const rendered = await renderCooperadoDoc(def, { id: "x", full_name: "Ana", cpf: "98765432100" }, tpl, {
    now: new Date(Date.UTC(2026, 6, 23)),
  });
  const xml = await readDocumentXml(rendered.bytes);
  assert(xml.includes("Outorgante: Ana, CPF 987.654.321-00."));
  assertEquals(rendered.def.documentType, "procuracao");
});

Deno.test("selectDocsToGenerate: idempotência (só gera os tipos que faltam)", () => {
  // já existem procuracao + contrato → faltam declaração e ficha.
  const faltam = selectDocsToGenerate(["procuracao", "contrato_honorarios"]);
  assertEquals(faltam.map((d) => d.documentType).sort(), ["declaracao_hipossuficiencia", "termo_cooperado"]);
  // todos já existem → nada a gerar.
  assertEquals(selectDocsToGenerate(COOPERADO_DOC_DEFS.map((d) => d.documentType)).length, 0);
});
