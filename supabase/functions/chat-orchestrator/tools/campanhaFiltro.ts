// Card 4 — filtro da campanha de ligação.
//
// As chaves são as MESMAS de `search_clients`: é isso que permite ao pré-voo do
// ActionCard contar a fila (com search_clients) usando exatamente o filtro que
// `criar_campanha` vai aplicar — o usuário vê quantos clientes entram antes de
// confirmar.
//
// Módulo próprio (e não dentro de handlers.ts) para poder ser testado sem puxar
// dependências que leem Deno.env no topo.

export const CAMPANHA_FILTRO_KEYS = [
  "recebe_em", "tem_consignado_com", "tem_extrato_de", "cidade", "uf",
  "status", "gov", "origem", "tem_pendencia", "docs_completos",
] as const;

// Bancos e UF são comparados em MAIÚSCULAS na base.
const UPPER_KEYS = new Set(["recebe_em", "tem_consignado_com", "tem_extrato_de", "uf"]);

/** Converte os args planos que o LLM informa no jsonb de filtro da RPC. */
export function montarFiltroCampanha(args: Record<string, unknown>): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  for (const k of CAMPANHA_FILTRO_KEYS) {
    const v = args[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "boolean") { f[k] = v; continue; }   // false é filtro válido
    const s = String(v).trim();
    if (!s) continue;
    f[k] = UPPER_KEYS.has(k) ? s.toUpperCase() : s;
  }
  return f;
}
