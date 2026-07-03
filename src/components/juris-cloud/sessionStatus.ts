// Status POR conversa, derivado do estado REAL da run (card 2.4).
//
// REGRA DE HONESTIDADE: só exibimos um status que dá para derivar com confiança
// do backend. Um estado que não seja derivável de forma confiável NÃO é
// inventado — melhor menos status corretos do que um status falso.
//
// Fontes de verdade (mapeadas do que já existe, sem tocar no backend):
//  - runStates (mapa session_id → RunState do 2.3): sinal AO VIVO de geração.
//    thinking=true ⇒ "em andamento", mesmo antes de o status da run ser gravado
//    no banco (cobre a janela entre disparar a orquestração e o 1o UPDATE).
//  - orchestration_runs.status da ÚLTIMA run da sessão (persistido). Os valores
//    são exatamente os que o chat-orchestrator grava:
//      routing_n1 · routing_n2 · executing_n3 · validating_n2 · validating_n1
//        → run em progresso  ⇒ "em andamento"
//      done                  → resposta entregue ⇒ "concluída"
//      failed                → run falhou         ⇒ "erro"
//      awaiting_confirmation → aguardando o usuário ⇒ "aguardando ação"
//
// NÃO existe status `cancelled` em orchestration_runs hoje (o "cancelled" do
// código é de agent_actions, não da run). Como não é derivável, "cancelada"
// NÃO é mapeada aqui — seria um status inventado.

export type ConversationStatus = "em_andamento" | "concluida" | "aguardando" | "erro";

// Status não-terminais que o chat-orchestrator grava enquanto processa a run.
// Qualquer um deles significa que a conversa ainda está sendo gerada.
export const ACTIVE_RUN_STATUSES = [
  "routing_n1",
  "routing_n2",
  "executing_n3",
  "validating_n2",
  "validating_n1",
] as const;

/**
 * Deriva o status de UMA conversa a partir do status da sua última run e do
 * sinal ao vivo de "processando" (mapa runStates do 2.3).
 *
 * Retorna `null` quando o status não é derivável de forma confiável:
 *  - sem run conhecida para a sessão, ou
 *  - status de run desconhecido (não mapeado).
 * Nesses casos NÃO exibimos rótulo — em vez de inventar um.
 */
export function deriveConversationStatus(
  runStatus: string | null | undefined,
  isThinking: boolean,
): ConversationStatus | null {
  // O sinal ao vivo do 2.3 tem prioridade: se a UI já rastreia esta conversa
  // como "processando", ela está em andamento — mesmo que o banco ainda não
  // tenha o 1o UPDATE da run.
  if (isThinking) return "em_andamento";
  if (!runStatus) return null; // sem run → sem status inventado
  if ((ACTIVE_RUN_STATUSES as readonly string[]).includes(runStatus)) return "em_andamento";
  switch (runStatus) {
    case "done": return "concluida";
    case "failed": return "erro";
    case "awaiting_confirmation": return "aguardando";
    default: return null; // status desconhecido → não inventa
  }
}

/** Metadados de exibição (rótulo + cores) de cada status. */
export const STATUS_META: Record<
  ConversationStatus,
  { label: string; fg: string; dot: string; bg: string; border: string }
> = {
  em_andamento: { label: "Em andamento",   fg: "#FDE68A", dot: "#EAB308", bg: "rgba(234,179,8,0.12)",  border: "rgba(234,179,8,0.35)" },
  concluida:    { label: "Concluída",       fg: "#86EFAC", dot: "#22C55E", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.35)" },
  aguardando:   { label: "Aguardando ação", fg: "#FCD34D", dot: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)" },
  erro:         { label: "Erro",            fg: "#FCA5A5", dot: "#EF4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)" },
};
