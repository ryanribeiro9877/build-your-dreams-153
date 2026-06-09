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
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");
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
