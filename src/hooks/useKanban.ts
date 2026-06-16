import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import type {
  TaskSituacao,
  KanbanBoardSummary,
  KanbanBoardDetailBoard,
  KanbanColumn,
  KanbanCardV2,
  KanbanBoardDetail,
} from "@/types/jurisai";

/**
 * Hooks do Kanban V2 (boards configuráveis — SP1).
 *
 * Modelo duplo: cada card é uma `user_tasks` (status de 8 valores, fluxo V14/V18)
 * espelhada em uma "situação" simplificada de 5 valores (`task_situacao`) usada
 * para posicionar o card nas colunas do board. Mover um card entre colunas pode
 * (ou não) alterar o status real da tarefa — toda a lógica de mapeamento e a
 * regra de NÃO-SOBRESCRITA vivem no backend (RPC kanban_move_card).
 *
 * useKanbanBoards — lista de boards visíveis ao usuário (com favorito/contagem)
 * useKanbanBoard(boardId) — board único + colunas + cards
 *
 * Funções async exportadas (todas via supabase.rpc, lançam em erro):
 *   moveCard, addTaskToBoard, removeTaskFromBoard, createBoard, updateBoard,
 *   deleteBoard, setColumns, setBoardGrants, toggleFavorite.
 *
 * Realtime: a lista ouve kanban_boards + kanban_board_favorites; o board único
 * ouve user_tasks + kanban_card_placements + kanban_columns.
 */

// ─── Lista de boards ──────────────────────────────────────────────────────────
export function useKanbanBoards() {
  const { user } = useAuth();

  const { data, loading, error, refetch } = useSupabaseQuery<KanbanBoardSummary[]>({
    queryKey: "kanban-boards",
    enabled: !!user,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_kanban_boards" as never);
      if (rpcErr) throw rpcErr;
      return (data as unknown as KanbanBoardSummary[]) || [];
    },
    realtime: [
      { table: "kanban_boards" },
      { table: "kanban_board_favorites" },
    ],
  });

  return { boards: data ?? [], loading, error, refresh: refetch };
}

// ─── Board único (detalhe + colunas + cards) ──────────────────────────────────
export function useKanbanBoard(boardId: string | null) {
  const { data, loading, error, refetch } = useSupabaseQuery<KanbanBoardDetail>({
    queryKey: `kanban-board-${boardId ?? "none"}`,
    enabled: !!boardId,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_kanban_board" as never, {
        p_board_id: boardId,
      } as never);
      if (rpcErr) throw rpcErr;
      return data as unknown as KanbanBoardDetail;
    },
    realtime: [
      { table: "user_tasks" },
      { table: "kanban_card_placements" },
      { table: "kanban_columns" },
    ],
  });

  return {
    board: (data?.board ?? null) as KanbanBoardDetailBoard | null,
    columns: (data?.columns ?? []) as KanbanColumn[],
    cards: (data?.cards ?? []) as KanbanCardV2[],
    loading,
    error,
    refresh: refetch,
  };
}

// ─── Movimentação de cards ─────────────────────────────────────────────────────
/**
 * Move um card para uma coluna/posição. O backend decide se o status real da
 * tarefa muda (mapa inverso situação→status) ou se apenas o placement é
 * reordenado (mesma situação), preservando o desvio V18 e a regra de
 * NÃO-SOBRESCRITA para status awaiting_validation/awaiting_external/blocked.
 */
export async function moveCard(
  taskId: string,
  columnId: string,
  position: number,
): Promise<void> {
  const { error } = await supabase.rpc("kanban_move_card" as never, {
    p_task_id: taskId,
    p_column_id: columnId,
    p_position: position,
  } as never);
  if (error) throw error;
}

export async function addTaskToBoard(taskId: string, columnId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_add_task_to_board" as never, {
    p_task_id: taskId,
    p_column_id: columnId,
  } as never);
  if (error) throw error;
}

export async function removeTaskFromBoard(taskId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_remove_task_from_board" as never, {
    p_task_id: taskId,
  } as never);
  if (error) throw error;
}

// ─── Configuração de boards (gate: kanban_can_admin) ──────────────────────────
// Assinaturas POSICIONAIS (consumidas assim por src/pages/KanbanBoard.tsx).
export async function createBoard(
  name: string,
  isPrivate: boolean,
  hideCompletedAfterDays: number | null,
  simplifiedCards: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc("kanban_create_board" as never, {
    p_name: name,
    p_is_private: isPrivate,
    p_hide_completed_after_days: hideCompletedAfterDays,
    p_simplified_cards: simplifiedCards,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

export async function updateBoard(
  boardId: string,
  name: string,
  isPrivate: boolean,
  hideCompletedAfterDays: number | null,
  simplifiedCards: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("kanban_update_board" as never, {
    p_board_id: boardId,
    p_name: name,
    p_is_private: isPrivate,
    p_hide_completed_after_days: hideCompletedAfterDays,
    p_simplified_cards: simplifiedCards,
  } as never);
  if (error) throw error;
}

export async function deleteBoard(boardId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_delete_board" as never, {
    p_board_id: boardId,
  } as never);
  if (error) throw error;
}

export interface SetColumnInput {
  id?: string;
  name: string;
  situacao: TaskSituacao;
  position: number;
}

export async function setColumns(boardId: string, columns: SetColumnInput[]): Promise<void> {
  const { error } = await supabase.rpc("kanban_set_columns" as never, {
    p_board_id: boardId,
    p_columns: columns,
  } as never);
  if (error) throw error;
}

export async function setBoardGrants(
  boardId: string,
  userIds: string[],
  roleCodes: string[],
): Promise<void> {
  const { error } = await supabase.rpc("kanban_set_board_grants" as never, {
    p_board_id: boardId,
    p_user_ids: userIds,
    p_role_codes: roleCodes,
  } as never);
  if (error) throw error;
}

// ─── Favoritos ─────────────────────────────────────────────────────────────────
export async function toggleFavorite(boardId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_toggle_favorite" as never, {
    p_board_id: boardId,
  } as never);
  if (error) throw error;
}
