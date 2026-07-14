import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import type { LegalArea, OrgStage, UserTaskStatus, TaskPriority } from "@/types/jurisai";

/**
 * Hooks de tarefas humano-humano (V17).
 *
 * useMyInbox — caixa de entrada do usuário logado (tarefas que recebeu)
 * useInboxCount — total/overdue/critical para badge no header
 * useTaskTypes — catálogo de 66 tipos para UI de atribuição
 * useEligibleAssignees(taskTypeId) — quem pode receber esse tipo
 * useTeamTasks — visão do sócio (todas as tarefas)
 *
 * Todos com Realtime via canal user_tasks.
 */

export interface InboxTask {
  id: string;
  title: string;
  description: string | null;
  task_type_code: string;
  task_type_label: string;
  status: UserTaskStatus;
  priority: TaskPriority;
  deadline_at: string | null;
  area: LegalArea | null;
  client_id: string | null;
  process_id: string | null;
  assigner_user_id: string;
  assigner_name: string;
  external_kanban_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  documentation_completed_at: string | null;
  is_overdue: boolean;
}

export interface InboxCount {
  total: number;
  overdue: number;
  critical: number;
}

export interface TaskTypeOption {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  stage: OrgStage;
  area: LegalArea | null;
  default_sla_hours: number | null;
  eligible_role_codes: string[];
}

export interface EligibleAssignee {
  user_id: string;
  full_name: string;
  role_code: string;
  role_label: string;
  is_estagiario: boolean;
}

export interface TeamTask {
  id: string;
  title: string;
  task_type_label: string;
  status: UserTaskStatus;
  priority: TaskPriority;
  deadline_at: string | null;
  assignee_user_id: string | null;
  assignee_name: string;
  assignee_role_label: string;
  assigner_user_id: string | null;
  assigner_name: string;
  area: LegalArea | null;
  created_at: string;
  is_overdue: boolean;
}

// ─── Inbox pessoal ────────────────────────────────────────────────────────────
export function useMyInbox(includeCompleted = false) {
  const { user } = useAuth();

  const { data, loading, error, refetch } = useSupabaseQuery<InboxTask[]>({
    queryKey: `my-inbox-${user?.id ?? "anon"}-${includeCompleted ? "all" : "open"}`,
    enabled: !!user,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_my_inbox", {
        p_include_completed: includeCompleted,
      });
      if (rpcErr) throw rpcErr;
      return (data as unknown as InboxTask[]) || [];
    },
    realtime: user
      ? { table: "user_tasks", filter: `assignee_user_id=eq.${user.id}` }
      : undefined,
  });

  return { tasks: data ?? [], loading, error, refresh: refetch };
}

// ─── Badge counter ────────────────────────────────────────────────────────────
const DEFAULT_INBOX_COUNT: InboxCount = { total: 0, overdue: 0, critical: 0 };

export function useInboxCount() {
  const { user } = useAuth();

  const { data } = useSupabaseQuery<InboxCount>({
    queryKey: `inbox-count-${user?.id ?? "anon"}`,
    enabled: !!user,
    fetcher: async () => {
      const { data } = await supabase.rpc("get_inbox_count");
      const rows = data as unknown as InboxCount[] | null;
      if (rows && Array.isArray(rows) && rows.length > 0) {
        return rows[0];
      }
      return DEFAULT_INBOX_COUNT;
    },
    realtime: user
      ? { table: "user_tasks", filter: `assignee_user_id=eq.${user.id}` }
      : undefined,
  });

  return data ?? DEFAULT_INBOX_COUNT;
}

// ─── Catálogo de tipos de tarefa ──────────────────────────────────────────────
export function useTaskTypes() {
  const { data, loading } = useSupabaseQuery<TaskTypeOption[]>({
    queryKey: "task-types",
    fetcher: async () => {
      const { data } = await supabase.rpc("get_task_types_by_stage");
      return (data as unknown as TaskTypeOption[]) || [];
    },
  });

  return { types: data ?? [], loading };
}

// ─── Destinatários elegíveis ──────────────────────────────────────────────────
export function useEligibleAssignees(taskTypeId: string | null) {
  const { data, loading } = useSupabaseQuery<EligibleAssignee[]>({
    queryKey: `eligible-assignees-${taskTypeId ?? "none"}`,
    enabled: !!taskTypeId,
    fetcher: async () => {
      const { data } = await supabase.rpc("get_eligible_assignees", {
        p_task_type_id: taskTypeId,
      });
      return (data as unknown as EligibleAssignee[]) || [];
    },
  });

  return { assignees: data ?? [], loading };
}

