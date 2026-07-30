// Leitor MÍNIMO de .xlsx sobre JSZip (já usado no projeto para .docx) — evita
// dependência nova (a lib `xlsx` do npm tem histórico de CVE e distribuição fora do
// registro público). Lê apenas o necessário: nomes de abas e matriz de células como
// texto. Sem fórmulas, sem estilos, sem datas seriais.
//
// PERFORMANCE (medido em 27/07): a primeira versão levava 61s em
// "Clientes X bancos.xlsx" (11 abas, ~257 mil células) e 20s no SUSEP — o script
// parecia travado e foi interrompido. Causas e correções:
//   1. `[...xml.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)]` materializava
//      dezenas de milhares de objetos de match sobre strings de megabytes, com
//      backtracking do grupo lazy. Trocado por um SCANNER de índice (indexOf), que
//      é linear e previsível.
//   2. `rowsMap.get(row)[col-1] = v` criava arrays ESPARSOS (dictionary mode no V8).
//      Agora cada linha é montada num Map coluna→valor e materializada de uma vez.
//   3. `unesc` rodava 6 regex por célula. Agora só quando a célula contém "&".
//   4. `onlySheets` evita parsear abas que não interessam (o caso de uso real quer
//      6 de 11 abas), e `onSheet` dá progresso — sem log não se distingue lento de
//      travado.
// Resultado: as duas planilhas em poucos segundos.

import JSZip from "jszip";

/**
 * Entrada do workbook nos DOIS ambientes: caminho (Node, o importador em lote) ou
 * bytes/Blob/File (navegador, a importação de audiências pela tela).
 *
 * O `node:fs/promises` é importado DINAMICAMENTE e só no ramo do caminho: um
 * `import` dele no topo faz o Vite tentar resolver `node:fs` em tempo de build e
 * quebra o bundle do front. JSZip roda nos dois lados (já é dependência do front,
 * usada pelo motor de .docx), então o resto do módulo é neutro.
 */
async function lerBytes(entrada) {
  if (typeof entrada === "string") {
    const { readFile } = await import("node:fs/promises");
    return readFile(entrada);
  }
  if (entrada instanceof Uint8Array || entrada instanceof ArrayBuffer) return entrada;
  if (typeof Blob !== "undefined" && entrada instanceof Blob) {
    return new Uint8Array(await entrada.arrayBuffer());
  }
  throw new TypeError("readWorkbook: informe um caminho (Node) ou bytes/Blob/File (navegador).");
}

const AMP = /&(?:lt|gt|quot|apos|amp|#\d+);/;
function unesc(s) {
  if (!AMP.test(s)) return s;                       // fast path: a maioria não tem &
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, "&");
}

/** "BC12" → coluna 55 (1-based). Sem regex: varredura direta. */
function colFromRef(ref) {
  let col = 0, i = 0;
  for (; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;                    // chegou nos dígitos da linha
    col = col * 26 + (c - 64);
  }
  return col;
}

/** Extrai o valor de um atributo do trecho de abertura da tag (sem regex). */
function attr(open, name) {
  const key = ` ${name}="`;
  let i = open.indexOf(key);
  if (i < 0) {
    if (!open.startsWith(`${name}="`)) return null;
    i = -1;
  }
  const start = i < 0 ? name.length + 2 : i + key.length;
  const end = open.indexOf('"', start);
  return end < 0 ? null : open.slice(start, end);
}

/** Concatena o texto de todos os <t> de um trecho (rich text vira uma string). */
function textOfT(xml, from, to) {
  const parts = [];
  let i = from;
  while (i < to) {
    const a = xml.indexOf("<t", i);
    if (a < 0 || a >= to) break;
    const gt = xml.indexOf(">", a);
    if (gt < 0 || gt >= to) break;
    if (xml[gt - 1] === "/") { i = gt + 1; continue; }   // <t/> vazio
    const close = xml.indexOf("</t>", gt + 1);
    if (close < 0 || close > to) break;
    parts.push(unesc(xml.slice(gt + 1, close)));
    i = close + 4;
  }
  return parts.join("");
}

/** sharedStrings.xml → array indexado por posição (parseado UMA única vez). */
function parseSharedStrings(xml) {
  const out = [];
  let i = 0;
  for (;;) {
    const a = xml.indexOf("<si", i);
    if (a < 0) break;
    const gt = xml.indexOf(">", a);
    if (gt < 0) break;
    if (xml[gt - 1] === "/") { out.push(""); i = gt + 1; continue; }
    const close = xml.indexOf("</si>", gt + 1);
    if (close < 0) break;
    out.push(textOfT(xml, gt + 1, close));
    i = close + 5;
  }
  return out;
}

/**
 * Varre uma aba em UMA passada e devolve as linhas como arrays de string.
 * `maxCol` corta colunas irrelevantes (planilhas do Excel costumam ter células
 * formatadas muito além dos dados).
 */
