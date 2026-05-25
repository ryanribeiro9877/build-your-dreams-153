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

export function useChatOrchestrator() {
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<ChatOrchestratorError | null>(null);

  /** Cria sessao nova usando RPC start_chat_session. */
  const startSession = useCallback(async (
    entryAgentId: string,
    options?: { clientId?: string; title?: string }
  ): Promise<string | null> => {
    setLastError(null);
    // @ts-expect-error - RPC criada na Onda 2
    const { data, error } = await supabase.rpc("start_chat_session", {
      p_entry_agent_id: entryAgentId,
      p_client_id: options?.clientId ?? null,
      p_title: options?.title ?? null,
    });
    if (error) {
      setLastError({ error: "start_session_failed", message: error.message });
      return null;
    }
    return (data as unknown as string) || null;
  }, []);

  /** Envia mensagem pra sessao. Retorna a resposta do agente. */
  const sendMessage = useCallback(async (
    sessionId: string,
    message: string
  ): Promise<ChatOrchestratorResponse | null> => {
    if (!message.trim()) return null;
    setPending(true);
    setLastError(null);

    try {
      const { data, error } = await supabase.functions.invoke("chat-orchestrator", {
        body: { sessionId, message },
      });

      if (error) {
        // FunctionsHttpError: response com error code
        const errorBody = (error as unknown as { context?: { body?: string } }).context?.body;
        let parsed: ChatOrchestratorError | null = null;
        if (errorBody) {
          try {
            parsed = JSON.parse(errorBody) as ChatOrchestratorError;
          } catch {
            // ignore
          }
        }
        setLastError(parsed || { error: "request_failed", message: error.message });
        return null;
      }

      // Pode ser que data tenha estrutura de erro (status 4xx que vira data por algum motivo)
      if (data && typeof data === "object" && "error" in data) {
        setLastError(data as ChatOrchestratorError);
        return null;
      }

      return data as ChatOrchestratorResponse;
    } catch (e) {
      setLastError({ error: "network_error", message: (e as Error)?.message || "Erro de rede" });
      return null;
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
};

/**
 * Reconhece erros comuns dos provedores (OpenAI / Anthropic / OpenRouter)
 * a partir do `message` retornado pelo edge function — assim a UX consegue
 * orientar o usuário com precisão (quota esgotada vs. chave inválida vs. rate-limit).
 */
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
  // Antes do mapa de codigos: tenta detectar problema fino do provedor
  // dentro do `message` (assim `provider_call_failed` vira "Cota esgotada"
  // em vez do generico "tente novamente em alguns segundos").
  if (err.message) {
    const fine = detectProviderIssue(err.message);
    if (fine) return fine;
  }
  return ERROR_MESSAGES[err.error] || err.message || "Erro desconhecido.";
}
