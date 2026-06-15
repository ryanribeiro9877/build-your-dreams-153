// src/lib/bacellarDocx.ts
//
// Exportação de petições em .docx no padrão visual oficial Bacellar Advocacia.
//
// Abordagem (decisão do dono): TEMPLATE .docx. O template
// (public/templates/peticao_bacellar_template.docx) já contém — INTACTOS — o
// header com logo + marca d'água (v:shape WordPictureWatermark1), os estilos
// Cambria, a página A4 e as margens. Este módulo SÓ injeta o CORPO:
//   1. classifica cada bloco do texto final do N3 (caixa de título, parágrafo,
//      citação de artigo, fecho, assinatura);
//   2. gera o XML de cada bloco com a formatação do padrão (Cambria 11pt,
//      justificado, 1ª linha 1,5cm, caixas de borda, recuos, highlight amarelo);
//   3. insere o XML IMEDIATAMENTE ANTES de <w:sectPr> e remove o parágrafo-âncora
//      vazio (método validado no briefing — as outras 2 abordagens falham);
//   4. reempacota substituindo SÓ word/document.xml — header/styles/media nunca
//      são reescritos, então a marca d'água permanece intacta.
//
// Tudo aqui é determinístico (regex), sem LLM. As funções de montagem do XML são
// puras e exportadas para teste (bacellarDocx.test.ts).

import JSZip from "jszip";

export const TEMPLATE_URL = "/templates/peticao_bacellar_template.docx";

// rPr base: Cambria 11pt (sz=22). docDefaults do template também é Cambria, mas
// repetimos em cada run para garantir mesmo em editores que ignoram defaults.
const CAMBRIA = '<w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:cs="Cambria" w:eastAsia="Cambria"/><w:sz w:val="22"/><w:szCs w:val="22"/>';
// Largura útil A4 com as margens do template: 11909 - 1701 - 1440 = 8768 DXA.
const TBL_W = "8768";
const TBL_BORDERS =
  '<w:tblBorders>' +
  '<w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>' +
  '<w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/>' +
  '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>' +
  '<w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/>' +
  '<w:insideH w:val="single" w:sz="8" w:space="0" w:color="000000"/>' +
  '<w:insideV w:val="single" w:sz="8" w:space="0" w:color="000000"/>' +
  '</w:tblBorders>';

// ─── helpers de texto ────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
// Aspas tipográficas: pares retos " → “ … ” (alternância balanceada).
function curlyQuotes(s: string): string {
  let open = false;
  return s.replace(/"/g, () => { open = !open; return open ? "“" : "”"; });
}
// Remove markdown inline residual em QUALQUER posição da linha (não só nas
// âncoras ^...$): marcador de lista inicial ("- ", "* ", "1. "), blockquote ">",
// **bold**, __bold__, *itálico*. Usado para CLASSIFICAR (a decisão de tipo nunca
// depende de markdown) e para os caminhos de render que NÃO passam por
// inlineTokens (boxTitle/centerPara bold/citação), onde o markdown vazaria
// literal. Não tocar no texto que vai para runsXml — lá o ** vira <w:b/> e o bold
// inline legítimo precisa ser preservado; itens de corpo com "-" seguem por
// bodyPara via noHeading (sem esta limpeza), preservando o hífen no render.
function stripInlineMd(t: string): string {
  return t
    .replace(/^\s*(?:[-*+]|\d{1,2}[.)])\s+/, "")        // marcador de lista (- * + 1.)
    .replace(/^\s*>\s?/, "")                            // blockquote inicial
    .replace(/\*\*(.+?)\*\*/g, "$1")                     // **bold**
    .replace(/__(.+?)__/g, "$1")                         // __bold__
    .replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, "$1");   // *itálico* (não toca **)
}
function isCapsDominant(s: string): boolean {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return false;
  let up = 0;
  for (const ch of letters) if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) up++;
  return up / letters.length >= 0.6;
}

// ─── runs inline (highlight amarelo de dados variáveis + markdown bold/itálico) ─

interface Tok { text: string; bold?: boolean; italic?: boolean; highlight?: boolean; }

