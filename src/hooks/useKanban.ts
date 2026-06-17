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
  KanbanTag,
  TaskDetail,
  TaskComment,
  TaskPriority,
  ChecklistItem,
  WorkflowTemplateSummary,
  TaskWorkflow,
  TimeEntry,
  AuditLogEntry,
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
      // Envolvimento e tags vêm por RPCs auxiliares e são mesclados nos cards.
      const [boardRes, invRes, tagRes] = await Promise.all([
        supabase.rpc("get_kanban_board", { p_board_id: boardId }),
        supabase.rpc("get_kanban_board_involvement", { p_board_id: boardId }),
        supabase.rpc("get_kanban_board_tags", { p_board_id: boardId }),
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
      const tagList = (tagRes.data as unknown as Array<{ user_task_id: string; tags: KanbanTag[] }>) ?? [];
      const tagMap = new Map(tagList.map((r) => [r.user_task_id, r.tags]));
      return {
        ...detail,
        cards: (detail.cards ?? []).map((c) => ({
          ...c,
          assigner_user_id: invMap.get(c.id)?.assigner_user_id ?? null,
          validator_user_id: invMap.get(c.id)?.validator_user_id ?? null,
          tags: tagMap.get(c.id) ?? [],
        })),
      };
    },
    realtime: [
      { table: "user_tasks" },
      { table: "kanban_card_placements" },
      { table: "kanban_columns" },
      { table: "task_tags" },
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
export function useSavedFilters() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useSupabaseQuery<SavedFilter[]>({
    queryKey: `kanban-saved-filters-${user?.id ?? "anon"}`,
    enabled: !!user,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_my_saved_filters");
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
  const { data, error } = await supabase.rpc("kanban_save_filter", {
    p_name: name,
    p_filter: filter as unknown as Json,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function deleteSavedFilter(id: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_delete_saved_filter", {
    p_id: id,
  });
  if (error) throw error;
}

// ─── Marcadores / detalhe / comentários (SP3) ────────────────────────────────
export function useKanbanTags() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useSupabaseQuery<KanbanTag[]>({
    queryKey: "kanban-tags",
    enabled: !!user,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_kanban_tags");
      if (rpcErr) throw rpcErr;
      return (data as unknown as KanbanTag[]) ?? [];
    },
    realtime: { table: "kanban_tags" },
  });
  return { tags: data ?? [], loading, error, refresh: refetch };
}

export async function setTaskTags(taskId: string, names: string[]): Promise<void> {
  const { error } = await supabase.rpc("kanban_set_task_tags", {
    p_task_id: taskId,
    p_names: names,
  });
  if (error) throw error;
}

export function useTaskDetail(taskId: string | null) {
  const { data, loading, error, refetch } = useSupabaseQuery<TaskDetail>({
    queryKey: `task-detail-${taskId ?? "none"}`,
    enabled: !!taskId,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_user_task_detail", {
        p_task_id: taskId,
      });
      if (rpcErr) throw rpcErr;
      return data as unknown as TaskDetail;
    },
    realtime: { table: "task_tags" },
  });
  return { detail: (data ?? null) as TaskDetail | null, loading, error, refresh: refetch };
}

export function useTaskComments(taskId: string | null) {
  const { data, loading, error, refetch } = useSupabaseQuery<TaskComment[]>({
    queryKey: `task-comments-${taskId ?? "none"}`,
    enabled: !!taskId,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_task_comments", {
        p_task_id: taskId,
      });
      if (rpcErr) throw rpcErr;
      return (data as unknown as TaskComment[]) ?? [];
    },
  });
  return { comments: data ?? [], loading, error, refresh: refetch };
}

export async function addComment(taskId: string, body: string, mentioned: string[]): Promise<string> {
  const { data, error } = await supabase.rpc("kanban_add_comment", {
    p_task_id: taskId,
    p_body: body,
    p_mentioned: mentioned,
  });
  if (error) throw error;
  return data as unknown as string;
}

export interface TaskFieldUpdate {
  title?: string;
  description?: string | null;
  deadline_at?: string | null;
  assignee_user_id?: string | null;
  priority?: TaskPriority;
}

// Edita campos da tarefa direto na tabela (RLS já permite envolvidos/admin).
export async function updateTaskFields(taskId: string, fields: TaskFieldUpdate): Promise<void> {
  const { error } = await supabase
    .from("user_tasks")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw error;
}

