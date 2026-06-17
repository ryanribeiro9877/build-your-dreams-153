import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentLLMConfig, ProviderCode } from "@/types/jurisai";

/**
 * useAgentLLMConfig — gestao de config LLM por agente.
 *
 * Cada agente tem campos provider/model/temperature/etc na tabela agents.
 * Se vierem NULL, o agente nao esta configurado e nao pode ser usado em chat.
 */

export function useAgentLLMConfig() {
  /** Le config LLM de um agente especifico. */
  const getConfig = useCallback(async (agentId: string): Promise<AgentLLMConfig | null> => {
    const { data, error } = await supabase
      .from("agents")
      .select("provider, model, temperature, top_p, max_tokens, memory_enabled, history_limit, allow_fallbacks, system_prompt")
      .eq("id", agentId)
      .single();
    if (error || !data) return null;
    return data as unknown as AgentLLMConfig;
  }, []);

  /** Atualiza config LLM de um agente. Validacao basica antes de gravar. */
  const updateConfig = useCallback(async (
    agentId: string,
    config: Partial<AgentLLMConfig>
  ): Promise<{ ok: boolean; error?: string }> => {
    // Validacoes basicas
    if (config.temperature !== null && config.temperature !== undefined) {
      if (config.temperature < 0 || config.temperature > 2) {
        return { ok: false, error: "temperature deve estar entre 0 e 2" };
      }
    }
    if (config.top_p !== null && config.top_p !== undefined) {
      if (config.top_p < 0 || config.top_p > 1) {
        return { ok: false, error: "top_p deve estar entre 0 e 1" };
      }
    }
    if (config.max_tokens !== null && config.max_tokens !== undefined) {
      if (config.max_tokens < 1 || config.max_tokens > 100000) {
        return { ok: false, error: "max_tokens deve estar entre 1 e 100000" };
      }
    }
    if (config.history_limit !== null && config.history_limit !== undefined) {
      if (config.history_limit < 1 || config.history_limit > 50) {
        return { ok: false, error: "history_limit deve estar entre 1 e 50" };
      }
    }

    const update: Record<string, unknown> = {};
    if ("provider" in config) update.provider = config.provider;
    if ("model" in config) update.model = config.model;
    if ("temperature" in config) update.temperature = config.temperature;
    if ("top_p" in config) update.top_p = config.top_p;
    if ("max_tokens" in config) update.max_tokens = config.max_tokens;
    if ("memory_enabled" in config) update.memory_enabled = config.memory_enabled;
    if ("history_limit" in config) update.history_limit = config.history_limit;
    if ("allow_fallbacks" in config) update.allow_fallbacks = config.allow_fallbacks;
    if ("system_prompt" in config) update.system_prompt = config.system_prompt;

    // Os tipos gerados pelo Supabase ficam desatualizados em relação ao
    // schema real (a tabela `agents` tem colunas de config IA que não
    // aparecem nos tipos). Cast via `as never` mantém runtime intacto.
    // .select() para detectar 0 linhas afetadas: quando a RLS bloqueia um UPDATE,
    // o Supabase NAO retorna erro — retorna 0 linhas. Sem isto, um salvamento
    // bloqueado parecia sucesso ("falso positivo").
    const { data, error } = await supabase
      .from("agents")
      .update(update as never)
      .eq("id", agentId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return { ok: false, error: "Nada foi salvo — voce nao tem permissao para editar este agente (ou ele nao existe)." };
    }
    return { ok: true };
  }, []);

  /** Limpa toda config LLM (volta o agente para o estado "nao configurado"). */
  const clearConfig = useCallback(async (agentId: string): Promise<boolean> => {
    const { error } = await supabase
      .from("agents")
      .update({
        provider: null,
        model: null,
        temperature: null,
        top_p: null,
        max_tokens: null,
        memory_enabled: null,
        history_limit: null,
        allow_fallbacks: null,
        system_prompt: null,
      } as never)
      .eq("id", agentId);
    return !error;
  }, []);

  /** Validar via RPC se agente esta apto a chat (helper rapido). */
  const validateForChat = useCallback(async (agentId: string) => {
    const { data, error } = await supabase.rpc("validate_agent_for_chat", {
      p_agent_id: agentId,
    });
    if (error) return { isValid: false, reason: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return {
      isValid: row?.is_valid ?? false,
      reason: row?.reason ?? "unknown",
      provider: row?.agent_provider as ProviderCode | null,
      model: row?.agent_model as string | null,
    };
  }, []);

  return { getConfig, updateConfig, clearConfig, validateForChat };
}

/** Defaults sensatos por nivel hierarquico (apenas sugestoes, nao impostos). */
export const SUGGESTED_BY_LEVEL: Record<number, Partial<AgentLLMConfig>> = {
  1: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0.3,
    max_tokens: 800,
    history_limit: 5,
    memory_enabled: false,
    allow_fallbacks: false,
  },
  2: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0.3,
    max_tokens: 2000,
    history_limit: 10,
    memory_enabled: false,
    allow_fallbacks: false,
  },
  3: {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    temperature: 0.3,
    max_tokens: 1200,
    history_limit: 8,
    memory_enabled: false,
    allow_fallbacks: false,
  },
  4: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0.2,
    max_tokens: 3000,
    history_limit: 15,
    memory_enabled: true,
    allow_fallbacks: false,
  },
};
