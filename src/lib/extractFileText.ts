import mammoth from "mammoth";
import PdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Sanitiza o texto extraido ANTES de qualquer insert no Postgres.
//
// Causa raiz do 400 em chat_attachments: o texto de alguns PDFs (extraido pelo
// pdf.js) contem null byte (codigo 0) e/ou UTF-16 invalido (surrogates soltos).
// O Postgres recusa o byte 0 em coluna `text` e o PostgREST devolve 400, fazendo
// o anexo falhar silenciosamente. Esta funcao remove esses caracteres,
// preservando \t \n \r. Aplicada em TODOS os caminhos de extracao (pdf/docx/txt).
//
// Implementado via charCodeAt (e nao regex com \uXXXX) de proposito: evita
// embutir bytes de controle no fonte e e robusto a UTF-16 invalido.
export function sanitizeExtractedText(s: string | null): string | null {
  if (!s) return null;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    // null byte: Postgres text nao aceita o byte 0
    if (code === 0) continue;
    // controles C0 perigosos, preservando \t (9), \n (10) e \r (13)
    if (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    // surrogate alto: so mantem se vier seguido de um surrogate baixo valido
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
        continue;
      }
      continue; // surrogate alto solto -> descarta
    }
    // surrogate baixo solto -> descarta
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    out += s[i];
  }
  out = out.trim();
  return out.length ? out : null;
}

// Reconstrói o layout de uma página de PDF usando a GEOMETRIA dos fragmentos.
//
// PRINCÍPIO: preencher do anexo SOMENTE com dado lido com alta confiança. O join(" ")
// puro achata a tabela e separa rótulo do valor (ex.: "INDÉBITO:" longe de "1.386,54"),
// jogando campos para [A PREENCHER] indevidamente. Aqui reagrupamos por LINHA (y) e
// ordenamos por COLUNA (x), inserindo " | " em saltos horizontais grandes — assim
// rótulo e valor voltam à mesma linha, parseáveis, SEM inventar nada.
//
// Se algum item não trouxer geometria (transform), lança erro → o chamador cai no
// método antigo (join por espaço). Nunca quebrar; pior caso = comportamento atual.
function reconstructPageText(items: any[]): string {
  interface Pos { str: string; x: number; y: number; w: number }
  const positioned: Pos[] = [];
  for (const it of items) {
    const t = it?.transform;
    if (!t || typeof t[4] !== "number" || typeof t[5] !== "number") {
      throw new Error("sem geometria (transform) — usar fallback");
    }
    const str = it.str;
    if (!str || !str.trim().length) continue;
    positioned.push({ str, x: t[4], y: t[5], w: typeof it.width === "number" ? it.width : 0 });
  }
  if (!positioned.length) return "";

  // Largura média de caractere → base dos limiares (tolerância de linha e gap de coluna).
  let charWSum = 0, charWN = 0;
  for (const p of positioned) {
    if (p.w > 0 && p.str.length) { charWSum += p.w / p.str.length; charWN++; }
  }
  const avgCharW = charWN ? charWSum / charWN : 5;
  const colGap = Math.max(avgCharW * 2.5, 12); // salto horizontal que separa colunas
  const yTol = 3;                              // itens com y dentro disto = mesma linha

  // y cresce de baixo p/ cima em PDF → ordenar DECRESCENTE (topo→base).
  const sorted = [...positioned].sort((a, b) => b.y - a.y);
  const lines: Pos[][] = [];
  for (const p of sorted) {
    const cur = lines[lines.length - 1];
    if (cur && Math.abs(cur[0].y - p.y) <= yTol) cur.push(p);
    else lines.push([p]);
  }

  const out: string[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x); // esquerda → direita
    let s = "";
    let prevRight: number | null = null;
    for (const p of line) {
      if (prevRight !== null) {
        const gap = p.x - prevRight;
        s += gap > colGap ? " | " : " ";
      }
      s += p.str;
      prevRight = p.x + (p.w > 0 ? p.w : p.str.length * avgCharW);
    }
    out.push(s.replace(/[ \t]{2,}/g, " ").trim());
  }
  return out.join("\n");
}

export async function extractFileText(file: File): Promise<string | null> {
  const mime = file.type || "";

  if (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime === "text/x-markdown"
  ) {
    return sanitizeExtractedText(await file.text());
  }

  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return sanitizeExtractedText(result.value || null);
  }

  if (mime === "application/pdf") {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      // Worker empacotado localmente via Vite (evita 404 do CDN p/ v6.x)
      pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorkerUrl;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let pageText: string;
        try {
          // Reconstrução geométrica (rótulo↔valor na mesma linha em tabelas).
          pageText = reconstructPageText(textContent.items as any[]);
        } catch {
          // Fallback: método antigo (join por espaço) se faltar geometria.
          pageText = (textContent.items as any[]).map((item) => item.str).join(" ");
        }
        pages.push(pageText);
      }
      return sanitizeExtractedText(pages.join("\n\n") || null);
    } catch (err) {
      console.error("[extractFileText] Falha ao extrair texto do PDF:", err);
      return null;
    }
  }

  return null;
}
