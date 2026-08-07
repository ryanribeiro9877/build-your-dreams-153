import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "npm:docx@9.7.1";

export const PECA_DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function limparMarkdownInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, "$1");
}

function tituloDoMarkdown(markdown: string): string | null {
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1];
    if (!heading) continue;
    const clean = limparMarkdownInline(heading).replace(/\s+/g, " ").trim();
    if (clean.length >= 4) return clean;
  }
  return null;
}

export function nomeDaPeca(
  markdown: string,
  clientName?: string | null,
): string {
  const primeiro = tituloDoMarkdown(markdown);
  const base = primeiro && primeiro.length <= 150 ? primeiro : "Peça jurídica";
  const cliente = String(clientName ?? "").replace(/\s+/g, " ").trim();
  const nome = cliente &&
      !base.toLocaleLowerCase("pt-BR").includes(
        cliente.toLocaleLowerCase("pt-BR"),
      )
    ? `${base} — ${cliente}`
    : base;
  return nome.slice(0, 200);
}

function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const token = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text)) !== null) {
    if (match.index > cursor) {
      runs.push(
        new TextRun(limparMarkdownInline(text.slice(cursor, match.index))),
      );
    }
    if (match[2] != null) {
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[4] != null) {
      runs.push(new TextRun({ text: match[4], italics: true }));
    } else runs.push(new TextRun(match[5] ?? ""));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    runs.push(new TextRun(limparMarkdownInline(text.slice(cursor))));
  }
  return runs.length ? runs : [new TextRun("")];
}

function paragraphFromLine(raw: string, inCode: boolean): Paragraph | null {
  const line = raw.trim();
  if (!line) return new Paragraph({ text: "", spacing: { after: 120 } });
  if (/^[-*_]{3,}$/.test(line)) return null;

  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    return new Paragraph({
      heading: HEADING_LEVELS[Math.min(heading[1].length, 6) - 1],
      children: inlineRuns(heading[2]),
      spacing: { before: 240, after: 160 },
    });
  }

  const bullet = line.match(/^[-+*]\s+(.+)$/);
  if (bullet) {
    return new Paragraph({
      numbering: { reference: "peca-bullets", level: 0 },
      children: inlineRuns(bullet[1]),
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 80 },
    });
  }

  const ordered = line.match(/^\d+[.)]\s+(.+)$/);
  if (ordered) {
    return new Paragraph({
      numbering: { reference: "peca-numbers", level: 0 },
      children: inlineRuns(ordered[1]),
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 80 },
    });
  }

  const quote = line.match(/^>\s?(.*)$/);
  const text = quote?.[1] ?? line;
  return new Paragraph({
    children: inCode
      ? [new TextRun({ text, font: "Courier New", size: 20 })]
      : inlineRuns(text),
    alignment: AlignmentType.JUSTIFIED,
    indent: quote ? { left: 720, right: 360 } : undefined,
    spacing: { line: inCode ? 280 : 360, after: 120 },
  });
}

/**
 * Materializa o texto final da peça como DOCX editável. O arquivo é deliberadamente
 * simples: A4, margens forenses usuais (3 cm superior/esquerda; 2 cm inferior/direita),
 * Arial 12 e corpo justificado com espaçamento 1,5.
 */
export async function materializarPecaDocx(markdown: string): Promise<Blob> {
  const children: Paragraph[] = [];
  let inCode = false;
  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      continue;
    }
    const paragraph = paragraphFromLine(raw, inCode);
    if (paragraph) children.push(paragraph);
  }
  if (children.length === 0) children.push(new Paragraph(""));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 24 } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Arial", size: 28, bold: true },
          paragraph: { alignment: AlignmentType.CENTER, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Arial", size: 26, bold: true },
          paragraph: { alignment: AlignmentType.LEFT, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "peca-bullets",
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: "peca-numbers",
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1701, right: 1134, bottom: 1134, left: 1701 },
        },
      },
      children,
    }],
  });

  const bytes = await Packer.toArrayBuffer(doc);
  return new Blob([bytes], { type: PECA_DOCX_MIME });
}
