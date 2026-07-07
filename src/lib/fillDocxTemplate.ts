// src/lib/fillDocxTemplate.ts
//
// Preenchedor DETERMINÍSTICO de templates .docx (mail-merge de placeholders).
//
// Mesma técnica do bacellarDocx.ts: carrega o template com JSZip, mexe SÓ nas
// partes de texto (word/document.xml + headers/footers) e reempacota — header,
// estilos, marca d'água e mídia ficam INTACTOS. A diferença é o "corpo": aqui
// nada é redigido; apenas substituímos {{placeholders}} pelos valores EXATOS do
// cadastro. NENHUM modelo de linguagem escreve, resume ou reformula o corpo
// jurídico do documento — é substituição pura (regex sobre o XML).
//
// Regra dura (briefing COOP-DOCS-2): dado ausente NUNCA vira lacuna silenciosa.
// Um placeholder sem valor (ou um placeholder do template que ninguém mapeou)
// é preenchido com "[A PREENCHER: <chave>]" — o mesmo marcador que o projeto já
// usa — e devolvido na lista `missing`/`unknown` para a revisão humana resolver.
//
// Robustez: o Word costuma FATIAR um placeholder em várias runs (ex.: "{{",
// "nome", "}}" em <w:t> separados por causa de verificação ortográfica). Por
// isso não fazemos um String.replace ingênuo no XML: concatenamos o texto de
// todas as runs, localizamos os tokens no texto concatenado e devolvemos o valor
// à PRIMEIRA run do token (preservando a formatação dela) — abordagem
// docxtemplater-like. Assim placeholders fatiados são preenchidos corretamente.
//
// Funções puras e exportadas para teste (fillDocxTemplate.test.ts).

import JSZip from "jszip";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Marcador padrão para dado ausente (consistente com o [A PREENCHER] do projeto).
export function defaultMissingLabel(key: string): string {
  return `[A PREENCHER: ${key}]`;
}

export interface FillOptions {
  /** Como marcar um placeholder sem valor. Default: "[A PREENCHER: <chave>]". */
  missingLabel?: (key: string) => string;
}

export interface FillResult {
  xml: string;
  /** chaves presentes no template cujo valor veio vazio/nulo. */
  missing: string[];
  /** chaves presentes no template que NÃO foram mapeadas em `values`. */
  unknown: string[];
  /** total de tokens {{...}} substituídos. */
  count: number;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Token de placeholder: {{ chave }} — nome em [A-Za-z0-9_], espaços tolerados.
const TOKEN_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
// Uma run de texto do OOXML: <w:t ...>conteúdo</w:t> (não casa a forma vazia <w:t/>).
const WT_RE = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;

// Preenche os placeholders em UMA parte XML (document/header/footer), tolerando
// tokens fatiados entre runs. Opera sobre o texto JÁ ESCAPADO das runs (o valor
// injetado é escapado); braces não são entidades XML, então o match é seguro.
export function fillDocumentXml(
  xml: string,
  values: Record<string, string | null | undefined>,
  opts: FillOptions = {},
): FillResult {
  const missingLabel = opts.missingLabel ?? defaultMissingLabel;
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const known = new Set(Object.keys(values));

  // 1. Coleta as runs de texto na ordem do documento.
  const segs: { open: string; inner: string; close: string; idx: number }[] = [];
  let m: RegExpExecArray | null;
  WT_RE.lastIndex = 0;
  while ((m = WT_RE.exec(xml)) !== null) {
    segs.push({ open: m[1], inner: m[2], close: m[3], idx: m.index });
  }
  if (segs.length === 0) return { xml, missing: [], unknown: [], count: 0 };

  // 2. Texto concatenado + mapa char->run (para reescrever preservando limites).
  const full = segs.map((s) => s.inner).join("");
  const owner = new Int32Array(full.length);
  {
    let p = 0;
    segs.forEach((s, k) => {
      for (let i = 0; i < s.inner.length; i++) owner[p++] = k;
    });
  }

  // 3. Localiza tokens no texto concatenado; marca cobertura e o ponto de injeção.
  const covered = new Uint8Array(full.length);
  const insertAt = new Map<number, string>();
  let count = 0;
  let mm: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((mm = TOKEN_RE.exec(full)) !== null) {
    const s = mm.index;
    const e = s + mm[0].length;
    const key = mm[1];
    for (let i = s; i < e; i++) covered[i] = 1;
    let rep: string;
    if (!known.has(key)) {
      unknown.add(key);
      rep = missingLabel(key);
    } else {
      const raw = values[key];
      if (raw == null || String(raw).trim() === "") {
        missing.add(key);
        rep = missingLabel(key);
      } else {
        rep = String(raw);
      }
    }
    insertAt.set(s, xmlEscape(rep));
    count++;
  }

  // 4. Reescreve o texto de cada run: injeta o valor na run onde o token começa,
  //    descarta os chars do token, preserva o resto (a formatação da run 1ª vence).
  const newInner = segs.map(() => "");
  for (let i = 0; i < full.length; i++) {
    const ins = insertAt.get(i);
    if (ins !== undefined) newInner[owner[i]] += ins;
    if (!covered[i]) newInner[owner[i]] += full[i];
  }

  // 5. Recompõe o XML trocando só o miolo de cada run.
  let out = "";
  let last = 0;
  segs.forEach((s, k) => {
    out += xml.slice(last, s.idx) + s.open + newInner[k] + s.close;
    last = s.idx + s.open.length + s.inner.length + s.close.length;
  });
  out += xml.slice(last);

  return { xml: out, missing: [...missing], unknown: [...unknown], count };
}

export interface FillDocxResult {
  bytes: Uint8Array;
  /** chaves de placeholders sem valor (viram [A PREENCHER]) — para revisão humana. */
  missing: string[];
  /** placeholders no template que não foram mapeados — sinal de config incompleta. */
  unknown: string[];
  /** total de placeholders substituídos em todas as partes. */
  count: number;
}

// Ponto de entrada: preenche o template inteiro (document + headers/footers com
// placeholders) e devolve os bytes do .docx. Substitui SÓ as partes de texto que
// contêm "{{"; header/styles/media nunca são reescritos (marca d'água intacta).
export async function fillDocxTemplate(
  templateBytes: ArrayBuffer | Uint8Array,
  values: Record<string, string | null | undefined>,
  opts: FillOptions = {},
): Promise<FillDocxResult> {
  const zip = await JSZip.loadAsync(templateBytes);
  const partNames = Object.keys(zip.files).filter((n) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(n),
  );
  if (!zip.file("word/document.xml")) {
    throw new Error("template inválido: word/document.xml ausente");
  }

  const missing = new Set<string>();
  const unknown = new Set<string>();
  let count = 0;

  for (const name of partNames) {
    const f = zip.file(name);
    if (!f) continue;
    const xml = await f.async("string");
    if (!xml.includes("{{")) continue; // parte sem placeholders — não toca
    const r = fillDocumentXml(xml, values, opts);
    zip.file(name, r.xml);
    r.missing.forEach((x) => missing.add(x));
    r.unknown.forEach((x) => unknown.add(x));
    count += r.count;
  }

  const bytes = await zip.generateAsync({
    type: "uint8array",
    mimeType: DOCX_MIME,
    compression: "DEFLATE",
  });
  return { bytes, missing: [...missing], unknown: [...unknown], count };
}
