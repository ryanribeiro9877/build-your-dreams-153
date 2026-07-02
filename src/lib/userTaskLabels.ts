import type { UserTaskStatus } from "@/types/jurisai";

/**
 * Rótulos e ordenação dos status de `user_tasks` — usados pelo MyInbox
 * (página "Minhas Tarefas"), para evitar duplicação de mapas.
 */
export const USER_TASK_STATUS_LABELS: Record<UserTaskStatus, string> = {
  draft: "Rascunho",
  assigned: "Atribuída",
  in_progress: "Em andamento",
  awaiting_external: "Aguardando externo",
  awaiting_validation: "Aguardando validação",
  blocked: "Bloqueada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

/**
 * Ordem das "filas" no painel lateral — apenas status de trabalho aberto.
 * `draft`, `completed` e `cancelled` ficam de fora (o inbox já exclui concluídas).
 */
export const OPEN_QUEUE_STATUSES: UserTaskStatus[] = [
  "assigned",
  "in_progress",
  "awaiting_external",
  "awaiting_validation",
  "blocked",
];
