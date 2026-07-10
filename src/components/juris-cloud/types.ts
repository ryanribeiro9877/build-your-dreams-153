import type { LucideIcon } from "lucide-react";
import type { ActionProposal } from "@/components/chat/ActionCard";
import type { TaskAlertPayload } from "@/components/chat/TaskAlertCard";

/** Rascunho de tarefa extraído em linguagem natural (Task 18), vindo de
 * metadata.tarefa_draft na linha de chat_messages com kind === 'tarefa_confirm'.
 * Renderizado (editável) pelo TarefaConfirmCard (Task 19). */
export interface TarefaDraft {
  title: string | null;
  description: string | null;
  deadline_at: string | null;
  deadline_display: string | null;
  /** [FIX-EXPEDIENTE] Carimbo do edge: prazo dentro do expediente (dias úteis, 08h–17h).
   *  O edge só emite o cartão com prazo válido, então vem true; ausente em drafts
   *  antigos / pré-deploy do edge → o front trata `!== false` (não bloqueia). */
  deadline_ok?: boolean;
  priority: "critical" | "high" | "medium" | "low" | null;
  assignee_hint: string | null;
  client_query: string | null;
  // CPF sempre MASCARADO (***.***.***-NN) — o edge mascara antes de gravar; o CPF
  // em claro nunca chega ao cartão. Só o `id` (uuid) é usado no vínculo.
  client_resolved: { id: string; name: string; cpf_masked?: string | null; status?: string | null } | null;
  client_candidates: { id: string; name: string; cpf_masked?: string | null; status?: string | null }[];
  /** Só nos cartões REABERTOS após cadastro em linha: pré-seleciona o responsável que
   *  o usuário já havia escolhido (preserva o trabalho). Drafts do edge não trazem. */
  assignee_user_id?: string | null;
}

/** Ciclo da Agenda pelo chat. CPF sempre MASCARADO (mascarado no edge). */
export interface ReuniaoClienteRef { id: string; name: string; cpf_masked: string | null; status: string | null; }
/** Rascunho de agendamento (metadata.reuniao_draft, kind === 'reuniao_confirm'). */
export interface ReuniaoDraft {
  scheduled_date: string | null; start_time: string | null; type: string | null; display: string | null;
  lawyer_hint: string | null; phone: string | null; client_query: string | null;
  client_resolved: ReuniaoClienteRef | null; client_candidates: ReuniaoClienteRef[];
  /** Só nos cartões REABERTOS após cadastro em linha: pré-seleciona o advogado que
   *  o usuário já havia escolhido (preserva o trabalho). Drafts do edge não trazem. */
  lawyer_user_id?: string | null;
}

/** Rascunho de agendamento em espera, capturado quando o usuário clica em
 *  "Cadastrar cliente" no cartão (cliente não encontrado). Guardado em estado
 *  client-side no container; consumido ao concluir o cadastro (Modelo A). */
export interface PendingMeeting {
  client_name_hint: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  type: string | null;
  lawyer_user_id: string | null; // pode ser "" se o advogado ainda não foi escolhido
  lawyer_hint: string | null;
  phone: string | null;
  display: string | null;
}
/** Rascunho de TAREFA em espera, capturado quando o usuário clica em "Cadastrar
 *  cliente" no cartão (cliente não encontrado). Guardado em estado client-side no
 *  container; consumido ao concluir o cadastro (Modelo A) → cria a tarefa com o
 *  novo client_id. Espelha o PendingMeeting para o fluxo de tarefa. */
export interface PendingTask {
  client_name_hint: string | null;
  title: string | null;
  description: string | null;
  deadline_at: string | null; // ISO
  /** [FIX-EXPEDIENTE] Propagado do rascunho ao guardar (o cartão só existiu porque o
   *  edge validou o prazo); ao reabrir pós-cadastro herda como válido. */
  deadline_ok?: boolean;
  priority: TarefaDraft["priority"];
  assignee_user_id: string | null; // "" / null = o próprio criador
}

export interface ReuniaoAcaoCandidate { id: string; scheduled_date: string; start_time: string; client_name: string | null; status: string; type: string | null; }
/** Ação de ciclo/reagendar (metadata.reuniao_acao, kind === 'reuniao_acao'). */
export interface ReuniaoAcaoPayload {
  action: "confirmed" | "done" | "canceled" | "no_show" | "reschedule";
  candidates: ReuniaoAcaoCandidate[]; // 1 = direto; >1 = escolher
  new_date_local: string | null; new_time_local: string | null; // só reschedule
}

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
  // 'cadastro_form' = disparo do CADASTRO-MODELO-A (renderiza o ClienteFormWizard
  // inline abaixo da bolha; ver JurisChatPanel).
  // 'task_alert' = alerta de tarefa (renderiza TaskAlertCard). 'tarefa_confirm'
  // reservado para outra task (ainda sem renderização própria).
  // meeting_created/meeting_reminder/meeting_rescheduled (TRILHA B): reusam o
  // payload 'task_alert'/TaskAlertCard, só com rótulo/ícone próprios.
  kind?: "stage" | "final" | "error" | "action_proposal" | "cadastro_form" | "task_alert" | "tarefa_confirm" | "reuniao_confirm" | "reuniao_acao" | "meeting_created" | "meeting_reminder" | "meeting_rescheduled";
  stage?: string;
  // Proposta de acao agentica (chat-orchestrator mode=confirm). Presente quando
  // kind === 'action_proposal'. Vem de metadata.proposal da linha chat_messages.
  proposal?: ActionProposal;
  /** Presente quando kind === 'task_alert' (vem de metadata.task_alert). */
  taskAlert?: TaskAlertPayload;
  /** Presente quando kind === 'tarefa_confirm' (vem de metadata.tarefa_draft). */
  tarefaDraft?: TarefaDraft;
  /** Presente quando kind === 'reuniao_confirm' (vem de metadata.reuniao_draft). */
  reuniaoDraft?: ReuniaoDraft;
  /** Presente quando kind === 'reuniao_acao' (vem de metadata.reuniao_acao). */
  reuniaoAcao?: ReuniaoAcaoPayload;
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
