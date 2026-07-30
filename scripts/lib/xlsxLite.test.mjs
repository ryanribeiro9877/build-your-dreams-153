// Testes do leitor de .xlsx. Rodar: node --test scripts/lib/xlsxLite.test.mjs
//
// Por que existem: a primeira versão do leitor (a) levava 61s em uma planilha de
// 11 abas e (b) PERDIA células em silêncio — o índice de senhas por nome saía com
// 166 entradas quando o correto eram 605. Perda silenciosa é o pior modo de falha
// numa importação, então cada caso abaixo cobre uma forma de célula/arquivo real.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { readWorkbook } from "./xlsxLite.mjs";

/**
 * Monta um .xlsx de teste.
 * @param sheets [{name, xmlRows}] — xmlRows é o conteúdo de <sheetData>.
 * @param shared array de sharedStrings
 * @param relsIdLast se true, emite Id DEPOIS de Target (gerador não-Excel)
 */
async function makeXlsx(sheets, shared = [], relsIdLast = false) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("_rels/.rels", "<Relationships/>");
  const sheetTags = sheets.map((s, i) =>
    `<sheet xmlns:r="http://x" name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  zip.file("xl/workbook.xml", `<workbook><sheets>${sheetTags}</sheets></workbook>`);
  const relTags = sheets.map((_, i) => relsIdLast
    ? `<Relationship Type="http://x/worksheet" Target="/xl/worksheets/sheet${i + 1}.xml" Id="rId${i + 1}"/>`
    : `<Relationship Id="rId${i + 1}" Type="http://x/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  zip.file("xl/_rels/workbook.xml.rels", `<Relationships>${relTags}</Relationships>`);
  if (shared.length) {
    zip.file("xl/sharedStrings.xml",
      `<sst>${shared.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`);
  }
  sheets.forEach((s, i) => {
    zip.file(`xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet><cols><col min="1" max="5"/></cols><sheetData>${s.xmlRows}</sheetData></worksheet>`);
  });
  const dir = await mkdtemp(path.join(tmpdir(), "xlsxlite-"));
  const file = path.join(dir, "t.xlsx");
  await writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  return file;
}

test("lê sharedStrings, inline, número e célula vazia", async () => {
  const file = await makeXlsx([{
    name: "Dados",
    xmlRows:
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
      `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c>` +
      `<c r="C2" t="inlineStr"><is><t>inline</t></is></c><c r="D2"/></row>`,
  }], ["Nome", "CPF", "MARIA"]);
  const [s] = await readWorkbook(file);
  assert.equal(s.name, "Dados");
  assert.deepEqual(s.rows[0], ["Nome", "CPF"]);
  assert.equal(s.rows[1][0], "MARIA");
  assert.equal(s.rows[1][1], "42");
  assert.equal(s.rows[1][2], "inline");
});

// A REGRESSÃO que o parser antigo tinha: colunas salteadas (A e E preenchidas, B–D
// vazias) faziam o valor de E cair no índice errado — era assim que a coluna de
// senha/nome se perdia.
test("colunas NÃO contíguas mantêm a posição correta", async () => {
  const file = await makeXlsx([{
    name: "S",
    xmlRows: `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="E1" t="s"><v>1</v></c></row>`,
  }], ["nome", "senha"]);
  const [s] = await readWorkbook(file);
  assert.equal(s.rows[0][0], "nome");
  assert.equal(s.rows[0][1], "");
  assert.equal(s.rows[0][2], "");
  assert.equal(s.rows[0][3], "");
  assert.equal(s.rows[0][4], "senha");   // coluna E = índice 4
});

test("linhas puladas viram linhas vazias (não desalinham as seguintes)", async () => {
  const file = await makeXlsx([{
    name: "S",
    xmlRows: `<row r="1"><c r="A1" t="s"><v>0</v></c></row>` +
             `<row r="4"><c r="A4" t="s"><v>1</v></c></row>`,
  }], ["primeira", "quarta"]);
  const [s] = await readWorkbook(file);
  assert.equal(s.rows.length, 4);
  assert.equal(s.rows[0][0], "primeira");
  assert.deepEqual(s.rows[1], []);
  assert.deepEqual(s.rows[2], []);
  assert.equal(s.rows[3][0], "quarta");
});

