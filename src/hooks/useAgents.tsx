import { supabase } from "@/integrations/supabase/client";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

/**
 * Fonte de verdade unica para agentes da plataforma.
 *
 * Le da tabela public.agents (seed em migration 20260511122000_seed_agents.sql)
 * e expoe utilitarios analogos aos que existiam hardcoded em JurisCloudOS.tsx
 * e OrgChart.tsx.
 *
 * Realtime subscription para current_tasks/status (atualizados por triggers
 * em outras tarefas).
 */

export type AgentRole = "ceo" | "director" | "orchestrator" | "manager" | "specialist" | "reviewer" | "executor" | "monitor";
export type AgentStatus = "active" | "idle" | "alert" | "offline";

export interface AgentRecord {
  id: string;                 // uuid no banco
  externalId: number | null;  // id historico usado pelo front
  name: string;
  color: string;
  role: AgentRole;
  status: AgentStatus;
  departmentId: string;
  departmentName: string;
  canOrchestrate: boolean;
  maxConcurrentTasks: number;
  currentTasks: number;
  reportsTo: number | null;   // external_id do superior
  description: string | null;
  permissions: string[];
  level: number;              // 1-4 nivel hierarquico
  ownerUserId: string | null;
  ownerName: string | null;
  isPersonal: boolean;
}

interface AgentRow {
  id: string;
  external_id: number | null;
  name: string;
  color: string;
  role: AgentRole;
  status: AgentStatus;
  department_id: string;
  can_orchestrate: boolean;
  max_concurrent_tasks: number;
  current_tasks: number;
  reports_to: number | null;
  description: string | null;
  level: number;
  owner_user_id: string | null;
  is_personal: boolean;
  departments: { name: string } | null;
  agent_permissions: { permission: string }[] | null;
}

async function fetchAgents(): Promise<AgentRecord[]> {
  const { data, error } = await supabase
    .from("agents")
    .select(`
      id, external_id, name, color, role, status,
      department_id, can_orchestrate, max_concurrent_tasks,
      current_tasks, reports_to, description, level,
      owner_user_id, is_personal,
      departments ( name ),
      agent_permissions ( permission )
    `)
    .eq("is_active", true)
    .order("external_id", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data || []) as unknown as AgentRow[];

  const ownerIds = [...new Set(rows.map(r => r.owner_user_id).filter(Boolean))] as string[];
  let ownerMap: Record<string, string> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, full_name")
      .in("user_id", ownerIds);
    if (profiles) {
      for (const p of profiles as { user_id: string; display_name: string; full_name: string | null }[]) {
        ownerMap[p.user_id] = p.full_name || p.display_name || "";
      }
    }
  }

  return rows.map(r => ({
    id: r.id,
    externalId: r.external_id,
    name: r.name,
    color: r.color,
    role: r.role,
    status: r.status,
    departmentId: r.department_id,
    departmentName: r.departments?.name ?? "",
    canOrchestrate: r.can_orchestrate,
    maxConcurrentTasks: r.max_concurrent_tasks,
    currentTasks: r.current_tasks,
    reportsTo: r.reports_to,
    description: r.description,
    permissions: (r.agent_permissions ?? []).map(p => p.permission),
    level: r.level ?? 4,
    ownerUserId: r.owner_user_id,
    ownerName: r.owner_user_id ? (ownerMap[r.owner_user_id] || null) : null,
    isPersonal: r.is_personal ?? false,
  }));
}

export function useAgents() {
  const { data, loading, error, refetch } = useSupabaseQuery<AgentRecord[]>({
    queryKey: "agents_realtime",
    fetcher: fetchAgents,
    realtime: { table: "agents" },
  });

  return { agents: data ?? [], loading, error, reload: refetch };
}

// Helpers analogos aos antigos.
export function agentsForDepartment(agents: AgentRecord[], deptName: string): AgentRecord[] {
  if (deptName === "assistente") return agents;
  return agents.filter(a => a.departmentName === deptName || a.departmentName === "diretoria");
}

export function agentLoad(a: AgentRecord): number {
  if (a.maxConcurrentTasks <= 0) return 0;
  return Math.round((a.currentTasks / a.maxConcurrentTasks) * 100);
}

export function totalCapacity(agents: AgentRecord[]) {
  const used = agents.reduce((s, a) => s + a.currentTasks, 0);
  const total = agents.reduce((s, a) => s + a.maxConcurrentTasks, 0);
  return { used, total, percentage: total > 0 ? Math.round((used / total) * 100) : 0 };
}

export function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
