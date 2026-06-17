// Tipos locais da Onda 2 enquanto o types.ts auto-gerado nao reflete as
// migrations m20-m29. Mantem o resto do app type-safe sem regenerar tudo.

export type ProviderCode = "anthropic" | "openai" | "google" | "openrouter" | "deepseek";

export interface ProviderConfigRow {
  id: string;
  user_id: string;
  provider: ProviderCode;
  api_key_last_4: string | null;
  is_active: boolean;
  is_default: boolean;
  monthly_budget_usd: number | null;
  monthly_spent_usd: number;
  budget_period_start: string | null;
  notes: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelPricingRow {
  id: string;
  provider: ProviderCode;
  model_id: string;
  display_name: string;
  tier: "flagship" | "balanced" | "fast" | "reasoning" | "vision";
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  context_window: number;
  max_output_tokens: number;
  supports_tools: boolean;
  supports_vision: boolean;
  recommended_for: string[] | null;
  notes: string | null;
  is_active: boolean;
}

export interface AgentLLMConfig {
  provider: ProviderCode | null;
  model: string | null;
  temperature: number | null;
  top_p: number | null;
  max_tokens: number | null;
  memory_enabled: boolean | null;
  history_limit: number | null;
  allow_fallbacks: boolean | null;
  system_prompt: string | null;
}

export interface ChatSessionRow {
  id: string;
  user_id: string;
  entry_agent_id: string | null;
  client_id: string | null;
  title: string | null;
  status: "active" | "paused" | "closed" | "archived";
  message_count: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost_usd: number;
  total_tool_calls: number;
  created_at: string;
  last_message_at: string;
  closed_at: string | null;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant" | "system" | "tool";
  agent_id: string | null;
  content: string | null;
  tool_calls: unknown;
  tool_call_id: string | null;
  tool_result: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  model_used: string | null;
  duration_ms: number | null;
  sequence_number: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ChatOrchestratorResponse {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  content: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  durationMs?: number;
  model?: string;
  provider?: string;
  traceId?: string;
  agent?: { id: string; name: string; role: string; level: number };
}

export interface ChatOrchestratorError {
  error: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// V14 — LexForce Organizational Model (Bacellar Advogados)
// ============================================================================

export type OrgStage =
  | "atendimento"
  | "confeccao"
  | "revisao"
  | "protocolo"
  | "audiencia"
  | "execucao"
  | "execucao_sindicato"
  | "recursos"
  | "recursos_criticos"
  | "alvara"
  | "diligencia"
  | "acompanhamento"
  | "financeiro"
  | "recepcao"
  | "recepcao_supervisionada"
  | "admin_equipe"
  | "captacao_cooperativa"
  | "kanban_pendencias"
  | "gestao"
  | "todas";

export type LegalArea =
  | "bancario"
  | "familia"
  | "plano_saude"
  | "consumidor"
  | "civil"
  | "previdenciario"
  | "tributario";

export type UserTaskStatus =
  | "draft"
  | "assigned"
  | "in_progress"
  | "awaiting_external"
  | "awaiting_validation"
  | "blocked"
  | "completed"
  | "cancelled";

export type CoverageStatus = "scheduled" | "active" | "finished" | "cancelled";

export type InterAssistantStatus =
  | "pending"
  | "in_progress"
  | "answered"
  | "denied"
  | "expired";

export type CaptacaoCanalTipo =
  | "cooperativa"
  | "ressaque"
  | "indicacao"
  | "site"
  | "outro";

export type AgentRoleV14 =
  | "ceo"
  | "assistant_root"
  | "director"
  | "orchestrator"
  | "manager"
  | "specialist"
  | "reviewer"
  | "executor"
  | "monitor";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface RoleTemplateRow {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  stages: OrgStage[];
  areas: LegalArea[] | null;
  is_admin: boolean;
  has_login: boolean;
  can_assign_tasks: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AgentTemplateRow {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  role: AgentRoleV14;
  stage: OrgStage | null;
  area: LegalArea | null;
  default_color: string;
  default_provider: ProviderCode;
  default_model: string;
  default_temperature: number;
  default_max_tokens: number;
  default_system_prompt: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RoleAgentMatrixRow {
  id: string;
  role_template_id: string;
  agent_template_id: string;
  is_default: boolean;
  notes: string | null;
  created_at: string;
}

export interface TaskTypeRow {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  stage: OrgStage;
  area: LegalArea | null;
  default_sla_hours: number | null;
  requires_validation: boolean;
  validator_role_code: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RoleTaskMatrixRow {
  id: string;
  task_type_id: string;
  role_template_id: string;
  can_execute: boolean;
  can_assign: boolean;
  is_default_assignee: boolean;
  notes: string | null;
  created_at: string;
}

export interface UserAreaRow {
  id: string;
  user_id: string;
  area: LegalArea;
  is_primary: boolean;
  created_at: string;
}

export interface RoleCoverageRow {
  id: string;
  primary_user_id: string;
  backup_user_id: string | null;
  scope_stage: OrgStage | null;
  scope_area: LegalArea | null;
  status: CoverageStatus;
  active_from: string;
  active_until: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalCollaboratorRow {
  id: string;
  full_name: string;
  role_template_id: string | null;
  phone_whatsapp: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserTaskRow {
  id: string;
  task_type_id: string;
  title: string;
  description: string | null;
  assigner_user_id: string;
  assignee_user_id: string | null;
  assignee_external_id: string | null;
  process_id: string | null;
  client_id: string | null;
  area: LegalArea | null;
  status: UserTaskStatus;
  priority: TaskPriority;
  documentation_completed_at: string | null;
  deadline_at: string | null;
  external_kanban_ref: string | null;
  payload: Record<string, unknown>;
  notes: string | null;
  validator_user_id: string | null;
  validated_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterAssistantRequestRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  request_type: string;
  payload: Record<string, unknown>;
  status: InterAssistantStatus;
  response_payload: Record<string, unknown> | null;
  related_task_id: string | null;
  related_session_id: string | null;
  expires_at: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaptacaoCanalRow {
  id: string;
  code: string;
  display_name: string;
  tipo: CaptacaoCanalTipo;
  description: string | null;
  is_active: boolean;
  default_assignee_role_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Extensions to existing types
export interface ProfileV14Extension {
  role_template_id: string | null;
  organization_id: string | null;
  full_name: string | null;
}

export interface AgentV14Extension {
  owner_user_id: string | null;
  source_template_id: string | null;
  is_overridden: boolean;
  is_personal: boolean;
}

// ============================================================================
// V20 — Notificações por e-mail + Anexos em tarefas
// ============================================================================

export type EmailNotificationType =
  | "task_assigned"
  | "task_validation_required"
  | "task_validated"
  | "task_rejected"
  | "inter_assistant_received"
  | "inter_assistant_answered";

export type EmailNotificationStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "skipped";

export interface EmailNotificationRow {
  id: string;
  recipient_user_id: string;
  recipient_email: string;
  type: EmailNotificationType;
  subject: string;
  body_html: string;
  body_text: string | null;
  related_task_id: string | null;
  related_request_id: string | null;
  status: EmailNotificationStatus;
  attempts: number;
  last_error: string | null;
  scheduled_at: string;
  sent_at: string | null;
  resend_id: string | null;
  created_at: string;
}

export interface TaskAttachmentRow {
  id: string;
  task_id: string;
  uploader_user_id: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string | null;
  description: string | null;
  created_at: string;
}

export interface FindUserMissingAgentsRow {
  user_id: string;
  email: string;
  full_name: string;
  cargo: string;
  cargo_label: string;
  is_estagiario: boolean;
  templates_esperados: number;
  agentes_atuais: number;
  faltam: number;
}


// ============================================================================
// SP1 — Kanban (visão de "situação" + boards configuráveis)
// ============================================================================

/**
 * Situação simplificada (5 estados) derivada do `UserTaskStatus` (8 estados).
 * Espelha o enum SQL `task_situacao`. Mapa e rótulos em src/lib/kanbanSituacao.ts.
 */
export type TaskSituacao =
  | "pendente"
  | "em_execucao"
  | "concluida_sucesso"
  | "concluida_sem_sucesso"
  | "cancelado";

export interface KanbanBoardSummary {
  id: string;
  name: string;
  is_private: boolean;
  is_owner: boolean;
  is_favorite: boolean;
  can_admin: boolean;
  card_count: number;
  hide_completed_after_days: number | null;
  simplified_cards: boolean;
  sort_order: number;
}

export interface KanbanColumn {
  id: string;
  board_id: string;
  name: string;
  situacao: TaskSituacao;
  position: number;
}

export interface KanbanCardV2 {
  id: string;
  title: string;
  situacao: TaskSituacao;
  status: UserTaskStatus;
  priority: TaskPriority;
  area: LegalArea | null;
  deadline_at: string | null;
  is_overdue: boolean;
  assignee_user_id: string | null;
  assigner_user_id: string | null;
  validator_user_id: string | null;
  assignee_name: string;
  task_type_label: string;
  origin: "processo" | "cliente" | "interna";
  client_id: string | null;
  client_name: string | null;
  process_id: string | null;
  process_number: string | null;
  awaiting_role_code: string | null;
  column_id: string;
  position: number;
  created_at: string;
  tags: KanbanTag[];
}

/** Board no detalhe (get_kanban_board): metadados do summary + concessões de acesso. */
export interface KanbanBoardDetailBoard extends KanbanBoardSummary {
  grant_user_ids: string[];
  grant_role_codes: string[];
}

export interface KanbanBoardDetail {
  board: KanbanBoardDetailBoard;
  columns: KanbanColumn[];
  cards: KanbanCardV2[];
}

// ============================================================================
// SP2 — Filtros do Kanban (client-side) + filtros salvos
// ============================================================================

export type KanbanInvolvement = "todas" | "responsavel" | "envolvido" | "delegadas";
export type KanbanSort = "recentes" | "prazo" | "prioridade" | "titulo";

export interface KanbanFilterState {
  involvement: KanbanInvolvement;
  search: string;
  sort: KanbanSort;
  /** Intervalo por deadline_at (ISO date, inclusivo). */
  periodStart: string | null;
  periodEnd: string | null;
  /** Filtros avançados. */
  assignees: string[];       // assignee_user_id
  taskTypes: string[];       // task_type_label (origem da etiqueta de tipo)
  areas: LegalArea[];
  situacoes: TaskSituacao[];
  marcadores: string[];      // ids de kanban_tags
  clientName: string;
  processNumber: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  filter: KanbanFilterState;
  created_at: string;
}

// ============================================================================
// SP3 — Detalhe-hub: marcadores (tags), detalhe da tarefa, comentários
// ============================================================================

export interface KanbanTag {
  id: string;
  name: string;
  color: string;
}

/** Retorno de get_user_task_detail (modal-hub). */
export interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  situacao: TaskSituacao;
  status: UserTaskStatus;
  priority: TaskPriority;
  area: LegalArea | null;
  deadline_at: string | null;
  created_at: string;
  completed_at: string | null;
  task_type_label: string;
  assignee_user_id: string | null;
  assignee_name: string;
  assigner_user_id: string | null;
  assigner_name: string;
  validator_user_id: string | null;
  validator_name: string | null;
  client_id: string | null;
  client_name: string | null;
  process_id: string | null;
  process_number: string | null;
  board_id: string | null;
  column_id: string | null;
  tags: KanbanTag[];
}

export interface TaskComment {
  id: string;
  author_user_id: string;
  author_name: string;
  body: string;
  mentioned_user_ids: string[];
  created_at: string;
}
