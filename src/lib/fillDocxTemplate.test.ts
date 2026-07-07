import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { fillDocumentXml, fillDocxTemplate, DOCX_MIME } from "./fillDocxTemplate";

// Uma run de texto OOXML.
const wt = (text: string) => `<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs: string[]) => `<w:p>${runs.join("")}</w:p>`;

// document.xml mínimo, com placeholder CONTÍGUO e placeholder FATIADO entre runs.
function makeDocXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    para(wt("Outorgante: "), wt("{{nome}}"), wt(", CPF "), wt("{{cpf}}"), wt(".")) +
    // placeholder fatiado: "{{", "cidade", "_uf", "}}" em runs separadas
    para(wt("Cidade: "), wt("{{"), wt("cidade"), wt("_uf"), wt("}}"), wt(".")) +
    // placeholder sem valor -> [A PREENCHER]
    para(wt("Estado civil: "), wt("{{estado_civil}}")) +
    `<w:sectPr/></w:body></w:document>`
  );
}

// docx mínimo válido (zip) com só as partes essenciais + document.xml acima.
async function makeTemplateBytes(docXml = makeDocXml()): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
  );
  zip.file("word/document.xml", docXml);
  return zip.generateAsync({ type: "uint8array" });
}

describe("fillDocumentXml — substituição de placeholders", () => {
  it("substitui placeholder contíguo pelo valor exato (escapado)", () => {
    const xml = para(wt("{{nome}}"));
    const r = fillDocumentXml(xml, { nome: "MARIA & CIA <ltda>" });
    expect(r.count).toBe(1);
    expect(r.xml).toContain("MARIA &amp; CIA &lt;ltda&gt;"); // XML-escapado
    expect(r.xml).not.toContain("{{");
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it("preenche placeholder FATIADO entre várias runs", () => {
    const xml = para(wt("{{"), wt("cidade"), wt("_uf"), wt("}}"));
    const r = fillDocumentXml(xml, { cidade_uf: "Salvador/BA" });
    expect(r.count).toBe(1);
    expect(r.xml).toContain("Salvador/BA");
    expect(r.xml).not.toContain("{{");
    expect(r.xml).not.toContain("}}");
  });

  it("dado ausente vira [A PREENCHER: chave], nunca lacuna silenciosa", () => {
    const xml = para(wt("{{estado_civil}}"));
    const r = fillDocumentXml(xml, { estado_civil: "" });
    expect(r.xml).toContain("[A PREENCHER: estado_civil]");
    expect(r.missing).toContain("estado_civil");
  });

  it("placeholder não mapeado também vira [A PREENCHER] e entra em unknown", () => {
    const xml = para(wt("{{campo_novo}}"));
    const r = fillDocumentXml(xml, { nome: "x" });
    expect(r.xml).toContain("[A PREENCHER: campo_novo]");
    expect(r.unknown).toContain("campo_novo");
  });

  it("null e undefined também são tratados como ausentes", () => {
    const xml = para(wt("{{a}}"), wt("{{b}}"));
    const r = fillDocumentXml(xml, { a: null, b: undefined });
    expect(r.missing.sort()).toEqual(["a", "b"]);
  });

  it("preserva o texto ao redor do placeholder na mesma run", () => {
    const xml = para(wt("CPF nº {{cpf}}, portador"));
    const r = fillDocumentXml(xml, { cpf: "084.822.105-21" });
    expect(r.xml).toContain("CPF nº 084.822.105-21, portador");
  });
});

describe("fillDocxTemplate — template intacto + reabre como docx", () => {
  it("preenche document.xml e devolve zip válido com as partes essenciais", async () => {
    const bytes = await makeTemplateBytes();
    const out = await fillDocxTemplate(bytes, { nome: "MARIA SILVA", cpf: "084.822.105-21", cidade_uf: "Salvador/BA" });
    expect(out.count).toBe(4); // nome, cpf, cidade_uf, estado_civil
    expect(out.unknown).toContain("estado_civil"); // não mapeado -> [A PREENCHER]

    const zip = await JSZip.loadAsync(out.bytes);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("MARIA SILVA");
    expect(doc).toContain("084.822.105-21");
    expect(doc).toContain("Salvador/BA");
    expect(doc).toContain("[A PREENCHER: estado_civil]");
    expect(doc).not.toContain("{{");
    // partes essenciais preservadas
    expect(zip.file("[Content_Types].xml")).toBeTruthy();
    expect(zip.file("_rels/.rels")).toBeTruthy();
  });

  it("não altera partes sem placeholders (idempotência de bytes lógicos)", async () => {
    const bytes = await makeTemplateBytes();
    const relsBefore = await (await JSZip.loadAsync(bytes)).file("_rels/.rels")!.async("string");
    const out = await fillDocxTemplate(bytes, { nome: "X", cpf: "Y", cidade_uf: "Z", estado_civil: "W" });
    const relsAfter = await (await JSZip.loadAsync(out.bytes)).file("_rels/.rels")!.async("string");
    expect(relsAfter).toBe(relsBefore);
  });

  it("mime de saída é o do docx", async () => {
    expect(DOCX_MIME).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("template sem word/document.xml é rejeitado", async () => {
    const zip = new JSZip();
    zip.file("word/header1.xml", "<w:hdr/>");
    const bad = await zip.generateAsync({ type: "uint8array" });
    await expect(fillDocxTemplate(bad, {})).rejects.toThrow(/document\.xml/);
  });
});
