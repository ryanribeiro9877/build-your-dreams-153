// src/lib/processLabel.ts
//
// Item 3d do reteste 3 (27/07): `process_number` é o número do processo no
// TRIBUNAL. Antes, quando o processo era aberto pelo chat sem número, gravávamos ali
// um rótulo descritivo ("(a distribuir) — [TESTE] — Refin… — 27/07 13:15") — o que
// quebraria busca por número, registrar_protocolo, integração futura com Projudi/PJE
// e relatórios. Agora o campo fica NULL até existir número real e o rótulo legível é
// DERIVADO na exibição, por este helper.
//
// Puro e testável: não faz I/O e nunca inventa número.

export interface ProcessLabelInput {
  process_number?: string | null;
  /** Nome do tipo de ação, quando a tela já o resolveu. */
  tipo_acao_nome?: string | null;
  client_name?: string | null;
  created_at?: string | null;
}

/** Trunca sem cortar no meio de palavra quando possível. */
function short(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim();
}

function dataCurta(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Bahia" });
}

/**
 * Rótulo do processo para EXIBIÇÃO. Com número real, devolve o número. Sem número,
 * monta "(a distribuir) — <cliente> — <tipo> — <data>" com as partes disponíveis.
 */
export function processLabel(p: ProcessLabelInput): string {
  const num = p.process_number?.trim();
  if (num) return num;
  const partes: string[] = ["(a distribuir)"];
  const nome = p.client_name?.trim();
  if (nome) partes.push(nome.split(/\s+/)[0]);
  const tipo = p.tipo_acao_nome?.trim();
  if (tipo) partes.push(short(tipo, 28));
  const quando = p.created_at ? dataCurta(p.created_at) : null;
  if (quando) partes.push(quando);
  return partes.join(" — ");
}