test("entidades XML são desescapadas", async () => {
  const file = await makeXlsx([{
    name: "S", xmlRows: `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`,
  }], ["Tarifa &amp; Seguro &lt;x&gt;"]);
  const [s] = await readWorkbook(file);
  assert.equal(s.rows[0][0], "Tarifa & Seguro <x>");
});

test("rels com Id DEPOIS de Target (gerador não-Excel) também resolve", async () => {
  const file = await makeXlsx([{
    name: "IMPORTAR", xmlRows: `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`,
  }], ["ok"], /* relsIdLast */ true);
  const [s] = await readWorkbook(file);
  assert.equal(s.name, "IMPORTAR");
  assert.equal(s.rows[0][0], "ok");
});

test("onlySheets lê só o que interessa (as outras vêm vazias) e onSheet reporta", async () => {
  const file = await makeXlsx([
    { name: "QUERO", xmlRows: `<row r="1"><c r="A1" t="s"><v>0</v></c></row>` },
    { name: "IGNORA", xmlRows: `<row r="1"><c r="A1" t="s"><v>1</v></c></row>` },
  ], ["sim", "nao"]);
  const vistas = [];
  const sheets = await readWorkbook(file, {
    onlySheets: ["QUERO"],
    onSheet: (i) => vistas.push(`${i.name}:${i.skipped ? "skip" : i.rows}`),
  });
  assert.equal(sheets.find((s) => s.name === "QUERO").rows[0][0], "sim");
  assert.deepEqual(sheets.find((s) => s.name === "IGNORA").rows, []);
  assert.deepEqual(vistas, ["QUERO:1", "IGNORA:skip"]);
});

test("<c> não é confundido com <col>/<cols> do cabeçalho da aba", async () => {
  const file = await makeXlsx([{
    name: "S", xmlRows: `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`,
  }], ["unico"]);
  const [s] = await readWorkbook(file);
  assert.equal(s.rows.length, 1);
  assert.deepEqual(s.rows[0], ["unico"]);
});

test("maxCol descarta colunas além do teto (planilha formatada até XFD)", async () => {
  const file = await makeXlsx([{
    name: "S",
    xmlRows: `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="ZZ1" t="s"><v>1</v></c></row>`,
  }], ["perto", "longe"]);
  const [s] = await readWorkbook(file, { maxCol: 10 });
  assert.equal(s.rows[0][0], "perto");
  assert.equal(s.rows[0].length, 1);          // ZZ (702) ficou fora
});

/* ── Dual-ambiente (30/07) ────────────────────────────────────────────────────
   O leitor passou a servir também o NAVEGADOR (importação de audiências pela
   tela): aceita bytes/Blob além de caminho, e o `node:fs/promises` virou import
   dinâmico dentro do ramo do caminho — no topo, o Vite tentaria resolver
   `node:fs` em tempo de build e o bundle do front quebraria. */

async function bytesDeXlsx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("_rels/.rels", "<Relationships/>");
  zip.file("xl/workbook.xml",
    '<workbook><sheets><sheet xmlns:r="http://x" name="Agosto" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<Relationships><Relationship Id="rId1" Type="http://x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/sharedStrings.xml", "<sst><si><t>MARIA x BANCO BMG</t></si></sst>");
  zip.file("xl/worksheets/sheet1.xml",
    '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>');
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

test("readWorkbook aceita Uint8Array (caminho do navegador)", async () => {
  const [s] = await readWorkbook(await bytesDeXlsx());
  assert.equal(s.name, "Agosto");
  assert.deepEqual(s.rows[0], ["MARIA x BANCO BMG"]);
});

test("readWorkbook aceita Blob (o que <input type=file> entrega)", async () => {
  const blob = new Blob([await bytesDeXlsx()]);
  const [s] = await readWorkbook(blob);
  assert.deepEqual(s.rows[0], ["MARIA x BANCO BMG"]);
});

test("readWorkbook recusa entrada que não é caminho nem bytes", async () => {
  await assert.rejects(() => readWorkbook(42), /caminho \(Node\) ou bytes/);
});
