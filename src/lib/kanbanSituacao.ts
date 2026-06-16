// SP1 Kanban — modelo de "situação" (visão simplificada de 5 estados sobre os
// 8 status reais de user_tasks). Os tipos vivem em src/types/jurisai.ts; aqui só
// ficam os helpers de apresentação e o mapa de derivação status -> situacao.
//
// Modelo duplo (status real <-> situacao):
//   draft, assigned                                  -> pendente
//   in_progress, awaiting_external,
//   awaiting_validation, blocked                      -> em_execucao
//   completed                                         -> concluida_sucesso (*)
//   cancelled                                         -> cancelado
//
// (*) `completed` é sempre mapeado aqui para `concluida_sucesso`. A distinção
//     entre "com sucesso" e "sem sucesso" depende de `payload.outcome` da tarefa
//     ('sem_sucesso'), informação que NÃO chega a esta função pura — ela é
//     resolvida no backend (função SQL kanban_situacao_from_status combinada à
//     leitura do payload nas RPCs). Mantemos esta lib determinística e sem efeitos.

import type { TaskSituacao, UserTaskStatus } from "@/types/jurisai";

/** Rótulos em PT-BR para exibição das colunas/cartões do Kanban. */
export const SITUACAO_LABELS: Record<TaskSituacao, string> = {
  pendente: "Pendente",
  em_execucao: "Em execução",
  concluida_sucesso: "Concluída com sucesso",
  concluida_sem_sucesso: "Concluída sem sucesso",
  cancelado: "Cancelado",
};

/** Ordem canônica das situações (esquerda -> direita no board padrão). */
export const SITUACAO_ORDER: TaskSituacao[] = [
  "pendente",
  "em_execucao",
  "concluida_sucesso",
  "concluida_sem_sucesso",
  "cancelado",
];

/**
 * Deriva a situação simplificada (5 estados) a partir do status real (8 estados).
 *
 * Espelha exatamente a função SQL `kanban_situacao_from_status`. Não recebe o
 * payload da tarefa, portanto `completed` sempre resulta em `concluida_sucesso`;
 * o caso `concluida_sem_sucesso` (payload.outcome = 'sem_sucesso') é resolvido
 * no backend, não aqui.
 */
export function situacaoFromStatus(status: UserTaskStatus): TaskSituacao {
  switch (status) {
    case "draft":
    case "assigned":
      return "pendente";
    case "in_progress":
    case "awaiting_external":
    case "awaiting_validation":
    case "blocked":
      return "em_execucao";
    case "completed":
      return "concluida_sucesso";
    case "cancelled":
      return "cancelado";
    default: {
      // Exaustividade: se um novo UserTaskStatus surgir sem mapeamento, o TS
      // acusa em tempo de compilação. Em runtime, fallback seguro para pendente.
      const _exhaustive: never = status;
      return "pendente";
    }
  }
}
