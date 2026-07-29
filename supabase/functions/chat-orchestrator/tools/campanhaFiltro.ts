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

/**
 * ALIASES defensivos (29/07). `search_clients` IGNORA chave desconhecida em silêncio:
 * medido no banco, `{"consignado_com":"AGIBANK"}` devolve 562 (a base TODA) enquanto
 * `{"tem_consignado_com":"AGIBANK"}` devolve 214. Uma campanha criada com o nome
 * errado colocaria a base inteira na fila de ligação. Como a documentação circula com
 * os dois nomes, traduzimos em vez de deixar passar.
 *
 * NÃO existe alias de "nível" para `gov`: em `search_clients`, `gov` é BOOLEANO
 * (`gov_br_profile is not null`), não o nível da conta. `{"gov":"bronze"}` viraria
 * `('bronze')::boolean` e derrubaria criar_campanha com 22P02. Filtrar por
 * bronze/prata/ouro não é possível hoje — a RPC não expõe essa comparação
 * (converter_conta_bronze é OBJETIVO da campanha, não filtro).
 */
const FILTRO_ALIASES: Record<string, string> = {
  consignado_com: "tem_consignado_com",
  extrato_de: "tem_extrato_de",
  recebe: "recebe_em",
  banco_beneficio: "recebe_em",
};

/**
 * Chaves que `search_clients` lê com `::boolean`. Valor que o Postgres não sabe
 * converter (o "sim" que o LLM adora) derruba a RPC com 22P02, então coagimos
 * aqui e DESCARTAMOS o que não for reconhecível — filtro a menos devolve gente
 * demais na contagem do pré-voo (visível antes de confirmar), enquanto um 22P02
 * mata a criação da campanha.
 */
const BOOLEAN_KEYS = new Set(["gov", "tem_pendencia", "docs_completos"]);
const BOOL_TRUE = new Set(["true", "t", "1", "sim", "s", "yes", "y", "on"]);
const BOOL_FALSE = new Set(["false", "f", "0", "nao", "não", "n", "no", "off"]);

function coagirBooleano(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (BOOL_TRUE.has(s)) return true;
  if (BOOL_FALSE.has(s)) return false;
  return undefined;
}

/**
 * Objetivos ACEITOS pelo CHECK de `campanhas.objetivo` (lido do banco em 29/07):
 * pedir_documento · pedir_senha_gov · agendar_atendimento · renovar_procuracao ·
 * converter_conta_bronze · informar_andamento · outro.
 * A documentação circula com nomes curtos ("agendar", "pedir_procuracao") que
 * violariam o CHECK (23514) — traduzimos; desconhecido cai em 'outro' em vez de
 * derrubar a criação da campanha.
 */
const OBJETIVOS_VALIDOS = new Set([
  "pedir_documento", "pedir_senha_gov", "agendar_atendimento", "renovar_procuracao",
  "converter_conta_bronze", "informar_andamento", "outro",
]);
const OBJETIVO_ALIASES: Record<string, string> = {
  agendar: "agendar_atendimento",
  agendamento: "agendar_atendimento",
  pedir_procuracao: "renovar_procuracao",
  procuracao: "renovar_procuracao",
  pedir_senha: "pedir_senha_gov",
  senha_gov: "pedir_senha_gov",
  pedir_extrato: "pedir_documento",
  documento: "pedir_documento",
  converter_bronze: "converter_conta_bronze",
  bronze: "converter_conta_bronze",
  andamento: "informar_andamento",
};

export function normalizarObjetivoCampanha(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!s) return "outro";
  if (OBJETIVOS_VALIDOS.has(s)) return s;
  return OBJETIVO_ALIASES[s] ?? "outro";
}

/** Converte os args planos que o LLM informa no jsonb de filtro da RPC. */
export function montarFiltroCampanha(args: Record<string, unknown>): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  // Normaliza aliases ANTES de ler as chaves canônicas (sem sobrescrever a canônica).
  const src: Record<string, unknown> = { ...args };
  for (const [alias, canonica] of Object.entries(FILTRO_ALIASES)) {
    if (src[alias] !== undefined && src[canonica] === undefined) src[canonica] = src[alias];
  }
  for (const k of CAMPANHA_FILTRO_KEYS) {
    const v = src[k];
    if (v === undefined || v === null) continue;
    if (BOOLEAN_KEYS.has(k)) {
      const b = coagirBooleano(v);
      if (b !== undefined) f[k] = b;                      // false é filtro válido
      continue;
    }
    const s = String(v).trim();
    if (!s) continue;
    f[k] = UPPER_KEYS.has(k) ? s.toUpperCase() : s;
  }
  return f;
}