// ─── Checklist (SP4) ─────────────────────────────────────────────────────────
export function useChecklist(taskId: string | null) {
  const { data, loading, error, refetch } = useSupabaseQuery<ChecklistItem[]>({
    queryKey: `task-checklist-${taskId ?? "none"}`,
    enabled: !!taskId,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_task_checklist", { p_task_id: taskId });
      if (rpcErr) throw rpcErr;
      return (data as unknown as ChecklistItem[]) ?? [];
    },
  });
  return { items: data ?? [], loading, error, refresh: refetch };
}

export async function addChecklistItem(taskId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_add_checklist_item", { p_task_id: taskId, p_body: body });
  if (error) throw error;
}
export async function toggleChecklistItem(itemId: string, done: boolean): Promise<void> {
  const { error } = await supabase.rpc("kanban_toggle_checklist_item", { p_item_id: itemId, p_done: done });
  if (error) throw error;
}
export async function deleteChecklistItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_delete_checklist_item", { p_item_id: itemId });
  if (error) throw error;
}

// ─── Workflow (SP4) ──────────────────────────────────────────────────────────
export function useWorkflowTemplates() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useSupabaseQuery<WorkflowTemplateSummary[]>({
    queryKey: "workflow-templates",
    enabled: !!user,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_workflow_templates");
      if (rpcErr) throw rpcErr;
      return (data as unknown as WorkflowTemplateSummary[]) ?? [];
    },
    realtime: { table: "workflow_templates" },
  });
  return { templates: data ?? [], loading, error, refresh: refetch };
}

export async function createWorkflowTemplate(name: string, steps: string[]): Promise<string> {
  const { data, error } = await supabase.rpc("kanban_create_workflow_template", { p_name: name, p_steps: steps });
  if (error) throw error;
  return data as unknown as string;
}
export async function deleteWorkflowTemplate(id: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_delete_workflow_template", { p_id: id });
  if (error) throw error;
}

export function useTaskWorkflow(taskId: string | null) {
  const { data, loading, error, refetch } = useSupabaseQuery<TaskWorkflow | null>({
    queryKey: `task-workflow-${taskId ?? "none"}`,
    enabled: !!taskId,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_task_workflow", { p_task_id: taskId });
      if (rpcErr) throw rpcErr;
      return (data as unknown as TaskWorkflow) ?? null;
    },
  });
  return { workflow: (data ?? null) as TaskWorkflow | null, loading, error, refresh: refetch };
}

export async function startWorkflow(taskId: string, templateId: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_start_workflow", { p_task_id: taskId, p_template_id: templateId });
  if (error) throw error;
}
export async function setWorkflowStep(stepStateId: string, done: boolean): Promise<void> {
  const { error } = await supabase.rpc("kanban_set_workflow_step", { p_step_state_id: stepStateId, p_done: done });
  if (error) throw error;
}

// ─── Timesheet (SP5) ─────────────────────────────────────────────────────────
export function useTimeEntries(taskId: string | null) {
  const { data, loading, error, refetch } = useSupabaseQuery<TimeEntry[]>({
    queryKey: `task-time-${taskId ?? "none"}`,
    enabled: !!taskId,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_task_time_entries", { p_task_id: taskId });
      if (rpcErr) throw rpcErr;
      return (data as unknown as TimeEntry[]) ?? [];
    },
  });
  const entries = data ?? [];
  const totalMinutes = entries.reduce((acc, e) => acc + (e.minutes ?? 0), 0);
  return { entries, totalMinutes, loading, error, refresh: refetch };
}

export async function addTimeEntry(taskId: string, minutes: number, note: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_add_time_entry", { p_task_id: taskId, p_minutes: minutes, p_note: note });
  if (error) throw error;
}
export async function deleteTimeEntry(id: string): Promise<void> {
  const { error } = await supabase.rpc("kanban_delete_time_entry", { p_id: id });
  if (error) throw error;
}

// ─── Auditoria por tarefa (SP5) ──────────────────────────────────────────────
export function useTaskAudit(taskId: string | null) {
  const { data, loading, error, refetch } = useSupabaseQuery<AuditLogEntry[]>({
    queryKey: `task-audit-${taskId ?? "none"}`,
    enabled: !!taskId,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_task_audit", { p_task_id: taskId });
      if (rpcErr) throw rpcErr;
      return (data as unknown as AuditLogEntry[]) ?? [];
    },
  });
  return { entries: data ?? [], loading, error, refresh: refetch };
}
