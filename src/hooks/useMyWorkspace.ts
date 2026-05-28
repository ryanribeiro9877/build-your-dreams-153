import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const [workspace, setWorkspace] = useState<MyWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    if (!user) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("get_my_workspace" as never);
    if (rpcErr) {
      setError(rpcErr.message);
      setWorkspace(null);
    } else if (data) {
      setWorkspace(data as unknown as MyWorkspace);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void fetchWorkspace();
  }, [authLoading, fetchWorkspace]);

  // Subscription pra atualizar quando profile ou agents mudam (provisionamento async)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`workspace-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        () => { void fetchWorkspace(); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agents", filter: `owner_user_id=eq.${user.id}` },
        () => { void fetchWorkspace(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user, fetchWorkspace]);

  return {
    workspace,
    loading,
    error,
    refresh: fetchWorkspace,
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
