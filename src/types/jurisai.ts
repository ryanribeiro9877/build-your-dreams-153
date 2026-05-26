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
