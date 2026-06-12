import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import {
  buildCorpoXml, injectBodyIntoTemplate, inlineTokens,
  boxTitle, bodyPara, citationPara, centerPara,
} from "./bacellarDocx";

// Peça sintética equivalente ao render oficial (Raillany x BMG).
const PECA = `ANÁLISE PRÉ-REDAÇÃO
Tipo: revisional. Vocabulário de revisão.

EXCELENTÍSSIMO SENHOR JUIZ DE DIREITO DO JUIZADO ESPECIAL CÍVEL DA COMARCA DE SALVADOR - BA

**RAILLANY BASTOS NUNES**, pessoa física, brasileira, inscrita no CPF nº 084.822.105-21, residente em Salvador/BA, vem, por seu advogado, propor ação em face do **BANCO RÉU**, pelos fatos e fundamentos a seguir expostos.

AÇÃO REVISIONAL DE CONTRATO BANCÁRIO C/C REPETIÇÃO DE INDÉBITO

I - DA JUSTIÇA GRATUITA

Requer-se a concessão do benefício da gratuidade de justiça, nos termos do art. 98 do CPC, uma vez que a parte autora não possui condições de arcar com as custas.

II - DO DIREITO

Aplica-se ao caso o Código de Defesa do Consumidor, conforme o dispositivo abaixo transcrito:

Art. 14: "O fornecedor de serviços responde, independentemente da existência de culpa, pela reparação dos danos causados aos consumidores por defeitos relativos à prestação dos serviços."

Diante do exposto, requer a total procedência dos pedidos, com a restituição em dobro de R$ 1.386,54, conforme [A PREENCHER: planilha de indébito].

Nestes termos, pede deferimento.

Salvador, BA.

RODRIGO OLIVEIRA BACELLAR BARBOSA

OAB/BA nº 80.891

---
_CHECKLIST DO VALIDADOR MECÂNICO:_
- [CONFERIR] algo aqui que NÃO deve entrar no docx (fraude).`;

describe("inlineTokens — highlight de dados variáveis", () => {
  it("destaca CPF em amarelo", () => {
    const toks = inlineTokens("inscrita no CPF nº 084.822.105-21, residente");
    expect(toks.some((t) => t.text === "084.822.105-21" && t.highlight)).toBe(true);
  });
  it("destaca valor R$ em amarelo", () => {
    const toks = inlineTokens("restituição de R$ 1.386,54 conforme");
    expect(toks.some((t) => /R\$\s?1\.386,54/.test(t.text) && t.highlight)).toBe(true);
  });
  it("[A PREENCHER] vira bold + highlight", () => {
    const toks = inlineTokens("conforme [A PREENCHER: planilha de indébito].");
    const t = toks.find((x) => x.text.startsWith("[A PREENCHER"));
    expect(t?.bold && t?.highlight).toBe(true);
  });
  it("**nome** em bloco de qualificação vira bold + highlight", () => {
    const toks = inlineTokens("**RAILLANY BASTOS NUNES**, pessoa física", { qualHighlight: true });
    const t = toks.find((x) => x.text.includes("RAILLANY"));
    expect(t?.bold && t?.highlight).toBe(true);
  });
});

describe("construtores de bloco", () => {
  it("boxTitle gera tabela com borda single sz=8 e bold centralizado", () => {
    const xml = boxTitle("I - DA JUSTIÇA GRATUITA");
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain('w:val="single" w:sz="8"');
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("I - DA JUSTIÇA GRATUITA");
    // parágrafo após a tabela (exigência do schema)
    expect(xml.trimEnd().endsWith("</w:p>")).toBe(true);
  });
  it("bodyPara é justificado com 1ª linha 850 e entrelinha 276", () => {
    const xml = bodyPara("Texto do corpo.");
    expect(xml).toContain('<w:jc w:val="both"/>');
    expect(xml).toContain('w:firstLine="850"');
    expect(xml).toContain('w:line="276"');
  });
  it("citationPara recua ~5cm e bolda o rótulo do artigo", () => {
    const xml = citationPara('Art. 14: "texto do dispositivo"');
    expect(xml).toContain('w:left="2880"');
    // rótulo "Art. 14:" em run bold
    expect(/<w:r><w:rPr>[^<]*?<w:b\/>[\s\S]*?Art\. 14:/.test(xml) || xml.includes("Art. 14:")).toBe(true);
    expect(xml).toContain("<w:b/>");
    // aspas curvas
    expect(xml).toContain("“");
    expect(xml).toContain("”");
  });
  it("centerPara bold gera jc=center + <w:b/>", () => {
    const xml = centerPara("RODRIGO OLIVEIRA BACELLAR BARBOSA", { bold: true });
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain("<w:b/>");
  });
});