// Tokeniza um texto marcando: [A PREENCHER ...] (bold+highlight); **bold**/__bold__
// (bold, +highlight quando em bloco de qualificação — nomes das partes);
// *itálico*; CPF, CNPJ e valores R$ (highlight). O resto fica em run simples.
export function inlineTokens(text: string, opts: { qualHighlight?: boolean } = {}): Tok[] {
  const toks: Tok[] = [];
  const MASTER = /(\[A PREENCHER[^\]]*\])|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(\d{3}\.\d{3}\.\d{3}-\d{2})|(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|(R\$\s?\d[\d.]*,\d{2})/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = MASTER.exec(text)) !== null) {
    if (m.index > last) toks.push({ text: text.slice(last, m.index) });
    if (m[1]) toks.push({ text: m[1], bold: true, highlight: true });
    else if (m[2]) toks.push({ text: m[3], bold: true, highlight: !!opts.qualHighlight });
    else if (m[4]) toks.push({ text: m[5], bold: true, highlight: !!opts.qualHighlight });
    else if (m[6]) toks.push({ text: m[7], italic: true });
    else if (m[8]) toks.push({ text: m[8], highlight: true });   // CPF
    else if (m[9]) toks.push({ text: m[9], highlight: true });   // CNPJ
    else if (m[10]) toks.push({ text: m[10], highlight: true });  // valor R$
    last = MASTER.lastIndex;
  }
  if (last < text.length) toks.push({ text: text.slice(last) });
  return toks.filter((t) => t.text.length > 0);
}

function runXml(t: Tok): string {
  const rpr = CAMBRIA + (t.bold ? "<w:b/>" : "") + (t.italic ? "<w:i/>" : "") +
    (t.highlight ? '<w:highlight w:val="yellow"/>' : "");
  return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${xmlEscape(t.text)}</w:t></w:r>`;
}
function runsXml(text: string, opts?: { qualHighlight?: boolean }): string {
  const toks = inlineTokens(text, opts);
  return toks.length ? toks.map(runXml).join("") : runXml({ text });
}

// ─── construtores de bloco ────────────────────────────────────────────────────

// Caixa de título (tabela 1x1 com borda preta single sz=8), texto centralizado e
// bold. Word exige um parágrafo após a tabela — segue um <w:p> vazio mínimo.
export function boxTitle(text: string): string {
  const t = xmlEscape(text.replace(/\s+/g, " ").trim());
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${TBL_W}" w:type="dxa"/>${TBL_BORDERS}</w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${TBL_W}"/></w:tblGrid>` +
    `<w:tr><w:tc><w:tcPr><w:tcW w:w="${TBL_W}" w:type="dxa"/>` +
    `<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/>` +
    `<w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>` +
    `<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${CAMBRIA}<w:b/></w:rPr></w:pPr>` +
    `<w:r><w:rPr>${CAMBRIA}<w:b/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>` +
    `</w:tc></w:tr></w:tbl>` +
    // Word exige um parágrafo após a tabela; um pequeno before/after dá respiro
    // uniforme entre a caixa e o conteúdo seguinte (transições caixa→fecho e na
    // sequência de caixas da SÍNTESE DA INICIAL).
    `<w:p><w:pPr><w:spacing w:before="120" w:after="60"/><w:rPr>${CAMBRIA}</w:rPr></w:pPr></w:p>`
  );
}

