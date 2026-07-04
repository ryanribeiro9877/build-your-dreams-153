import type { LucideIcon } from "lucide-react";
import type { ActionProposal } from "@/components/chat/ActionCard";

export type AgentRole = "ceo" | "assistant_root" | "director" | "orchestrator" | "manager" | "specialist" | "reviewer" | "executor" | "monitor";
export type AgentPermission = "read" | "write" | "approve" | "execute" | "admin" | "monitor" | "schedule" | "contact_client" | "protocol" | "calculate" | "review_calculation" | "petition" | "market_study";

export const AGENT_PERMISSION_VALUES: readonly AgentPermission[] = [
  "read", "write", "approve", "execute", "admin", "monitor", "schedule", "contact_client",
  "protocol", "calculate", "review_calculation", "petition", "market_study",
] as const;

export function parseAgentPermissions(raw: string[]): AgentPermission[] {
  const allowed = new Set<string>(AGENT_PERMISSION_VALUES);
  return raw.filter((p): p is AgentPermission => allowed.has(p));
}

export interface Agent {
  id: number;
  /** UUID em `public.agents` — necessário para abrir `/tech/agentes/:id`. */
  uuid?: string;
  name: string; status: "active" | "idle" | "alert";
  color: string; role: AgentRole; permissions: AgentPermission[];
  department: string[]; canOrchestrate: boolean;
  maxConcurrentTasks: number; currentTasks: number;
  description?: string; maxProcessesMonitored?: number; reportsTo?: number;
}

export interface ProcessListRow {
  id: string;
  client: string;
  area: string;
  status: string;
  prazo: string;
  value: string;
  tribunal?: string;
}

export interface ProcessListPayload {
  type: "process-list";
  processes: ProcessListRow[];
}

export type AssistantChatCard = ProcessListPayload;

export interface JcChatMessage {
  id: number | string;
  role: string;
  agent?: string;
  content?: string | null;
  timestamp: string;
  card?: AssistantChatCard;
  // V23 orquestracao: 'stage' = etapa intermediaria (linha de status);
  // 'final' = resposta do agente; 'error' = falha.
  // 'action_proposal' = proposta de acao agentica (renderiza ActionCard).
  kind?: "stage" | "final" | "error" | "action_proposal";
  stage?: string;
  // Proposta de acao agentica (chat-orchestrator mode=confirm). Presente quando
  // kind === 'action_proposal'. Vem de metadata.proposal da linha chat_messages.
  proposal?: ActionProposal;
  meta?: { requestId?: string; tokensCost?: number; orchestration?: unknown };
  // Ações inline (ex.: botão "gerar mesmo assim" no gate de anexos). Só para
  // mensagens locais do sistema — não vem do banco.
  actions?: { label: string; onClick: () => void; tone?: "primary" | "ghost" }[];
}

export type SidebarItem = { id: string; label: string; color: string; badge: number; isVirtual?: boolean };

export interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  action: () => void;
  show: boolean;
  /** Quando presente, o item vira um grupo expansível (ex.: "Configurações"). */
  children?: MenuItem[];
}
