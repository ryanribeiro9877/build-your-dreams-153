// supabase/functions/chat-orchestrator/index.ts
//
// Orquestrador BYOK ("Bring Your Own Key") do JurisAI — Patch V7 / Onda 2.
//
// Substitui o antigo `chat-with-agent` por um fluxo orientado a sessão:
//
//   POST /functions/v1/chat-orchestrator
//   { sessionId: uuid, message: string }
//
//   →  { sessionId, userMessageId, assistantMessageId, content,
//        usage: { inputTokens, outputTokens, costUsd },
//        durationMs, model, provider,
//        agent: { id, name, role, level } }
//
// Fluxo:
//   1. Autentica via JWT (anon client repassa Authorization).
//   2. Carrega chat_sessions, valida owner + status='active'.
//   3. Carrega config do agente (provider/model/temperature/.../system_prompt).
//   4. Carrega histórico (chat_messages) últimas N (agent.history_limit ?? 10).
//   5. Resolve api_key em llm_provider_configs (BYOK).
//   6. Calcula `next_sequence_number`, insere user msg.
//   7. Chama provider (OpenAI ou Anthropic), com timeout 25s.
//   8. Calcula custo via model_pricing.
//   9. Insere assistant msg + atualiza chat_sessions (counters, totals, last_message_at).
//  10. Atualiza llm_provider_configs.monthly_spent_usd + last_used_at.
//  11. Retorna ChatOrchestratorResponse (forma combinada com src/types/lexforce.ts).
//
// Erros estruturados (sempre { error, message }):
//   - not_authenticated, session_not_found, forbidden_not_session_owner,
//     session_not_active, agent_llm_not_configured, provider_not_configured,
//     monthly_budget_exhausted, model_not_in_catalog, provider_call_failed,
//     unsupported_provider, invalid_request.
//
// Compatível com: OpenAI Chat Completions, Anthropic Messages API.
// (google/openrouter/deepseek caem em unsupported_provider — TODO Onda 3.)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OrchestratorRequest {
  sessionId: string;
  message: string;
}

interface AgentLLMConfig {
  id: string;
  name: string;
  role: string;
  level: number | null;
  provider: string | null;
  model: string | null;
  temperature: number | null;
  top_p: number | null;
  max_tokens: number | null;
  memory_enabled: boolean | null;
  history_limit: number | null;
  allow_fallbacks: boolean | null;
  system_prompt: string | null;
  is_active: boolean;
}

interface SessionRow {
  id: string;
  user_id: string;
  entry_agent_id: string | null;
  status: string;
  message_count: number;
}

interface ProviderConfigRow {
  id: string;
  api_key: string;
  monthly_budget_usd: number | null;
  monthly_spent_usd: number;
}

interface ModelPricingRow {
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  max_output_tokens: number;
}

interface HistoryMsg {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
}

// ─── helpers de resposta ──────────────────────────────────────────────────

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function errResp(status: number, code: string, message: string, details?: unknown) {
  return json(status, { error: code, message, details });
}

// ─── provider drivers ─────────────────────────────────────────────────────

interface ProviderCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  rawModelUsed: string;
}

async function callOpenAI(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string | null;
  history: HistoryMsg[];
  userMessage: string;
  temperature: number | null;
  top_p: number | null;
  maxTokens: number;
}): Promise<ProviderCallResult> {
  const messages: { role: string; content: string }[] = [];
  if (opts.systemPrompt) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  for (const h of opts.history) {
    if (!h.content) continue;
    if (h.role === "tool") continue; // (tool calls são V3)
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: "user", content: opts.userMessage });

  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    max_tokens: opts.maxTokens,
  };
  if (opts.temperature !== null) body.temperature = opts.temperature;
  if (opts.top_p !== null) body.top_p = opts.top_p;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI ${resp.status}: ${errText.slice(0, 400)}`);
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("OpenAI: resposta vazia");

    return {
      content,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      rawModelUsed: data.model ?? opts.model,
    };
  } finally {
    clearTimeout(t);
  }
}

async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string | null;
  history: HistoryMsg[];
  userMessage: string;
  temperature: number | null;
  top_p: number | null;
  maxTokens: number;
}): Promise<ProviderCallResult> {
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of opts.history) {
    if (!h.content) continue;
    if (h.role !== "user" && h.role !== "assistant") continue;
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: "user", content: opts.userMessage });

  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    max_tokens: opts.maxTokens,
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;
  if (opts.temperature !== null) body.temperature = opts.temperature;
  if (opts.top_p !== null) body.top_p = opts.top_p;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Anthropic ${resp.status}: ${errText.slice(0, 400)}`);
    }

    const data = (await resp.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };

    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");

    if (!text) throw new Error("Anthropic: resposta vazia");

    return {
      content: text,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      rawModelUsed: data.model ?? opts.model,
    };
  } finally {
    clearTimeout(t);
  }
}

// ─── fluxo principal ──────────────────────────────────────────────────────

