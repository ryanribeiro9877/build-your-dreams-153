import { Fragment } from "react";

/**
 * SafeMarkdown — renderer mínimo de markdown para mensagens de agentes.
 *
 * NUNCA usa dangerouslySetInnerHTML. Whitelist explícita:
 *   - **negrito**          → <strong>
 *   - *itálico*            → <em>
 *   - `código inline`      → <code>
 *   - [texto](url)         → <a> (apenas https://, http:// e mailto:)
 *   - quebras de linha     → <br/>
 *
 * Qualquer outro markdown ou HTML é renderizado como texto puro.
 * Links são sanitizados: protocolos perigosos (javascript:, data:, vbscript:)
 * são descartados e o link vira texto.
 */

type Node = { type: "text"; value: string }
  | { type: "strong"; children: Node[] }
  | { type: "em"; children: Node[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Node[] }
  | { type: "br" };

const SAFE_PROTOCOLS = /^(https?:\/\/|mailto:)/i;

function tokenize(input: string): Node[] {
  // Order matters: code first to protect content inside backticks.
  const out: Node[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\*[^*\n]+?\*)|(\[([^\]]+)\]\(([^)]+)\))|(\n)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) {
      out.push({ type: "text", value: input.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      out.push({ type: "code", value: match[1].slice(1, -1) });
    } else if (match[2]) {
      out.push({ type: "strong", children: [{ type: "text", value: match[2].slice(2, -2) }] });
    } else if (match[3]) {
      out.push({ type: "em", children: [{ type: "text", value: match[3].slice(1, -1) }] });
    } else if (match[4]) {
      const text = match[5];
      const href = match[6].trim();
      if (SAFE_PROTOCOLS.test(href)) {
        out.push({ type: "link", href, children: [{ type: "text", value: text }] });
      } else {
        // Unsafe protocol — render as plain text only.
        out.push({ type: "text", value: text });
      }
    } else if (match[7]) {
      out.push({ type: "br" });
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < input.length) {
    out.push({ type: "text", value: input.slice(lastIndex) });
  }
  return out;
}

function renderNodes(nodes: Node[]): React.ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return <Fragment key={i}>{n.value}</Fragment>;
      case "strong":
        return <strong key={i}>{renderNodes(n.children)}</strong>;
      case "em":
        return <em key={i}>{renderNodes(n.children)}</em>;
      case "code":
        return <code key={i} style={{ background: "var(--bg4)", padding: "1px 5px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: "0.92em" }}>{n.value}</code>;
      case "link":
        return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", textDecoration: "underline" }}>{renderNodes(n.children)}</a>;
      case "br":
        return <br key={i} />;
    }
  });
}

// B5 (E2E 24/07): a aba congelou ~3 min ao renderizar a resposta de um fluxo. Sem
// teto, uma mensagem muito grande (payload cru do orquestrador, JSON de resultado
// de tool, resposta longa do LLM) virava MILHARES de nós React de uma vez — long
// task que trava a aba inteira. Guardas:
//   · até RICH_LIMIT: formatação completa (caso normal — mensagens de chat);
//   · acima: renderiza como TEXTO PURO (1 nó, custo O(1)) — nada se perde, só a
//     formatação; muito melhor que travar;
//   · acima de HARD_LIMIT: trunca e avisa, para não estourar memória/layout.
export const RICH_LIMIT = 20_000;
export const HARD_LIMIT = 200_000;

export function SafeMarkdown({ children, className }: { children: string; className?: string }) {
  if (!children) return null;
  if (children.length > RICH_LIMIT) {
    const truncated = children.length > HARD_LIMIT;
    const text = truncated ? children.slice(0, HARD_LIMIT) : children;
    return (
      <div className={className} style={{ whiteSpace: "pre-wrap" }}>
        {text}
        {truncated && (
          <span style={{ display: "block", marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            […] conteúdo muito longo — exibindo os primeiros {HARD_LIMIT.toLocaleString("pt-BR")} caracteres.
          </span>
        )}
      </div>
    );
  }
  const nodes = tokenize(children);
  return <div className={className}>{renderNodes(nodes)}</div>;
}
