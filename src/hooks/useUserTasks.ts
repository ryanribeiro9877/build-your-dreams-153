import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const [tasks, setTasks] = useState<InboxTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: rpcErr } = await supabase.rpc("get_my_inbox" as never, {
      p_include_completed: includeCompleted,
    } as never);
    if (rpcErr) {
      setError(rpcErr.message);
      setTasks([]);
    } else {
      setTasks((data as unknown as InboxTask[]) || []);
    }
    setLoading(false);
  }, [user, includeCompleted]);

  useEffect(() => { void fetchTasks(); }, [fetchTasks]);

  // Realtime: refaz query quando uma user_task minha muda
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`my-inbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_tasks", filter: `assignee_user_id=eq.${user.id}` },
        () => { void fetchTasks(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, fetchTasks]);

  return { tasks, loading, error, refresh: fetchTasks };
}

// ─── Badge counter ────────────────────────────────────────────────────────────
export function useInboxCount() {
  const { user } = useAuth();
  const [count, setCount] = useState<InboxCount>({ total: 0, overdue: 0, critical: 0 });

  const fetchCount = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc("get_inbox_count" as never);
    if (data && Array.isArray(data) && data.length > 0) {
      setCount(data[0] as InboxCount);
    }
  }, [user]);

  useEffect(() => { void fetchCount(); }, [fetchCount]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`inbox-count-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_tasks", filter: `assignee_user_id=eq.${user.id}` },
        () => { void fetchCount(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, fetchCount]);

  return count;
}

// ─── Catálogo de tipos de tarefa ──────────────────────────────────────────────
export function useTaskTypes() {
  const [types, setTypes] = useState<TaskTypeOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("get_task_types_by_stage" as never);
      if (!cancelled) {
        setTypes((data as unknown as TaskTypeOption[]) || []);
        setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return { types, loading };
}

// ─── Destinatários elegíveis ──────────────────────────────────────────────────
export function useEligibleAssignees(taskTypeId: string | null) {
  const [assignees, setAssignees] = useState<EligibleAssignee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskTypeId) {
      setAssignees([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const { data } = await supabase.rpc("get_eligible_assignees" as never, {
        p_task_type_id: taskTypeId,
      } as never);
      if (!cancelled) {
        setAssignees((data as unknown as EligibleAssignee[]) || []);
        setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [taskTypeId]);

  return { assignees, loading };
}

// ─── Visão da equipe (master) ─────────────────────────────────────────────────
export function useTeamTasks(filters?: { status?: UserTaskStatus; assigneeUserId?: string; includeCompleted?: boolean }) {
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcErr } = await supabase.rpc("get_team_tasks" as never, {
      p_status: filters?.status ?? null,
      p_assignee_user_id: filters?.assigneeUserId ?? null,
      p_include_completed: filters?.includeCompleted ?? false,
      p_limit: 200,
    } as never);
    if (rpcErr) {
      setError(rpcErr.message);
      setTasks([]);
    } else {
      setTasks((data as unknown as TeamTask[]) || []);
    }
    setLoading(false);
  }, [filters?.status, filters?.assigneeUserId, filters?.includeCompleted]);

  useEffect(() => { void fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    const channel = supabase
      .channel("team-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_tasks" },
        () => { void fetchTasks(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchTasks]);

  return { tasks, loading, error, refresh: fetchTasks };
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
  const { data, error } = await supabase.rpc("create_user_task" as never, {
    p_task_type_id: input.task_type_id,
    p_assignee_user_id: input.assignee_user_id,
    p_title: input.title,
    p_description: input.description ?? null,
    p_client_id: input.client_id ?? null,
    p_process_id: input.process_id ?? null,
    p_priority: input.priority ?? "medium",
    p_deadline_at: input.deadline_at ?? null,
    p_area: input.area ?? null,
    p_payload: input.payload ?? {},
    p_external_kanban_ref: input.external_kanban_ref ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

export async function updateUserTaskStatus(
  taskId: string,
  newStatus: UserTaskStatus,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc("update_user_task_status" as never, {
    p_task_id: taskId,
    p_new_status: newStatus,
    p_notes: notes ?? null,
  } as never);
  if (error) throw error;
}
