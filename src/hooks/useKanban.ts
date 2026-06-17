import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import type {
  TaskSituacao,
  KanbanBoardSummary,
  KanbanBoardDetailBoard,
  KanbanColumn,
  KanbanCardV2,
  KanbanBoardDetail,
  SavedFilter,
  KanbanFilterState,
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
      const { data, error: rpcErr } = await supabase.rpc("get_kanban_boards");
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
      // get_kanban_board (detalhe) + get_kanban_board_involvement (assigner/validator
      // por card, p/ as abas de envolvimento do SP2) em paralelo, com merge client-side.
      // A RPC de envolvimento ainda não está no types.ts gerado → cast até types:regen.
      const [boardRes, invRes] = await Promise.all([
        supabase.rpc("get_kanban_board", { p_board_id: boardId }),
        supabase.rpc("get_kanban_board_involvement" as never, { p_board_id: boardId } as never),
      ]);
      if (boardRes.error) throw boardRes.error;
      const detail = boardRes.data as unknown as KanbanBoardDetail;
      const invList =
        (invRes.data as unknown as Array<{
          user_task_id: string;
          assigner_user_id: string | null;
          validator_user_id: string | null;
        }>) ?? [];
      const invMap = new Map(invList.map((r) => [r.user_task_id, r]));
      return {
        ...detail,
        cards: (detail.cards ?? []).map((c) => ({
          ...c,
          assigner_user_id: invMap.get(c.id)?.assigner_user_id ?? null,
          validator_user_id: invMap.get(c.id)?.validator_user_id ?? null,
        })),
      };
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
  const { error } = await supabase.rpc("kanban_move_card", {
    p_task_id: taskId,
    p_column_id: columnId,
    p_position: position,
  });
  if (error) throw error;
}

export async function addTaskToBoard(taskId: string, columnId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_add_task_to_board", {
    p_task_id: taskId,
    p_column_id: columnId,
  });
  if (error) throw error;
}

export async function removeTaskFromBoard(taskId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_remove_task_from_board", {
    p_task_id: taskId,
  });
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
  const { data, error } = await supabase.rpc("kanban_create_board", {
    p_name: name,
    p_is_private: isPrivate,
    p_hide_completed_after_days: hideCompletedAfterDays,
    p_simplified_cards: simplifiedCards,
  });
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
  const { error } = await supabase.rpc("kanban_update_board", {
    p_board_id: boardId,
    p_name: name,
    p_is_private: isPrivate,
    p_hide_completed_after_days: hideCompletedAfterDays,
    p_simplified_cards: simplifiedCards,
  });
  if (error) throw error;
}

export async function deleteBoard(boardId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_delete_board", {
    p_board_id: boardId,
  });
  if (error) throw error;
}

export interface SetColumnInput {
  id?: string;
  name: string;
  situacao: TaskSituacao;
  position: number;
}

export async function setColumns(boardId: string, columns: SetColumnInput[]): Promise<void> {
  const { error } = await supabase.rpc("kanban_set_columns", {
    p_board_id: boardId,
    p_columns: columns as unknown as Json,
  });
  if (error) throw error;
}

export async function setBoardGrants(
  boardId: string,
  userIds: string[],
  roleCodes: string[],
): Promise<void> {
  const { error } = await supabase.rpc("kanban_set_board_grants", {
    p_board_id: boardId,
    p_user_ids: userIds,
    p_role_codes: roleCodes,
  });
  if (error) throw error;
}

// ─── Favoritos ─────────────────────────────────────────────────────────────────
export async function toggleFavorite(boardId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_toggle_favorite", {
    p_board_id: boardId,
  });
  if (error) throw error;
}

// ─── Filtros salvos (SP2) ────────────────────────────────────────────────────
// RPCs ainda não presentes no types.ts gerado → cast até types:regen.
export function useSavedFilters() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useSupabaseQuery<SavedFilter[]>({
    queryKey: `kanban-saved-filters-${user?.id ?? "anon"}`,
    enabled: !!user,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_my_saved_filters" as never);
      if (rpcErr) throw rpcErr;
      return (data as unknown as SavedFilter[]) ?? [];
    },
    realtime: user
      ? { table: "kanban_saved_filters", filter: `user_id=eq.${user.id}` }
      : undefined,
  });
  return { savedFilters: data ?? [], loading, error, refresh: refetch };
}

export async function saveFilter(name: string, filter: KanbanFilterState): Promise<string> {
  const { data, error } = await supabase.rpc("kanban_save_filter" as never, {
    p_name: name,
    p_filter: filter as unknown as Json,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

export async function deleteSavedFilter(id: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_delete_saved_filter" as never, {
    p_id: id,
  } as never);
  if (error) throw error;
}
