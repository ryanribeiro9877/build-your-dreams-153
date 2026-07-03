// Estado de "processando" POR conversa (session_id).
//
// Correção do bug 2.3: a reconciliação do #18 rastreava UMA única run
// ("currentRunId"). Com duas conversas gerando em paralelo, esse slot único
// misturava o estado (sobreposição das perguntas) e, ao trocar de conversa,
// sobrescrevia/limpava a run corrente por cima das mensagens já carregadas
// (as respostas "sumiam" até a run terminar).
//
// Aqui o estado é um MAPA session_id → RunState: cada conversa tem o SEU próprio
// runId/thinking/liveStage/cronômetro, e mexer em uma nunca afeta as outras.

import type { LiveStage } from "./liveStatus";

export type RunState = {
  /** Id da run no backend (permite reconciliar por id, não só por sessão). */
  runId: string | null;
  /** "Processando" ligado para ESTA conversa. */
  thinking: boolean;
  /** Fase amigável + "bloco X de N" desta conversa. */
  liveStage: LiveStage | null;
  /** Início do cronômetro desta conversa (ms). null quando parada. */
  thinkingStartedAt: number | null;
};

/** Estado inicial de uma conversa sem geração em andamento. */
export const EMPTY_RUN_STATE: RunState = {
  runId: null,
  thinking: false,
  liveStage: null,
  thinkingStartedAt: null,
};

export type RunStateMap = Record<string, RunState>;

/**
 * Aplica um patch à entrada de UMA conversa, preservando TODAS as outras.
 *
 * - `patch === null` remove a entrada da conversa (encerra o "processando").
 * - patch parcial mescla sobre o estado atual da conversa (ou sobre
 *   EMPTY_RUN_STATE se ainda não existia).
 *
 * Retorna o mapa anterior inalterado quando não há mudança efetiva (remover uma
 * entrada inexistente), para evitar re-render desnecessário.
 */
export function applyRunPatch(
  prev: RunStateMap,
  sid: string,
  patch: Partial<RunState> | null,
): RunStateMap {
  if (patch === null) {
    if (!(sid in prev)) return prev;
    const next = { ...prev };
    delete next[sid];
    return next;
  }
  const cur = prev[sid] ?? EMPTY_RUN_STATE;
  return { ...prev, [sid]: { ...cur, ...patch } };
}