async function loadAgent(admin: SupabaseClient, agentId: string): Promise<AgentLLMConfig | null> {
  const { data } = await admin
    .from("agents")
    .select(
      "id, name, role, level, provider, model, temperature, top_p, max_tokens, " +
      "memory_enabled, history_limit, allow_fallbacks, system_prompt, is_active"
    )
    .eq("id", agentId)
    .maybeSingle();
  return (data as unknown as AgentLLMConfig | null) ?? null;
}

async function loadProviderConfig(
  admin: SupabaseClient,
  userId: string,
  provider: string,
): Promise<ProviderConfigRow | null> {
  const { data } = await admin
    .from("llm_provider_configs")
    .select("id, api_key, monthly_budget_usd, monthly_spent_usd")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as ProviderConfigRow | null) ?? null;
}

async function loadModelPricing(
  admin: SupabaseClient,
  provider: string,
  modelId: string,
): Promise<ModelPricingRow | null> {
  const { data } = await admin
    .from("model_pricing")
    .select("input_price_per_mtok, output_price_per_mtok, max_output_tokens")
    .eq("provider", provider)
    .eq("model_id", modelId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as ModelPricingRow | null) ?? null;
}

async function loadHistory(
  admin: SupabaseClient,
  sessionId: string,
  limit: number,
): Promise<HistoryMsg[]> {
  const { data } = await admin
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("sequence_number", { ascending: false })
    .limit(limit);
  const arr = ((data as unknown as HistoryMsg[]) ?? []).reverse();
  return arr;
}

