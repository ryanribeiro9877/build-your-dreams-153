import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import type { RealtimeConfig } from "@/hooks/useSupabaseQuery";
import type { LegalArea, OrgStage, AgentRoleV14 } from "@/types/jurisai";

/**
 * useMyWorkspace — V16
 *
 * Retorna em uma chamada o workspace do usuário logado:
 *   - profile (full_name, is_estagiario)
 *   - role_template (cargo, stages, areas)
 *   - agents (lista dos agentes pessoais, ordenados por hierarquia)
 *   - is_master (flag pra mostrar botões de admin)
 *
 * Substitui o uso direto de useAgents() em telas filtradas por usuário.
 * useAgents() continua existindo pra telas admin (que mostram TODOS os agentes).
 */

export interface WorkspaceProfile {
  full_name: string | null;
  display_name: string | null;
  is_estagiario: boolean;
}

export interface WorkspaceRoleTemplate {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  stages: OrgStage[];
  areas: LegalArea[] | null;
  is_admin: boolean;
}

export interface WorkspaceAgent {
  id: string;
  name: string;
  role: AgentRoleV14;
  color: string;
  status: "active" | "idle" | "alert" | "offline";
  template_code: string | null;
  template_stage: OrgStage | null;
  template_area: LegalArea | null;
}

export interface MyWorkspace {
  user_id: string;
  profile: WorkspaceProfile | null;
  role_template: WorkspaceRoleTemplate | null;
  agents: WorkspaceAgent[];
  is_master: boolean;
}

export function useMyWorkspace() {
  const { user, loading: authLoading } = useAuth();

  const enabled = !authLoading && !!user;

  const realtimeConfigs = useMemo<RealtimeConfig[]>(() => {
    if (!user) return [];
    return [
      { table: "profiles", filter: `user_id=eq.${user.id}` },
      { table: "agents", event: "INSERT", filter: `owner_user_id=eq.${user.id}` },
    ];
  }, [user]);

  const { data, loading, error, refetch } = useSupabaseQuery<MyWorkspace>({
    queryKey: user ? `workspace-${user.id}` : "workspace-anonymous",
    fetcher: async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_my_workspace");
      if (rpcErr) throw new Error(rpcErr.message);
      return data as unknown as MyWorkspace;
    },
    realtime: realtimeConfigs.length > 0 ? realtimeConfigs : undefined,
    enabled,
  });

  return {
    workspace: data,
    loading,
    error,
    refresh: refetch,
  };
}

/**
 * Helper: agrupa agentes do workspace por stage (para sidebar dinâmica).
 * Mantém o "Meu Assistente" (assistant_root) sempre no topo, fora de grupo.
 */
export function groupAgentsByStage(
  agents: WorkspaceAgent[],
): { root: WorkspaceAgent | null; stages: Array<{ stage: OrgStage; agents: WorkspaceAgent[] }> } {
  const root = agents.find((a) => a.role === "ceo" || a.role === "assistant_root") ?? null;
  const grouped = new Map<OrgStage, WorkspaceAgent[]>();
  for (const a of agents) {
    if (a === root) continue;
    if (!a.template_stage) continue;
    const list = grouped.get(a.template_stage) ?? [];
    list.push(a);
    grouped.set(a.template_stage, list);
  }
  const stages = Array.from(grouped.entries()).map(([stage, agentsInStage]) => ({
    stage,
    agents: agentsInStage,
  }));
  return { root, stages };
}

/** Label PT-BR pra cada stage (sidebar e topbar) */
export const STAGE_LABELS: Record<OrgStage, string> = {
  atendimento: "Atendimento",
  confeccao: "Confecção",
  revisao: "Revisão",
  protocolo: "Protocolo",
  audiencia: "Audiência",
  execucao: "Execução",
  execucao_sindicato: "Execução Sindicato",
  recursos: "Recursos",
  recursos_criticos: "Recursos Críticos",
  alvara: "Alvará",
  diligencia: "Diligência",
  acompanhamento: "Acompanhamento",
  financeiro: "Financeiro",
  recepcao: "Recepção",
  recepcao_supervisionada: "Recepção (Supervisionado)",
  admin_equipe: "Gestão de Equipe",
  captacao_cooperativa: "Captação Cooperativa",
  kanban_pendencias: "Kanban Pendências",
  gestao: "Gestão",
  todas: "Todas as Etapas",
};

/** Label PT-BR pra cada área */
export const AREA_LABELS: Record<LegalArea, string> = {
  bancario: "Bancário",
  familia: "Família",
  plano_saude: "Plano de Saúde",
  consumidor: "Consumidor",
  civil: "Civil",
  previdenciario: "Previdenciário",
  tributario: "Tributário",
};