// Parágrafo do corpo: justificado, 1ª linha recuada 1,5cm (firstLine=850),
// entrelinha 1,15 (line=276 auto).
export function bodyPara(text: string, opts: { qual?: boolean } = {}): string {
  return (
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:ind w:firstLine="850"/>` +
    `<w:jc w:val="both"/><w:rPr>${CAMBRIA}</w:rPr></w:pPr>` +
    runsXml(text, { qualHighlight: opts.qual }) + `</w:p>`
  );
}

// Parágrafo centralizado (endereçamento, fecho, assinatura).
export function centerPara(text: string, opts: { bold?: boolean } = {}): string {
  const inner = opts.bold
    ? `<w:r><w:rPr>${CAMBRIA}<w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
    : runsXml(text);
  return (
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/>` +
    `<w:rPr>${CAMBRIA}${opts.bold ? "<w:b/>" : ""}</w:rPr></w:pPr>${inner}</w:p>`
  );
}

// Citação de lei/artigo: recuada à esquerda (~5cm), rótulo "Art. Xº:" em bold,
// dispositivo entre aspas curvas.
export function citationPara(text: string): string {
  const labelMatch = text.match(/^\s*((?:Art\.?|Artigo|§|Par[áa]grafo)\b[^:]{0,40}:?\s*)/i);
  let runs = "";
  if (labelMatch) {
    const label = labelMatch[1];
    const rest = text.slice(label.length);
    runs += `<w:r><w:rPr>${CAMBRIA}<w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(label)}</w:t></w:r>`;
    if (rest.trim()) runs += `<w:r><w:rPr>${CAMBRIA}</w:rPr><w:t xml:space="preserve">${xmlEscape(curlyQuotes(rest))}</w:t></w:r>`;
  } else {
    runs = `<w:r><w:rPr>${CAMBRIA}</w:rPr><w:t xml:space="preserve">${xmlEscape(curlyQuotes(text))}</w:t></w:r>`;
  }
  return (
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/>` +
    `<w:ind w:left="2880" w:right="556" w:firstLine="0"/><w:jc w:val="both"/>` +
    `<w:rPr>${CAMBRIA}</w:rPr></w:pPr>${runs}</w:p>`
  );
}

