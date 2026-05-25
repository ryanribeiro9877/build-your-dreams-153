import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatOrchestratorResponse, ChatOrchestratorError } from "@/types/lexforce";

/**
 * useChatOrchestrator — wrap da edge function chat-orchestrator.
 *
 * Fluxo:
 *  1. startSession(agentId) -> sessionId
 *  2. sendMessage(sessionId, text) -> resposta + persiste tudo no banco
 *
 * Histórico nao precisa ser gerenciado no front - vem da tabela chat_messages
 * via Realtime ou query direta.
 */

/** Retorno do sendMessage/startSession — sem depender de state stale. */
export interface SendResult {
  response: ChatOrchestratorResponse | null;
  error: ChatOrchestratorError | null;
}

export interface StartSessionResult {
  sessionId: string | null;
  error: ChatOrchestratorError | null;
}

export function useChatOrchestrator() {
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<ChatOrchestratorError | null>(null);

  /** Cria sessao nova usando RPC start_chat_session. */
  const startSession = useCallback(async (
    entryAgentId: string,
    options?: { clientId?: string; title?: string }
  ): Promise<StartSessionResult> => {
    setLastError(null);
    // @ts-expect-error - RPC criada na Onda 2
    const { data, error } = await supabase.rpc("start_chat_session", {
      p_entry_agent_id: entryAgentId,
      p_client_id: options?.clientId ?? null,
      p_title: options?.title ?? null,
    });
    if (error) {
      const e: ChatOrchestratorError = { error: "start_session_failed", message: error.message };
      setLastError(e);
      return { sessionId: null, error: e };
    }
    return { sessionId: (data as unknown as string) || null, error: null };
  }, []);

  /** Envia mensagem pra sessao. Retorna resposta e erro de forma síncrona. */
  const sendMessage = useCallback(async (
    sessionId: string,
    message: string
  ): Promise<SendResult> => {
    if (!message.trim()) {
      return { response: null, error: { error: "invalid_request", message: "Mensagem vazia" } };
    }
    setPending(true);
    setLastError(null);

    try {
      const { data, error } = await supabase.functions.invoke("chat-orchestrator", {
        body: { sessionId, message },
      });

      if (error) {
        const errorBody = (error as unknown as { context?: { body?: string } }).context?.body;
        let parsed: ChatOrchestratorError | null = null;
        if (errorBody) {
          try {
            parsed = JSON.parse(errorBody) as ChatOrchestratorError;
          } catch {
            // ignore
          }
        }
        const e = parsed || { error: "request_failed", message: error.message };
        setLastError(e);
        return { response: null, error: e };
      }

      if (data && typeof data === "object" && "error" in data) {
        const e = data as ChatOrchestratorError;
        setLastError(e);
        return { response: null, error: e };
      }

      return { response: data as ChatOrchestratorResponse, error: null };
    } catch (e) {
      const err: ChatOrchestratorError = {
        error: "network_error",
        message: (e as Error)?.message || "Erro de rede",
      };
      setLastError(err);
      return { response: null, error: err };
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, lastError, startSession, sendMessage };
}

/** Mensagens user-friendly para os codigos de erro mais comuns. */
export const ERROR_MESSAGES: Record<string, string> = {
  agent_llm_not_configured: "Este agente ainda nao tem IA configurada. Va em Admin → Agentes para definir provedor e modelo.",
  provider_not_configured: "Voce ainda nao cadastrou a chave de API. Va em Configuracoes → Provedores de IA.",
  monthly_budget_exhausted: "Limite mensal de gastos atingido. Aumente o orcamento em Configuracoes → Provedores.",
  agent_inactive: "Este agente esta desativado no momento.",
  session_not_active: "Esta conversa foi encerrada. Inicie uma nova.",
  forbidden_not_session_owner: "Voce nao tem acesso a esta conversa.",
  session_not_found: "Conversa nao encontrada.",
  model_not_in_catalog: "O modelo configurado para este agente nao esta mais disponivel.",
  provider_call_failed: "O provedor de IA retornou erro. Tente novamente em alguns segundos.",
  invalid_jwt: "Sua sessao expirou. Faca login novamente.",
  request_failed: "Falha na requisição. Tente novamente em alguns segundos.",
  network_error: "Sem conexão com o servidor. Verifique sua internet.",
  start_session_failed: "Falha ao iniciar a conversa. Tente novamente.",
};

function detectProviderIssue(msg: string): string | null {
  const m = msg.toLowerCase();
  if (m.includes("insufficient_quota") || m.includes("exceeded your current quota") || m.includes("billing")) {
    return "Cota da chave OpenAI esgotada. Adicione saldo em platform.openai.com/account/billing e tente novamente.";
  }
  if (m.includes("invalid_api_key") || m.includes("invalid api key") || m.includes("incorrect api key")) {
    return "Chave de API rejeitada pelo provedor. Cadastre uma chave válida em /admin/agentes → aba Provedor.";
  }
  if (m.includes("rate_limit") || m.includes("rate limit") || m.includes("429")) {
    return "Limite de requisições atingido no provedor. Aguarde alguns segundos e tente de novo.";
  }
  if (m.includes("model_not_found") || m.includes("does not exist") || m.includes("the model")) {
    return "O modelo configurado não existe ou foi desativado pelo provedor. Escolha outro em /admin/agentes → aba Modelo.";
  }
  if (m.includes("context_length_exceeded") || m.includes("maximum context")) {
    return "A conversa ficou muito longa para o modelo. Limpe o histórico ou troque por um modelo de contexto maior.";
  }
  if (m.includes("safety") || m.includes("content_policy") || m.includes("content policy")) {
    return "O provedor bloqueou a resposta por política de conteúdo. Reformule a pergunta.";
  }
  return null;
}

export function friendlyError(err: ChatOrchestratorError | null): string {
  if (!err) return "";
  if (err.message) {
    const fine = detectProviderIssue(err.message);
    if (fine) return fine;
  }
  return ERROR_MESSAGES[err.error] || err.message || "Erro desconhecido.";
}