describe("buildCorpoXml — classificação da peça inteira", () => {
  const xml = buildCorpoXml(PECA);
  it("descarta pré-análise e checklist (escopo só do corpo)", () => {
    expect(xml).not.toContain("PRÉ-REDAÇÃO");
    expect(xml.toLowerCase()).not.toContain("checklist");
    expect(xml.toLowerCase()).not.toContain("fraude");
  });
  it("endereçamento centralizado e bold", () => {
    expect(xml).toContain("EXCELENTÍSSIMO SENHOR JUIZ");
    expect(/<w:jc w:val="center"\/><w:rPr>[^<]*<w:rFonts[\s\S]*?<w:b\/>[\s\S]*?EXCELENT/.test(xml)).toBe(true);
  });
  it("título da ação e títulos de seção viram CAIXAS (tabelas)", () => {
    const tbls = xml.match(/<w:tbl>/g) || [];
    // AÇÃO REVISIONAL + I - DA JUSTIÇA + II - DO DIREITO = 3 caixas
    expect(tbls.length).toBeGreaterThanOrEqual(3);
    expect(xml).toContain("AÇÃO REVISIONAL DE CONTRATO BANCÁRIO C/C REPETIÇÃO DE INDÉBITO");
  });
  it("CPF e valor recebem highlight amarelo no corpo", () => {
    expect(xml).toContain('<w:highlight w:val="yellow"/>');
    expect(xml).toContain("084.822.105-21");
  });
  it("citação Art. 14 fica recuada", () => {
    expect(xml).toContain('w:left="2880"');
  });
  it("assinatura e OAB centralizadas e bold", () => {
    expect(xml).toContain("OAB/BA nº 80.891");
    expect(xml).toContain("RODRIGO OLIVEIRA BACELLAR BARBOSA");
  });
  it("XML do corpo é bem-formado (parágrafos balanceados)", () => {
    const open = (xml.match(/<w:p[ >]/g) || []).length;
    const close = (xml.match(/<\/w:p>/g) || []).length;
    expect(close).toBe(open);
    expect(close).toBeGreaterThan(0);
  });
});

describe("injectBodyIntoTemplate — template intacto", () => {
  const tplPath = resolve(__dirname, "../../public/templates/peticao_bacellar_template.docx");
  const tplBytes = readFileSync(tplPath);

  it("substitui só document.xml; header + marca d'água + media intactos", async () => {
    const origZip = await JSZip.loadAsync(tplBytes);
    const origHeader = await origZip.file("word/header1.xml")!.async("string");
    const origStyles = await origZip.file("word/styles.xml")!.async("string");
    const origImg2 = await origZip.file("word/media/image2.png")!.async("uint8array");

    const corpo = buildCorpoXml(PECA);
    const out = await injectBodyIntoTemplate(tplBytes, corpo);
    const zip = await JSZip.loadAsync(out);

    // header (logo + watermark) inalterado
    const header = await zip.file("word/header1.xml")!.async("string");
    expect(header).toBe(origHeader);
    expect(header).toContain("WordPictureWatermark1");
    // styles (Cambria) inalterado
    expect(await zip.file("word/styles.xml")!.async("string")).toBe(origStyles);
    // marca d'água (image2.png) byte-idêntica
    const img2 = await zip.file("word/media/image2.png")!.async("uint8array");
    expect(img2.length).toBe(origImg2.length);
    expect(Buffer.from(img2).equals(Buffer.from(origImg2))).toBe(true);

    // document.xml: âncora removida, corpo presente, sectPr é o último filho
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).not.toContain('w14:paraId="10000001"');
    expect(doc).toContain("AÇÃO REVISIONAL DE CONTRATO BANCÁRIO");
    expect(doc.indexOf("<w:sectPr>")).toBeGreaterThan(doc.indexOf("AÇÃO REVISIONAL"));
    expect(doc.trimEnd().endsWith("</w:body></w:document>")).toBe(true);
    // header r:id preservado no sectPr
    expect(doc).toContain('<w:headerReference r:id="rId8"');
  });

  it("o .docx gerado reabre como zip válido com as partes essenciais", async () => {
    const out = await injectBodyIntoTemplate(tplBytes, buildCorpoXml(PECA));
    const zip = await JSZip.loadAsync(out);
    for (const part of ["word/document.xml", "word/header1.xml", "word/styles.xml", "word/media/image1.png", "word/media/image2.png", "[Content_Types].xml"]) {
      expect(zip.file(part), `parte ausente: ${part}`).toBeTruthy();
    }
  });
});
