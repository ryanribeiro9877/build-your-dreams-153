// clientResolver.ts — Resolvedor de cliente (base do ponto 7 do CADASTRO-MODELO-A-REFINO).
//
// A partir de uma frase em linguagem natural ("quero anexar documentos do
// cliente João Silva" / "modificar o cadastro do 084.822.105-21"), extrai o
// identificador do cliente e resolve para um client_id, tratando:
//   0 resultados  → "none"       (o chat responde "não encontrei")
//   1 resultado   → "resolved"   (usa direto)
//   N resultados  → "ambiguous"  (o chat pergunta "qual desses?")
//
// Lógica PURA e testável: a busca é injetada (na produção, envolve o RPC
// `agent_consultar_cliente`). Ainda sem consumidor — o disparo por edição/anexos
// no chat é o "último passo" do ponto 7, num ciclo seguinte.

export type ClientHit = {
  id: string;
  full_name: string;
  cpf_masked?: string;
  city?: string;
};

export type ClientResolution =
  | { status: "none" }
  | { status: "resolved"; client: ClientHit }
  | { status: "ambiguous"; candidates: ClientHit[] };

// CPF com ou sem máscara (11 dígitos).
const CPF_RE = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
// "...do/da/dos cliente X" até uma pontuação forte ou fim da frase.
const CLIENTE_RE = /(?:d[oa]s?\s+)?cliente\s+(.+?)\s*(?:[.,;:!?]|$)/i;
// "cadastro de/do X".
const CADASTRO_DE_RE = /cadastro\s+d[oe]\s+(.+?)\s*(?:[.,;:!?]|$)/i;

/**
 * Extrai o identificador do cliente da frase. CPF tem precedência (mais
 * específico); depois "cliente X"; depois "cadastro de X". Retorna null se não
 * achar alvo — o chamador NÃO deve tentar resolver com a frase inteira.
 */
export function extractClientQuery(message: string): string | null {
  if (!message) return null;
  const cpf = message.match(CPF_RE);
  if (cpf) return cpf[0];
  const m1 = message.match(CLIENTE_RE);
  if (m1?.[1]?.trim()) return m1[1].trim();
  const m2 = message.match(CADASTRO_DE_RE);
  if (m2?.[1]?.trim()) return m2[1].trim();
  return null;
}

/**
 * Resolve o cliente a partir de uma função de busca injetada (0/1/N).
 * `search(query)` deve retornar 0..N hits (na produção, `agent_consultar_cliente`).
 */
export async function resolveClient(
  search: (q: string) => Promise<ClientHit[]>,
  query: string,
): Promise<ClientResolution> {
  const hits = (await search(query)) ?? [];
  if (hits.length === 0) return { status: "none" };
  if (hits.length === 1) return { status: "resolved", client: hits[0] };
  return { status: "ambiguous", candidates: hits };
}