// ─── Visão da equipe (master) ─────────────────────────────────────────────────
export function useTeamTasks(filters?: { status?: UserTaskStatus; assigneeUserId?: string; includeCompleted?: boolean }) {
  const { data, loading, error, refetch } = useSupabaseQuery<TeamTask[]>({
    queryKey: `team-tasks-${filters?.status ?? "all"}-${filters?.assigneeUserId ?? "all"}-${filters?.includeCompleted ?? false}`,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_team_tasks", {
        p_status: filters?.status ?? null,
        p_assignee_user_id: filters?.assigneeUserId ?? null,
        p_include_completed: filters?.includeCompleted ?? false,
        p_limit: 200,
      });
      if (rpcErr) throw rpcErr;
      return (data as unknown as TeamTask[]) || [];
    },
    realtime: { table: "user_tasks" },
  });

  return { tasks: data ?? [], loading, error, refresh: refetch };
}

// ─── Board do Kanban da operação (por fase / org_stage) ───────────────────────
export interface KanbanCard {
  id: string;
  title: string;
  task_type_id: string;
  task_type_code: string;
  task_type_label: string;
  stage: OrgStage;
  status: UserTaskStatus;
  priority: TaskPriority;
  area: LegalArea | null;
  client_id: string | null;
  process_id: string | null;
  assignee_user_id: string | null;
  assignee_name: string;
  assignee_role_label: string;
  owner_role_code: string | null;
  owner_role_label: string | null;
  /** Quando preenchido, o card está "aguardando responsável" do papel indicado. */
  awaiting_role_code: string | null;
  assigner_user_id: string | null;
  assigner_name: string;
  deadline_at: string | null;
  is_overdue: boolean;
  created_at: string;
}

export function useKanbanBoard(includeCompleted = false) {
  const { data, loading, error, refetch } = useSupabaseQuery<KanbanCard[]>({
    queryKey: `kanban-board-${includeCompleted}`,
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_kanban_board", {
        p_include_completed: includeCompleted,
      });
      if (rpcErr) throw rpcErr;
      return (data as unknown as KanbanCard[]) || [];
    },
    realtime: { table: "user_tasks" },
  });

  return { cards: data ?? [], loading, error, refresh: refetch };
}

export interface AdvanceResult {
  new_task_id: string;
  next_stage: OrgStage;
  assignee_user_id: string | null;
  task_type_id: string;
  awaiting_role: string | null;
}

/**
 * Avança um card para a próxima fase (conclui a atual e cria a sucessora).
 * Se a próxima fase tiver mais de um task_type e nenhum for passado, o backend
 * lança "choose_task_type:<stage>" — o chamador deve detectar e abrir o seletor.
 */
export async function advanceUserTask(
  taskId: string,
  nextTaskTypeId?: string | null,
): Promise<AdvanceResult> {
  const { data, error } = await supabase.rpc("advance_user_task", {
    p_task_id: taskId,
    p_next_task_type_id: nextTaskTypeId ?? null,
  });
  if (error) throw error;
  return data as unknown as AdvanceResult;
}

/** Extrai o stage de uma mensagem de erro "choose_task_type:<stage>", se houver. */
export function parseChooseTaskTypeError(err: unknown): OrgStage | null {
  const msg = (err as { message?: string })?.message ?? "";
  const m = msg.match(/choose_task_type:(\w+)/);
  return m ? (m[1] as OrgStage) : null;
}

// ─── Helpers: criar e atualizar ───────────────────────────────────────────────
export interface CreateTaskInput {
  task_type_id: string;
  assignee_user_id: string;
  title: string;
  description?: string;
  client_id?: string;
  process_id?: string;
  priority?: TaskPriority;
  deadline_at?: string;
  area?: LegalArea;
  payload?: Record<string, unknown>;
  external_kanban_ref?: string;
}