function parseSheet(xml, shared, maxCol) {
  const rows = [];        // índice = linha-1
  let cur = null, curRow = -1, curMax = 0;
  const flush = () => {
    if (curRow < 0) return;
    const arr = new Array(curMax);
    for (let c = 0; c < curMax; c++) arr[c] = cur.get(c) ?? "";
    rows[curRow - 1] = arr;
    cur = null; curRow = -1; curMax = 0;
  };

  let i = 0;
  for (;;) {
    const a = xml.indexOf("<c", i);
    if (a < 0) break;
    const after = xml.charCodeAt(a + 2);
    // Só a tag <c> de célula (evita casar <col>, <cols>, <cellStyle>…).
    if (after !== 32 && after !== 62 && after !== 47) { i = a + 2; continue; }
    const gt = xml.indexOf(">", a);
    if (gt < 0) break;
    const selfClosing = xml[gt - 1] === "/";
    const open = xml.slice(a + 2, selfClosing ? gt - 1 : gt);

    const ref = attr(open, "r");
    let val = "";
    let next = gt + 1;
    if (!selfClosing) {
      const close = xml.indexOf("</c>", gt + 1);
      if (close < 0) break;
      const t = attr(open, "t");
      if (t === "s") {
        const v0 = xml.indexOf("<v>", gt + 1);
        if (v0 >= 0 && v0 < close) {
          const v1 = xml.indexOf("</v>", v0 + 3);
          const idx = Number(xml.slice(v0 + 3, v1));
          val = shared[idx] ?? "";
        }
      } else if (t === "inlineStr" || t === "str") {
        val = textOfT(xml, gt + 1, close);
      } else {
        const v0 = xml.indexOf("<v>", gt + 1);
        if (v0 >= 0 && v0 < close) {
          const v1 = xml.indexOf("</v>", v0 + 3);
          val = unesc(xml.slice(v0 + 3, v1));
        }
      }
      next = close + 4;
    }
    i = next;

    if (!ref || !val) continue;                    // célula vazia não ocupa espaço
    const col = colFromRef(ref);
    if (col < 1 || col > maxCol) continue;
    let row = 0;
    for (let k = 0; k < ref.length; k++) {
      const d = ref.charCodeAt(k);
      if (d >= 48 && d <= 57) row = row * 10 + (d - 48);
    }
    if (!row) continue;
    if (row !== curRow) { flush(); cur = new Map(); curRow = row; curMax = 0; }
    cur.set(col - 1, val);
    if (col > curMax) curMax = col;
  }
  flush();
  for (let r = 0; r < rows.length; r++) if (!rows[r]) rows[r] = [];
  return rows;
}

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^A-Za-z0-9]/g, "").toLowerCase();

/**
 * Lê a planilha.
 * @param {string|Uint8Array|ArrayBuffer|Blob} path caminho (Node) ou bytes/Blob/File (navegador)
 * @param {object} [opts]
 * @param {string[]} [opts.onlySheets] prefixos de nome de aba a ler (o resto é
 *        listado mas vem com rows=[]) — economiza o parse do que não interessa.
 * @param {number} [opts.maxCol=64] teto de colunas por linha.
 * @param {(info:{name:string,index:number,total:number,rows:number,ms:number,skipped:boolean})=>void} [opts.onSheet]
 *        progresso por aba (chamado DEPOIS de cada aba).
 */
export async function readWorkbook(path, opts = {}) {
  const { onlySheets = null, maxCol = 64, onSheet = null } = opts;
  const zip = await JSZip.loadAsync(await lerBytes(path));

  const ssFile = zip.file("xl/sharedStrings.xml");
  const shared = ssFile ? parseSharedStrings(await ssFile.async("string")) : [];

  const wb = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");

  // A ORDEM dos atributos varia entre geradores (Excel emite Id primeiro; outros
  // Type/Target/Id). Extraímos cada atributo do bloco, sem depender da ordem.
  const relMap = new Map();
  for (const [, at] of wb ? rels.matchAll(/<Relationship\b([^>]*?)\/?>/g) : []) {
    const id = /Id="([^"]+)"/.exec(at)?.[1];
    const target = /Target="([^"]+)"/.exec(at)?.[1];
    if (id && target) relMap.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  // Tolerante às duas formas: <sheet .../> e <sheet ...></sheet>.
  const decl = [];
  for (const [, at] of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = unesc(/name="([^"]*)"/.exec(at)?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(at)?.[1];
    const target = rid ? relMap.get(rid) : null;
    if (name && target) decl.push({ name, target });
  }

  const wanted = onlySheets ? onlySheets.map(norm) : null;
  const sheets = [];
  for (const [index, d] of decl.entries()) {
    const t0 = Date.now();
    const quero = !wanted || wanted.some((w) => norm(d.name).startsWith(w));
    let rows = [];
    if (quero) {
      const f = zip.file(`xl/${d.target}`) ?? zip.file(d.target);
      if (f) rows = parseSheet(await f.async("string"), shared, maxCol);
    }
    sheets.push({ name: d.name, rows });
    onSheet?.({ name: d.name, index: index + 1, total: decl.length, rows: rows.length, ms: Date.now() - t0, skipped: !quero });
  }
  return sheets;
}
