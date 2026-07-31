/* Tipos do leitor de .xlsx para o TypeScript do front.
   O leitor é .mjs porque nasceu nos scripts de importação em lote (Node) e roda
   nos DOIS ambientes: caminho de arquivo no Node, File/Blob no navegador. A
   importação de audiências pela tela (Card 13 · 3.1) precisa dele no bundle, e o
   tsc do app não lê .mjs — daí esta declaração AO LADO do módulo, em vez de uma
   segunda cópia do leitor em TypeScript (duas cópias divergem). */

export interface XlsxSheet {
  name: string;
  /** Células como texto. Linha ausente/ignorada vem como []. */
  rows: string[][];
}

export interface XlsxProgress {
  name: string;
  index: number;
  total: number;
  rows: number;
  ms: number;
  skipped: boolean;
}

export interface ReadWorkbookOptions {
  /** Prefixos de nome de aba a parsear; as demais vêm com rows: []. */
  onlySheets?: string[] | null;
  /** Teto de colunas por linha (default 64). */
  maxCol?: number;
  onSheet?: (info: XlsxProgress) => void;
}

export function readWorkbook(
  entrada: string | Uint8Array | ArrayBuffer | Blob,
  opts?: ReadWorkbookOptions,
): Promise<XlsxSheet[]>;