function computeCost(
  pricing: ModelPricingRow,
  inputTokens: number,
  outputTokens: number,
): number {
  const inUsd = (inputTokens / 1_000_000) * pricing.input_price_per_mtok;
  const outUsd = (outputTokens / 1_000_000) * pricing.output_price_per_mtok;
  return Number((inUsd + outUsd).toFixed(6));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return errResp(405, "method_not_allowed", "Use POST");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return errResp(500, "server_misconfigured", "ENV faltando no Supabase Edge");
  }

  // Identifica o user via JWT
  const authHeader = req.headers.get("authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) {
    return errResp(401, "invalid_jwt", "Sessão inválida ou expirada");
  }
  const userId = userData.user.id;

  // Parse body
  let body: OrchestratorRequest;
  try {
    body = await req.json();
  } catch {
    return errResp(400, "invalid_request", "JSON inválido");
  }
  if (!body.sessionId || typeof body.sessionId !== "string") {
    return errResp(400, "invalid_request", "sessionId é obrigatório");
  }
  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    return errResp(400, "invalid_request", "message é obrigatória");
  }
  if (body.message.length > 8000) {
    return errResp(400, "invalid_request", "Mensagem excede 8000 caracteres");
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // 1) Carrega sessão + valida ownership/status
  const { data: sessionRow } = await admin
    .from("chat_sessions")
    .select("id, user_id, entry_agent_id, status, message_count")
    .eq("id", body.sessionId)
    .maybeSingle();
  const session = sessionRow as unknown as SessionRow | null;

  if (!session) return errResp(404, "session_not_found", "Conversa não encontrada");
  if (session.user_id !== userId) {
    return errResp(403, "forbidden_not_session_owner", "Sem acesso a esta conversa");
  }
  if (session.status !== "active") {
    return errResp(409, "session_not_active", "Esta conversa foi encerrada");
  }
  if (!session.entry_agent_id) {
    return errResp(409, "agent_llm_not_configured", "Sessão sem agente de entrada");
  }

  // 2) Carrega agente
  const agent = await loadAgent(admin, session.entry_agent_id);
  if (!agent) return errResp(404, "agent_not_found", "Agente da sessão não existe");
  if (!agent.is_active) {
    return errResp(409, "agent_inactive", "Este agente está desativado");
  }
  if (!agent.provider || !agent.model) {
    return errResp(409, "agent_llm_not_configured", "Agente sem provider/model definidos");
  }

  // 3) Carrega chave BYOK
  const provCfg = await loadProviderConfig(admin, userId, agent.provider);
  if (!provCfg) {
    return errResp(409, "provider_not_configured", `Sem chave cadastrada para ${agent.provider}`);
  }
  if (
    provCfg.monthly_budget_usd !== null &&
    Number(provCfg.monthly_spent_usd) >= Number(provCfg.monthly_budget_usd)
  ) {
    return errResp(402, "monthly_budget_exhausted", "Limite mensal de gastos atingido");
  }

  // 4) Carrega pricing do modelo
  const pricing = await loadModelPricing(admin, agent.provider, agent.model);
  if (!pricing) {
    return errResp(409, "model_not_in_catalog", `Modelo ${agent.model} não está em model_pricing`);
  }

  // 5) Carrega histórico
  const historyLimit = Math.max(1, Math.min(50, agent.history_limit ?? 10));
  const history = await loadHistory(admin, body.sessionId, historyLimit);

  // 6) Insere user message (sequence_number = message_count + 1)
  const nextSeq = session.message_count + 1;
  const { data: userMsg, error: userMsgErr } = await admin
    .from("chat_messages")
    .insert({
      session_id: body.sessionId,
      user_id: userId,
      role: "user",
      content: body.message,
      sequence_number: nextSeq,
    })
    .select("id")
    .single();

  if (userMsgErr || !userMsg) {
    return errResp(500, "db_error", `Falha ao persistir mensagem: ${userMsgErr?.message}`);
  }
  const userMessageId = (userMsg as { id: string }).id;

  // 7) Chama provider
  const tStart = performance.now();
  let providerResult: ProviderCallResult;
  const maxTokens = Math.min(agent.max_tokens ?? 2000, pricing.max_output_tokens);

  try {
    if (agent.provider === "openai") {
      providerResult = await callOpenAI({
        apiKey: provCfg.api_key,
        model: agent.model,
        systemPrompt: agent.system_prompt,
        history,
        userMessage: body.message,
        temperature: agent.temperature,
        top_p: agent.top_p,
        maxTokens,
      });
    } else if (agent.provider === "anthropic") {
      providerResult = await callAnthropic({
        apiKey: provCfg.api_key,
        model: agent.model,
        systemPrompt: agent.system_prompt,
        history,
        userMessage: body.message,
        temperature: agent.temperature,
        top_p: agent.top_p,
        maxTokens,
      });
    } else {
      return errResp(
        501,
        "unsupported_provider",
        `Provider ${agent.provider} ainda não suportado pelo orchestrator (Onda 3).`,
      );
    }
  } catch (e) {
    const msg = (e as Error).message ?? "erro desconhecido";
    // Mantém a user_message no banco mas marca falha em metadata, pra UX
    // poder mostrar "estornado" e o admin auditar depois.
    await admin
      .from("chat_messages")
      .update({ metadata: { provider_call_failed: msg } })
      .eq("id", userMessageId);
    return errResp(502, "provider_call_failed", msg);
  }

  const durationMs = Math.round(performance.now() - tStart);
  const costUsd = computeCost(pricing, providerResult.inputTokens, providerResult.outputTokens);

  // 8) Insere assistant message
  const { data: asstMsg, error: asstErr } = await admin
    .from("chat_messages")
    .insert({
      session_id: body.sessionId,
      user_id: userId,
      role: "assistant",
      agent_id: agent.id,
      content: providerResult.content,
      input_tokens: providerResult.inputTokens,
      output_tokens: providerResult.outputTokens,
      cost_usd: costUsd,
      model_used: providerResult.rawModelUsed,
      duration_ms: durationMs,
      sequence_number: nextSeq + 1,
      metadata: {
        provider: agent.provider,
        agent_role: agent.role,
      },
    })
    .select("id")
    .single();

  if (asstErr || !asstMsg) {
    return errResp(500, "db_error", `Falha ao persistir resposta: ${asstErr?.message}`);
  }
  const assistantMessageId = (asstMsg as { id: string }).id;

  // 9) Atualiza chat_sessions com somatório acumulado.
  //
  // Como Supabase JS não tem `.update({ field: sql"field + n" })`, fazemos
  // read-modify-write. Sob carga seria race; o fluxo do orchestrator é
  // sequencial por sessão (UI envia próxima mensagem só depois desta resposta),
  // então o risco é baixo. Se virar problema, migrar para RPC com UPDATE inline:
  //   UPDATE chat_sessions SET total_cost_usd = total_cost_usd + $1 ...
  {
    const { data: cur } = await admin
      .from("chat_sessions")
      .select("total_tokens_input, total_tokens_output, total_cost_usd")
      .eq("id", body.sessionId)
      .maybeSingle();
    const c = (cur as {
      total_tokens_input: number;
      total_tokens_output: number;
      total_cost_usd: number;
    } | null) ?? { total_tokens_input: 0, total_tokens_output: 0, total_cost_usd: 0 };

    await admin
      .from("chat_sessions")
      .update({
        message_count: nextSeq + 1,
        total_tokens_input: c.total_tokens_input + providerResult.inputTokens,
        total_tokens_output: c.total_tokens_output + providerResult.outputTokens,
        total_cost_usd: Number(c.total_cost_usd) + costUsd,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", body.sessionId);
  }

  // 10) Atualiza llm_provider_configs (monthly_spent_usd + last_used_at)
  await admin
    .from("llm_provider_configs")
    .update({
      monthly_spent_usd: Number(provCfg.monthly_spent_usd) + costUsd,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", provCfg.id);

  // 11) Resposta no formato ChatOrchestratorResponse
  return json(200, {
    sessionId: body.sessionId,
    userMessageId,
    assistantMessageId,
    content: providerResult.content,
    usage: {
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      costUsd,
    },
    durationMs,
    model: providerResult.rawModelUsed,
    provider: agent.provider,
    agent: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      level: agent.level ?? 4,
    },
  });
});