export async function createUserTask(input: CreateTaskInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_user_task", {
    p_task_type_id: input.task_type_id,
    p_assignee_user_id: input.assignee_user_id,
    p_title: input.title,
    p_description: input.description ?? null,
    p_client_id: input.client_id ?? null,
    p_process_id: input.process_id ?? null,
    p_priority: input.priority ?? "medium",
    p_deadline_at: input.deadline_at ?? null,
    p_area: input.area ?? null,
    p_payload: (input.payload ?? {}) as unknown as Json,
    p_external_kanban_ref: input.external_kanban_ref ?? null,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function updateUserTaskStatus(
  taskId: string,
  newStatus: UserTaskStatus,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc("update_user_task_status", {
    p_task_id: taskId,
    p_new_status: newStatus,
    p_notes: notes ?? null,
  });
  if (error) throw error;
}

// ─── Reagendar / assumir / criar tarefa de departamento ───────────────────────
// As RPCs abaixo (reschedule_user_task, claim_user_task, create_department_task)
// ainda não estão nos tipos gerados de `supabase/types` — cast local por nome.
// IMPORTANTE: chamar `.rpc` SEMPRE acoplado ao `supabase` (obj.rpc(...)); extrair
// a referência e chamá-la solta quebra em `this.rest` undefined (bug conhecido —
// crash CLIENTES-BUSCA 2026-07-08). Por isso o wrapper reencaminha acoplado.
type RpcCaller = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;
const rpcUntyped: RpcCaller = (fn, args) =>
  (supabase as unknown as { rpc: RpcCaller }).rpc(fn, args);

export async function rescheduleUserTask(
  taskId: string,
  newDeadlineISO: string,
  justificativa: string,
): Promise<void> {
  const { error } = await rpcUntyped("reschedule_user_task", {
    p_task_id: taskId,
    p_new_deadline: newDeadlineISO,
    p_justificativa: justificativa,
  });
  if (error) throw error;
}

export async function claimUserTask(taskId: string): Promise<string> {
  const { data, error } = await rpcUntyped("claim_user_task", { p_task_id: taskId });
  if (error) throw error;
  return data as unknown as string;
}

export interface CreateDepartmentTaskInput {
  task_type_id: string; title: string; description?: string;
  client_id?: string; process_id?: string; priority?: TaskPriority;
  deadline_at?: string; area?: LegalArea; payload?: Record<string, unknown>;
}
export async function createDepartmentTask(input: CreateDepartmentTaskInput): Promise<string> {
  const { data, error } = await rpcUntyped("create_department_task", {
    p_task_type_id: input.task_type_id, p_title: input.title,
    p_description: input.description ?? null, p_client_id: input.client_id ?? null,
    p_process_id: input.process_id ?? null, p_priority: input.priority ?? "medium",
    p_deadline_at: input.deadline_at ?? null, p_area: input.area ?? null,
    p_payload: (input.payload ?? {}) as unknown as Json,
  });
  if (error) throw error;
  return data as unknown as string;
}

// Card 4.1 (tarefa via chat): via de autorização PRÓPRIA (create_chat_task —
// autoriza "autenticado e papel <> tech", NÃO usa role_task_matrix). Tipo fixo
// `tarefa_chat`; responsável default = o próprio criador (p_assignee_user_id nulo).
export interface CreateChatTaskInput {
  title: string;
  description?: string;
  client_id?: string;
  deadline_at?: string;
  assignee_user_id?: string;
  priority?: TaskPriority;
}
export async function createChatTask(input: CreateChatTaskInput): Promise<string> {
  const { data, error } = await rpcUntyped("create_chat_task", {
    p_title: input.title,
    p_description: input.description ?? null,
    p_client_id: input.client_id ?? null,
    p_deadline_at: input.deadline_at ?? null,
    p_assignee_user_id: input.assignee_user_id ?? null,
    p_priority: input.priority ?? "medium",
  });
  if (error) throw error;
  return data as unknown as string;
}

// ─── Card 8.2 — Revisão humana + log de aprovação ─────────────────────────────
// Único caminho para decidir uma tarefa `revisar_peca`. Aprovar exige aceite=true
// (responsabilidade assumida); devolver reabre a confecção original. A criação
// da tarefa de protocolo é automática no banco (trigger), condicionada à decisão
// aqui registrada — nunca chamar update_user_task_status para revisar_peca.
export interface RevisaoPecaContext {
  task: { id: string; title: string; status: UserTaskStatus; deadline_at: string | null; created_at: string };
  process: { id: string; process_number: string | null; client_name: string | null } | null;
  client_document: {
    id: string; document_name: string | null; document_type: string;
    file_path: string; mime_type: string | null; created_at: string;
  } | null;
  redator_name: string | null;
  fallback: boolean | null;
  fallback_reason: string | null;
  approval_history: {
    decisao: "aprovar" | "devolver"; aceite: boolean; observacoes: string | null;
    created_at: string; decided_by_name: string | null;
  }[];
}

export async function getRevisaoPecaContext(taskId: string): Promise<RevisaoPecaContext> {
  const { data, error } = await rpcUntyped("get_revisao_peca_context", { p_task_id: taskId });
  if (error) throw error;
  return data as unknown as RevisaoPecaContext;
}

export async function decidirRevisaoPeca(
  taskId: string,
  decisao: "aprovar" | "devolver",
  observacoes: string | undefined,
  aceite: boolean,
): Promise<UserTaskStatus> {
  const { data, error } = await rpcUntyped("decidir_revisao_peca", {
    p_task_id: taskId,
    p_decisao: decisao,
    p_observacoes: observacoes ?? null,
    p_aceite: aceite,
  });
  if (error) throw error;
  return data as unknown as UserTaskStatus;
}