// Item de pedido ("a)", "b)" … "j)"): parágrafo de lista justificado, com recuo
// pequeno à esquerda e SEM recuo de 1ª linha. Passa por runsXml para preservar
// o bold inline dos rótulos (ex.: "JUSTIÇA GRATUITA") e nunca virar caixa nem
// linha centralizada (mesmo quando contém "OAB").
export function petitumItem(text: string): string {
  return (
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/>` +
    `<w:ind w:left="425" w:firstLine="0"/><w:jc w:val="both"/>` +
    `<w:rPr>${CAMBRIA}</w:rPr></w:pPr>` +
    runsXml(text) + `</w:p>`
  );
}

// ─── limpeza: descarta pré-análise e checklists (não fazem parte da peça) ─────
function stripNonPeca(content: string): string {
  let t = (content || "").replace(/\r\n/g, "\n");
  // Corta a cauda a partir do primeiro marcador de checklist.
  const f = fold(t);
  let cut = -1;
  for (const mk of ["checklist de pendencias", "checklist do validador"]) {
    const idx = f.indexOf(mk);
    if (idx >= 0 && (cut < 0 || idx < cut)) cut = idx;
  }
  if (cut >= 0) {
    const ls = t.lastIndexOf("\n", cut);
    t = t.slice(0, ls < 0 ? cut : ls).replace(/\n*\s*-{3,}\s*$/, "");
  }
  // Descarta a ANÁLISE PRÉ-REDAÇÃO: começa no 1º "EXCELENTÍSSIMO" se existir.
  const exc = fold(t).indexOf("excelent");
  if (exc > 0) t = t.slice(exc);
  return t.trim();
}

// ─── classificação + montagem do CORPO ───────────────────────────────────────

export function buildCorpoXml(content: string): string {
  const cleaned = stripNonPeca(content);
  const blocks: string[] = [];
  for (const raw of cleaned.split("\n")) {
    const line = raw.replace(/\t/g, " ").trim();
    if (!line) continue;
    if (/^[-*_]{3,}$/.test(line)) continue; // separador
    // texto sem heading markdown (base de render p/ caminhos via inlineTokens) e
    // versão totalmente limpa de markdown inline para CLASSIFICAR. O blockquote
    // é detectado ANTES da limpeza, pois stripInlineMd remove o ">".
    const noHeading = line.replace(/^#{1,6}\s*/, "");
    const isBlockquote = /^\s*>/.test(noHeading);
    const cls = stripInlineMd(noHeading).trim();
    const noAccent = fold(cls);

    // 1. Endereçamento (centralizado, bold)
    if (/^excelent[ií]ssim/i.test(cls)) { blocks.push(centerPara(cls, { bold: true })); continue; }
    // 2. Caixa: SÍNTESE DA INICIAL
    if (/s[ií]ntese da inicial/.test(noAccent)) { blocks.push(boxTitle(cls)); continue; }
    // 3. Caixa: título da ação (CAPS + "AÇÃO/ACAO")
    if (isCapsDominant(cls) && /\ba[çc][aã]o\b/.test(noAccent) && cls.length <= 140) { blocks.push(boxTitle(cls)); continue; }
    // 4. Caixa: título de seção (numeração romana I, II, III.1, IV.2…)
    const sec = cls.match(/^([IVXLC]{1,5}(?:\.\d{1,2})*)\s*[—–.\-:)]+\s*(.+)$/);
    if (sec && isCapsDominant(sec[2])) { blocks.push(boxTitle(cls)); continue; }
    // 5. Citação de artigo/lei (recuada) — inclui blockquote ">" do N3
    if (isBlockquote || /^(art\.?|artigo|§|paragrafo|par[áa]grafo)\b/.test(noAccent) || /^["“]/.test(cls)) { blocks.push(citationPara(cls)); continue; }
    // 6. Fecho
    if (/nestes termos|pede deferimento/.test(noAccent)) { blocks.push(centerPara(noHeading)); continue; }
    // 7. Linha de local/data do fecho (centralizada; data pode ter highlight)
    if (/^[A-Za-zÀ-ÿ.\s]{3,40},?\s*(?:ba|\/ba|-\s*ba)\b/i.test(cls) || /\[A PREENCHER:[^\]]*data/i.test(cls)) {
      blocks.push(centerPara(noHeading)); continue;
    }
    // 8. Item de pedido ("a)" … "j)") → parágrafo de lista. ANTES da regra de
    //    assinatura (OAB) e da de nome-em-caps, senão "j) … OAB/BA …" viraria
    //    assinatura centralizada. Usa noHeading p/ preservar bold inline.
    if (/^[a-z]\)\s/i.test(cls)) { blocks.push(petitumItem(noHeading)); continue; }
    // 9. Assinatura (OAB ou nome do advogado em CAPS)
    if (/oab\s*\/?\s*ba|\boab\b/.test(noAccent)) { blocks.push(centerPara(cls, { bold: true })); continue; }
    if (isCapsDominant(cls) && cls.split(/\s+/).length >= 2 && cls.length <= 60 && !/[.:;,]$/.test(cls)) {
      blocks.push(centerPara(cls, { bold: true })); continue;
    }
    // 10. Parágrafo de corpo (qualificação → nomes em bold ganham highlight)
    const qual = /pessoa f[ií]sica|brasileir|inscrit[oa]\s+no\s+cpf|portador|inscrit[oa]\s+no\s+cnpj|com sede/.test(noAccent);
    blocks.push(bodyPara(noHeading, { qual }));
  }
  return blocks.join("");
}

// ─── injeção no template ──────────────────────────────────────────────────────

// Insere o CORPO no document.xml do template e devolve os bytes do .docx.
// Substitui APENAS word/document.xml; header/styles/media ficam intactos.
export async function injectBodyIntoTemplate(
  templateBytes: ArrayBuffer | Uint8Array, corpoXml: string,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(templateBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("template inválido: word/document.xml ausente");
  let doc = await docFile.async("string");
  // Remove o parágrafo-âncora vazio (método validado no briefing).
  doc = doc.replace(/<w:p w14:paraId="10000001">[\s\S]*?<\/w:p>/, "");
  // Insere o corpo imediatamente antes do <w:sectPr> (que permanece como último filho).
  if (!doc.includes("<w:sectPr>")) throw new Error("template inválido: <w:sectPr> não encontrado");
  doc = doc.replace("<w:sectPr>", corpoXml + "<w:sectPr>");
  zip.file("word/document.xml", doc);
  return zip.generateAsync({
    type: "uint8array",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

function fileSlug(title: string | undefined): string {
  const now = new Date();
  const slug = (title || "peca").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${slug || "peca"}_${stamp}.docx`;
}

// Ponto de entrada (browser): busca o template, injeta o corpo e baixa o .docx.
export async function downloadMessageAsDocx(content: string, opts?: { title?: string }): Promise<void> {
  const resp = await fetch(TEMPLATE_URL);
  if (!resp.ok) throw new Error(`não foi possível carregar o template (${resp.status})`);
  const buf = await resp.arrayBuffer();
  const corpo = buildCorpoXml(content);
  const bytes = await injectBodyIntoTemplate(buf, corpo);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileSlug(opts?.title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
