// Leitor MÍNIMO de .xlsx sobre JSZip (já usado no projeto para .docx) — evita
// dependência nova (a lib `xlsx` do npm tem histórico de CVE e distribuição fora
// do registro público). Lê apenas o necessário: nomes de abas e matriz de células
// como texto. Sem fórmulas, sem estilos, sem datas seriais complexas.
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

const rx = (s, re) => [...s.matchAll(re)];
const unesc = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
   .replace(/&amp;/g, "&");

/** "BC12" -> {col: 55, row: 12} (col 1-based) */
function refToRC(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: +m[2] };
}

export async function readWorkbook(path) {
  const zip = await JSZip.loadAsync(await readFile(path));

  // sharedStrings: <si>...<t>texto</t>...</si> (pode ter vários <t> por rich text)
  const shared = [];
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (ssFile) {
    const xml = await ssFile.async("string");
    for (const [, si] of rx(xml, /<si>([\s\S]*?)<\/si>/g)) {
      const parts = rx(si, /<t[^>]*>([\s\S]*?)<\/t>/g).map((m) => unesc(m[1]));
      shared.push(parts.join(""));
    }
  }

  // workbook.xml: nome da aba + r:id  →  rels: r:id + arquivo da aba
  const wb = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  // A ORDEM dos atributos varia entre geradores (Excel emite Id primeiro; outros
  // emitem Type/Target/Id). Extraímos cada atributo do bloco, sem depender da ordem.
  const relMap = new Map();
  for (const [, attrs] of rx(rels, /<Relationship\b([^>]*?)\/?>/g)) {
    const id = /Id="([^"]+)"/.exec(attrs)?.[1];
    const target = /Target="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) relMap.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const sheets = [];
  // Tolerante às duas formas: <sheet .../> e <sheet ...></sheet> (geradores diferem).
  for (const [, attrs] of rx(wb, /<sheet\b([^>]*?)\/?>/g)) {
    const name = unesc(/name="([^"]*)"/.exec(attrs)?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(attrs)?.[1];
    const target = rid ? relMap.get(rid) : null;
    if (!name || !target) continue;
    const f = zip.file(`xl/${target}`) ?? zip.file(target);
    if (!f) continue;
    const sx = await f.async("string");

    // Monta matriz [linha][coluna] com texto puro.
    const rowsMap = new Map();
    for (const [, cAttrs, cInner] of rx(sx, /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+\d+)"/.exec(cAttrs)?.[1];
      if (!ref) continue;
      const rc = refToRC(ref);
      if (!rc) continue;
      const t = /t="([^"]+)"/.exec(cAttrs)?.[1];
      let val = "";
      const inner = cInner ?? "";
      if (t === "s") {
        const i = /<v>(\d+)<\/v>/.exec(inner)?.[1];
        val = i != null ? (shared[+i] ?? "") : "";
      } else if (t === "inlineStr") {
        val = rx(inner, /<t[^>]*>([\s\S]*?)<\/t>/g).map((m) => unesc(m[1])).join("");
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        val = v != null ? unesc(v) : "";
      }
      if (!rowsMap.has(rc.row)) rowsMap.set(rc.row, []);
      rowsMap.get(rc.row)[rc.col - 1] = val;
    }
    const maxRow = Math.max(0, ...rowsMap.keys());
    const rows = [];
    for (let i = 1; i <= maxRow; i++) rows.push((rowsMap.get(i) ?? []).map((v) => v ?? ""));
    sheets.push({ name, rows });
  }
  return sheets;
}
