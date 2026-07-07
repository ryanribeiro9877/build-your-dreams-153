import { describe, it, expect } from "vitest";
import {
  maskCpf, maskCnpj, maskCep, formatDateExtenso, cidadeUf,
  baseCooperadoValues, COOPERADO_DOC_DEFS, renderCooperadoDoc,
  type CooperadoClientData,
} from "./cooperadoDocs";
import JSZip from "jszip";

describe("formatadores determinísticos", () => {
  it("maskCpf formata 11 dígitos e não inventa quando incompleto", () => {
    expect(maskCpf("08482210521")).toBe("084.822.105-21");
    expect(maskCpf("084.822.105-21")).toBe("084.822.105-21");
    expect(maskCpf("123")).toBe("123");     // incompleto: devolve original, não inventa
    expect(maskCpf("")).toBeNull();
    expect(maskCpf(null)).toBeNull();
  });

  it("maskCnpj formata 14 dígitos", () => {
    expect(maskCnpj("57771596000140")).toBe("57.771.596/0001-40");
    expect(maskCnpj(null)).toBeNull();
  });

  it("maskCep formata 8 dígitos", () => {
    expect(maskCep("40010000")).toBe("40010-000");
    expect(maskCep("400")).toBe("400");
    expect(maskCep(null)).toBeNull();
  });

  it("formatDateExtenso em pt-BR sem deslize de fuso", () => {
    expect(formatDateExtenso("2026-07-07")).toBe("7 de julho de 2026");
    expect(formatDateExtenso(new Date(Date.UTC(2026, 0, 1)))).toBe("1 de janeiro de 2026");
  });

  it("cidadeUf monta 'Cidade/UF' e tolera faltas", () => {
    expect(cidadeUf("Salvador", "BA")).toBe("Salvador/BA");
    expect(cidadeUf("Salvador", null)).toBe("Salvador");
    expect(cidadeUf(null, null)).toBeNull();
  });
});

const CLIENT: CooperadoClientData = {
  id: "c1",
  full_name: "MARIA SILVA",
  cpf: "08482210521",
  nationality: "BRASILEIRA",
  marital_status: "solteiro",
  address: "Rua A",
  address_number: "100",
  zip_code: "40010000",
  city: "Salvador",
  state: "BA",
};

describe("baseCooperadoValues — dado exato do cadastro", () => {
  const v = baseCooperadoValues(CLIENT, { now: new Date(Date.UTC(2026, 6, 7)) });
  it("mascara CPF e monta cidade_uf/cep", () => {
    expect(v.nome).toBe("MARIA SILVA");
    expect(v.cpf).toBe("084.822.105-21");
    expect(v.cidade_uf).toBe("Salvador/BA");
    expect(v.cep).toBe("40010-000");
    expect(v.data).toBe("7 de julho de 2026");
  });
  it("campo ausente fica null (o preenchedor marca [A PREENCHER])", () => {
    expect(v.profissao).toBeNull();
    expect(v.rg).toBeNull();
  });
});

describe("COOPERADO_DOC_DEFS — os 4 documentos do conjunto", () => {
  it("cobre exatamente os 4 tipos do cooperado", () => {
    expect(COOPERADO_DOC_DEFS.map((d) => d.documentType).sort()).toEqual(
      ["contrato_honorarios", "declaracao_hipossuficiencia", "procuracao", "termo_cooperado"],
    );
  });
  it("cada def aponta um template .docx", () => {
    for (const d of COOPERADO_DOC_DEFS) expect(d.templateFile).toMatch(/\.docx$/);
  });
});

describe("renderCooperadoDoc — preenche a partir de template em memória", () => {
  async function tinyTemplate(inner: string): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t xml:space="preserve">${inner}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    );
    return zip.generateAsync({ type: "uint8array" });
  }

  it("procuração: nome/cpf/estado_civil/cidade_uf preenchidos; faltantes [A PREENCHER]", async () => {
    const def = COOPERADO_DOC_DEFS.find((d) => d.documentType === "procuracao")!;
    const tpl = await tinyTemplate("{{nome}} | {{cpf}} | {{estado_civil}} | {{cidade_uf}} | {{profissao}}");
    const out = await renderCooperadoDoc(def, CLIENT, tpl, { now: new Date(Date.UTC(2026, 6, 7)) });
    const doc = await (await JSZip.loadAsync(out.bytes)).file("word/document.xml")!.async("string");
    expect(doc).toContain("MARIA SILVA");
    expect(doc).toContain("084.822.105-21");
    expect(doc).toContain("solteiro");
    expect(doc).toContain("Salvador/BA");
    expect(doc).toContain("[A PREENCHER: profissao]"); // não cadastrado
    expect(out.missing).toContain("profissao");
  });
});
