import { jsPDF } from "jspdf";

/**
 * Gera e baixa um PDF a partir do conteudo (markdown) de uma mensagem do agente.
 * Pensado para pecas/peticoes: cabecalho, titulos em negrito, paragrafos com
 * quebra automatica e paginacao. Parsing leve de markdown (sem dependencia extra).
 */
export function downloadMessageAsPdf(content: string, opts?: { agentName?: string; title?: string }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const marginTop = 22;
  const marginBottom = 18;
  const maxW = pageW - marginX * 2;
  let y = marginTop;

  const now = new Date();
  const dataStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const agent = opts?.agentName || "Assistente";

  // ── Cabecalho ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(184, 144, 47); // dourado JurisAI
  doc.text("JurisAI", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 122);
  doc.text(`${agent} · ${dataStr}`, pageW - marginX, y, { align: "right" });
  y += 4;
  doc.setDrawColor(224, 214, 184);
  doc.line(marginX, y, pageW - marginX, y);
  y += 8;

  const ensureSpace = (lineH: number) => {
    if (y + lineH > pageH - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const writeWrapped = (text: string, fontSize: number, bold: boolean, color: [number, number, number], extraGap = 0) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lineH = fontSize * 0.5 + 1.6;
    const lines = doc.splitTextToSize(text, maxW);
    for (const ln of lines) {
      ensureSpace(lineH);
      doc.text(ln, marginX, y);
      y += lineH;
    }
    y += extraGap;
  };

  // Limpa markdown inline simples (negrito/italico/codigo).
  const clean = (s: string) => s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
    .replace(/`(.+?)`/g, "$1");

  const DARK: [number, number, number] = [35, 35, 46];
  const GOLD: [number, number, number] = [150, 120, 40];

  const lines = (content || "").replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (trimmed === "") { y += 2.5; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      writeWrapped(clean(h[2]), level <= 2 ? 13 : 11.5, true, level <= 2 ? GOLD : DARK, 1.5);
      continue;
    }
    // separador horizontal
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      ensureSpace(4);
      doc.setDrawColor(224, 214, 184);
      doc.line(marginX, y, pageW - marginX, y);
      y += 4;
      continue;
    }
    // bullet
    const b = /^[-*]\s+(.*)$/.exec(trimmed);
    if (b) { writeWrapped("•  " + clean(b[1]), 10, false, DARK); continue; }
    // numerada
    const n = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
    if (n) { writeWrapped(`${n[1]}.  ${clean(n[2])}`, 10, false, DARK); continue; }
    // paragrafo normal
    writeWrapped(clean(trimmed), 10, false, DARK, 1);
  }

  // ── Rodape com paginacao ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 160);
    doc.text("Gerado por JurisAI — revise antes de protocolar.", marginX, pageH - 10);
    doc.text(`${i}/${pages}`, pageW - marginX, pageH - 10, { align: "right" });
  }

  const slug = (opts?.title || "peca").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  doc.save(`${slug || "peca"}_${stamp}.pdf`);
}
