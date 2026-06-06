import mammoth from "mammoth";
import PdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export async function extractFileText(file: File): Promise<string | null> {
  const mime = file.type || "";

  if (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime === "text/x-markdown"
  ) {
    return file.text();
  }

  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || null;
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
      return pages.join("\n\n") || null;
    } catch (err) {
      console.error("[extractFileText] Falha ao extrair texto do PDF:", err);
      return null;
    }
  }

  return null;
}
