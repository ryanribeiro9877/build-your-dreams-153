// Card 2.2 — Progresso simples + tempo de atividade.
//
// O backend (edge chat-orchestrator, insertStage) grava etapas intermediárias em
// chat_messages com metadata.kind='stage' e metadata.stage. No chat NÃO reexibimos
// o log técnico dessas etapas (elas continuam ocultas como balões); em vez disso
// TRADUZIMOS a etapa mais recente para um status humano e curto (estilo ChatGPT)
// que aparece em UMA linha que ATUALIZA — junto de um cronômetro de atividade.
//
// Mapa stage -> rótulo amigável. As chaves são os valores de `stage` emitidos pelo
// edge (grep insertStage): routing_n1, routing_n2, executing_n3, validating_n2.
export const STAGE_STATUS_LABELS: Record<string, string> = {
  // "Meu Assistente analisando sua solicitacao..."
  routing_n1: "Analisando sua solicitação",
  // "Encaminhado a <especialista>." — o Diretor roteou o caso.
  routing_n2: "Analisando o caso",
  // Redação/execução da peça pelo especialista (N3). Quando o Caminho B emite o
  // número do bloco no texto, o rótulo vira "Gerando bloco X de N" (ver abaixo).
  executing_n3: "Gerando o documento",
  // Validação mecânica + consultiva da minuta pelo N2.
  validating_n2: "Revisando a minuta",
};

/** Rótulo padrão enquanto nenhuma etapa chegou (ou stage desconhecido). */
export const DEFAULT_STATUS_LABEL = "Pensando";

/**
 * Progresso REAL por bloco (Caminho B / tarefas longas).
 *
 * O edge NÃO expõe o bloco atual/total em metadata estruturada — apenas embute o
 * número no TEXTO da etapa, ex.: "Redigindo <seção> (2 de 5)..." ou
 * "<agente> corrigindo a peça (bloco 2 de 5)...". Como esse texto vem do backend,
 * é progresso real e pode ser consumido por parsing. Só reconhecemos a forma entre
 * parênteses com "de" para não capturar "(rodada 1/3)" (usa barra) nem números
 * soltos do conteúdo.
 *
 * REGRA DE HONESTIDADE: retorna null quando não há número real — o chamador então
 * mostra só o rótulo + cronômetro, nunca um contador decorativo.
 */
export function parseBlockProgress(content?: string | null): { current: number; total: number } | null {
  if (!content) return null;
  const m = content.match(/\(\s*(?:bloco\s+)?(\d+)\s+de\s+(\d+)\s*\)/i);
  if (!m) return null;
  const current = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total)) return null;
  if (total <= 0 || current <= 0 || current > total) return null;
  return { current, total };
}

/**
 * Rótulo de status para a etapa mais recente. Se o texto da etapa carregar
 * progresso real de bloco, prioriza "Gerando bloco X de N"; senão usa o mapa
 * stage->rótulo; sem stage conhecido, cai no rótulo padrão.
 */
export function stageStatusLabel(stage?: string | null, content?: string | null): string {
  const block = parseBlockProgress(content);
  if (block) return `Gerando bloco ${block.current} de ${block.total}`;
  if (stage && STAGE_STATUS_LABELS[stage]) return STAGE_STATUS_LABELS[stage];
  return DEFAULT_STATUS_LABEL;
}
