import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProviderCode, ProviderConfigRow, ModelPricingRow } from "@/types/jurisai";

/**
 * useProviders — gestao de chaves de provider LLM (BYOK).
 *
 * Modelo: cada usuario cadastra suas proprias chaves Anthropic/OpenAI/Google etc.
 * Chaves ficam no Supabase Vault, criptografadas. Front so vai ver `api_key_last_4`.
 *
 * RPCs envolvidas:
 *  - register_provider_key(provider, api_key, set_default?, budget?, notes?)
 *  - llm_provider_configs (table com RLS por user_id)
 */

export function useProviders() {
  const [configs, setConfigs] = useState<ProviderConfigRow[]>([]);
  const [models, setModels] = useState<ModelPricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from("llm_provider_configs")
      .select("*")
      .order("provider", { ascending: true });
    if (error) {
      setError(error.message);
      setConfigs([]);
    } else {
      setConfigs((data || []) as unknown as ProviderConfigRow[]);
    }
  }, []);

  const loadModels = useCallback(async () => {
    const { data, error } = await supabase
      .from("model_pricing")
      .select("*")
      .eq("is_active", true)
      .order("provider", { ascending: true });
    if (!error) {
      setModels((data || []) as unknown as ModelPricingRow[]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadConfigs(), loadModels()]);
      setLoading(false);
    })();
  }, [loadConfigs, loadModels]);

  /** Cadastrar ou atualizar uma chave. Retorna config_id ou null em caso de erro. */
  const registerKey = useCallback(async (
    provider: ProviderCode,
    apiKey: string,
    options?: { setDefault?: boolean; monthlyBudgetUsd?: number; notes?: string }
  ): Promise<string | null> => {
    if (!apiKey || apiKey.trim().length < 16) {
      setError("Chave muito curta (minimo 16 caracteres).");
      return null;
    }
    const { data, error } = await supabase.rpc("register_provider_key", {
      p_provider: provider,
      p_api_key: apiKey,
      p_set_default: options?.setDefault ?? true,
      p_monthly_budget_usd: options?.monthlyBudgetUsd ?? null,
      p_notes: options?.notes ?? null,
    });
    if (error) {
      setError(error.message);
      return null;
    }
    await loadConfigs();
    return (data as unknown as string) || null;
  }, [loadConfigs]);

  /** Deletar uma config de provider. */
  const deleteConfig = useCallback(async (configId: string): Promise<boolean> => {
    const { error } = await supabase
      .from("llm_provider_configs")
      .delete()
      .eq("id", configId);
    if (error) {
      setError(error.message);
      return false;
    }
    await loadConfigs();
    return true;
  }, [loadConfigs]);

  /** Tornar uma config o default do user (desativa is_default das outras). */
  const setDefaultConfig = useCallback(async (configId: string): Promise<boolean> => {
    const target = configs.find(c => c.id === configId);
    if (!target) return false;

    // Batch: reset all other defaults in one query, then set chosen one
    const { error: resetError } = await supabase
      .from("llm_provider_configs")
      .update({ is_default: false })
      .neq("id", configId)
      .eq("is_default", true);
    if (resetError) {
      setError(resetError.message);
      return false;
    }

    const { error } = await supabase
      .from("llm_provider_configs")
      .update({ is_default: true })
      .eq("id", configId);
    if (error) {
      setError(error.message);
      return false;
    }
    await loadConfigs();
    return true;
  }, [configs, loadConfigs]);

  /** Modelos disponiveis para um provider especifico. */
  const modelsForProvider = useCallback((provider: ProviderCode): ModelPricingRow[] => {
    return models.filter(m => m.provider === provider);
  }, [models]);

  return {
    configs,
    models,
    modelsForProvider,
    loading,
    error,
    reload: loadConfigs,
    registerKey,
    deleteConfig,
    setDefaultConfig,
  };
}

/** Labels para UI - mapeia provider code -> display name. */
export const PROVIDER_LABELS: Record<ProviderCode, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
};

/** Hint sobre como obter a chave. */
export const PROVIDER_HINTS: Record<ProviderCode, string> = {
  anthropic: "Console: console.anthropic.com/settings/keys — formato sk-ant-...",
  openai: "Platform: platform.openai.com/api-keys — formato sk-...",
  google: "Studio: aistudio.google.com/apikey — chave alfanumerica",
  openrouter: "Painel: openrouter.ai/keys — formato sk-or-...",
  deepseek: "Console: platform.deepseek.com — formato sk-...",
};
