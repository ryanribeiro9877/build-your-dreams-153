// Truncamento do TRECHO de uma peça no balão do chat.
//
// Quando o sistema gera uma peça longa (petição, contestação…), despejar a peça
// inteira no balão deixa a conversa gigante e poluída. Aqui reduzimos o balão às
// PRIMEIRAS N LINHAS (o começo — cabeçalho/síntese), o suficiente para reconhecer
// a peça; o "Ver peça completa" abre o texto inteiro num modal separado.
//
// Só faz sentido truncar peças realmente longas: um texto com <= N linhas cabe no
// balão e não precisa de "Ver mais".

export const PECA_PREVIEW_LINES = 10;

export interface PecaPreview {
  /** Trecho exibido no balão (as primeiras `maxLines` linhas quando truncado). */
  preview: string;
  /** Há mais conteúdo além do trecho? Controla o fade + botão "Ver peça completa". */
  truncated: boolean;
}

/**
 * Reduz o texto às primeiras `maxLines` linhas, preservando as quebras (e portanto
 * o markdown por linha que o SafeMarkdown respeita). Não altera o texto original —
 * o download continua usando a peça COMPLETA.
 */
export function truncatePecaPreview(text: string, maxLines: number = PECA_PREVIEW_LINES): PecaPreview {
  if (!text) return { preview: "", truncated: false };
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { preview: text, truncated: false };
  return { preview: lines.slice(0, maxLines).join("\n"), truncated: true };
}
