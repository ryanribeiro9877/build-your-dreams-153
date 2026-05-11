import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  departments: { name: string } | null;
  agent_permissions: { permission: string }[] | null;
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("agents")
      .select(`
        id, external_id, name, color, role, status,
        department_id, can_orchestrate, max_concurrent_tasks,
        current_tasks, reports_to, description,
        departments ( name ),
        agent_permissions ( permission )
      `)
      .eq("is_active", true)
      .order("external_id", { ascending: true });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const rows = (data || []) as unknown as AgentRow[];
    setAgents(rows.map(r => ({
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
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("agents_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agents" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { agents, loading, error, reload: load };
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
