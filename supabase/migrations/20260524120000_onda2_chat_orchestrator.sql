-- ============================================================================
-- ONDA 2 — Chat Orchestrator (Patch V7)
--
-- Cria toda a infraestrutura que o frontend já assume existir:
--
--   1) Tabela model_pricing       (catálogo de modelos LLM por provider)
--   2) Tabela llm_provider_configs (BYOK — chaves do usuário, RLS strict)
--   3) Colunas LLM em public.agents (provider/model/temperature/…/system_prompt)
--   4) Tabela chat_sessions       (sessões persistentes do chat-orchestrator)
--   5) Tabela chat_messages       (mensagens com tokens/cost/model_used)
--   6) RPC start_chat_session      (cria sessão validando agente apto)
--   7) RPC register_provider_key   (cadastra chave BYOK + último-4)
--   8) RPC validate_agent_for_chat (checa se agente pode responder)
--   9) Seed do catálogo Anthropic (OpenAI já vem na migração 20260525000000)
--  10) Realtime publication para chat_sessions / chat_messages
--
-- Importante: esta migração deve rodar ANTES da 20260525000000_openai_models…
--             em ambientes novos. Se a 20260525000000 já rodou e falhou,
--             rode esta primeiro, depois rerode aquela (ela é idempotente).
-- ============================================================================

-- 0) Extensões necessárias
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Enums e domínios -------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_code') THEN
    CREATE TYPE public.provider_code AS ENUM (
      'anthropic', 'openai', 'google', 'openrouter', 'deepseek'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_session_status') THEN
    CREATE TYPE public.chat_session_status AS ENUM (
      'active', 'paused', 'closed', 'archived'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_message_role') THEN
    CREATE TYPE public.chat_message_role AS ENUM (
      'user', 'assistant', 'system', 'tool'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'model_tier') THEN
    CREATE TYPE public.model_tier AS ENUM (
      'flagship', 'balanced', 'fast', 'reasoning', 'vision'
    );
  END IF;
END$$;

-- 2) Tabela model_pricing ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.model_pricing (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                public.provider_code NOT NULL,
  model_id                text NOT NULL,
  display_name            text NOT NULL,
  tier                    public.model_tier NOT NULL DEFAULT 'balanced',
  input_price_per_mtok    numeric(10, 4) NOT NULL,
  output_price_per_mtok   numeric(10, 4) NOT NULL,
  context_window          integer NOT NULL DEFAULT 128000,
  max_output_tokens       integer NOT NULL DEFAULT 4096,
  supports_tools          boolean NOT NULL DEFAULT true,
  supports_vision         boolean NOT NULL DEFAULT false,
  recommended_for         text[] DEFAULT NULL,
  notes                   text DEFAULT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_pricing_unique_provider_model UNIQUE (provider, model_id)
);

CREATE INDEX IF NOT EXISTS idx_model_pricing_provider_active
  ON public.model_pricing (provider, is_active);

CREATE TRIGGER trg_model_pricing_updated_at
  BEFORE UPDATE ON public.model_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.model_pricing ENABLE ROW LEVEL SECURITY;

-- Catálogo é leitura pública para authenticated; escrita só admin.
DROP POLICY IF EXISTS "Authenticated read model_pricing" ON public.model_pricing;
CREATE POLICY "Authenticated read model_pricing"
  ON public.model_pricing FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage model_pricing" ON public.model_pricing;
CREATE POLICY "Admins manage model_pricing"
  ON public.model_pricing FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Tabela llm_provider_configs (BYOK) -------------------------------------

CREATE TABLE IF NOT EXISTS public.llm_provider_configs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                public.provider_code NOT NULL,
  api_key                 text NOT NULL,          -- plain c/ RLS strict (V2: migrar p/ pgsodium/vault)
  api_key_last_4          text,
  is_active               boolean NOT NULL DEFAULT true,
  is_default              boolean NOT NULL DEFAULT false,
  monthly_budget_usd      numeric(10, 2),
  monthly_spent_usd       numeric(12, 4) NOT NULL DEFAULT 0,
  budget_period_start     date,
  notes                   text,
  last_used_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT llm_provider_configs_unique_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_llm_provider_configs_user
  ON public.llm_provider_configs (user_id, is_active);

CREATE TRIGGER trg_llm_provider_configs_updated_at
  BEFORE UPDATE ON public.llm_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.llm_provider_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own provider configs" ON public.llm_provider_configs;
CREATE POLICY "Owners view own provider configs"
  ON public.llm_provider_configs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners insert own provider configs" ON public.llm_provider_configs;
CREATE POLICY "Owners insert own provider configs"
  ON public.llm_provider_configs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners update own provider configs" ON public.llm_provider_configs;
CREATE POLICY "Owners update own provider configs"
  ON public.llm_provider_configs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners delete own provider configs" ON public.llm_provider_configs;
CREATE POLICY "Owners delete own provider configs"
  ON public.llm_provider_configs FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 4) Colunas LLM em public.agents -------------------------------------------

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS provider          public.provider_code,
  ADD COLUMN IF NOT EXISTS model             text,
  ADD COLUMN IF NOT EXISTS temperature       numeric(3, 2),
  ADD COLUMN IF NOT EXISTS top_p             numeric(3, 2),
  ADD COLUMN IF NOT EXISTS max_tokens        integer,
  ADD COLUMN IF NOT EXISTS memory_enabled    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS history_limit     integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS allow_fallbacks   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_prompt     text;

-- Constraints "soft" (não bloqueiam, mas avisam via check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_temperature_range'
  ) THEN
    ALTER TABLE public.agents
      ADD CONSTRAINT agents_temperature_range
        CHECK (temperature IS NULL OR (temperature >= 0 AND temperature <= 2));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_top_p_range'
  ) THEN
    ALTER TABLE public.agents
      ADD CONSTRAINT agents_top_p_range
        CHECK (top_p IS NULL OR (top_p >= 0 AND top_p <= 1));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_agents_provider_model
  ON public.agents (provider, model)
  WHERE provider IS NOT NULL AND model IS NOT NULL;

-- 5) Tabela chat_sessions ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_agent_id          uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  client_id               uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title                   text,
  status                  public.chat_session_status NOT NULL DEFAULT 'active',
  message_count           integer NOT NULL DEFAULT 0,
  total_tokens_input      integer NOT NULL DEFAULT 0,
  total_tokens_output     integer NOT NULL DEFAULT 0,
  total_cost_usd          numeric(12, 6) NOT NULL DEFAULT 0,
  total_tool_calls        integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  last_message_at         timestamptz NOT NULL DEFAULT now(),
  closed_at               timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_last
  ON public.chat_sessions (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_entry_agent
  ON public.chat_sessions (entry_agent_id);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own chat sessions" ON public.chat_sessions;
CREATE POLICY "Owners view own chat sessions"
  ON public.chat_sessions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Owners insert own chat sessions" ON public.chat_sessions;
CREATE POLICY "Owners insert own chat sessions"
  ON public.chat_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners update own chat sessions" ON public.chat_sessions;
CREATE POLICY "Owners update own chat sessions"
  ON public.chat_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 6) Tabela chat_messages ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                    public.chat_message_role NOT NULL,
  agent_id                uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  content                 text,
  tool_calls              jsonb,
  tool_call_id            text,
  tool_result             jsonb,
  input_tokens            integer,
  output_tokens           integer,
  cost_usd                numeric(12, 6),
  model_used              text,
  duration_ms             integer,
  sequence_number         integer NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  metadata                jsonb
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_seq
  ON public.chat_messages (session_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON public.chat_messages (user_id, created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own chat messages" ON public.chat_messages;
CREATE POLICY "Owners view own chat messages"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- INSERT/UPDATE só via service_role da Edge Function (que ignora RLS).
-- Front nunca insere/atualiza diretamente — sempre via chat-orchestrator.

-- 7) Realtime publication ---------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- publication não existe (ambiente novo), ignore.
  NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END$$;

-- 8) RPC start_chat_session -------------------------------------------------
-- Cria sessão validando que o agente está apto (provider+model configurados,
-- e o user dono tem chave do provider em llm_provider_configs).
-- Retorna o UUID da nova sessão.

CREATE OR REPLACE FUNCTION public.start_chat_session(
  p_entry_agent_id uuid,
  p_client_id      uuid DEFAULT NULL,
  p_title          text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         uuid := auth.uid();
  v_agent_provider  public.provider_code;
  v_agent_model     text;
  v_has_provider    boolean;
  v_session_id      uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Valida que o agente existe e tem provider+model
  SELECT provider, model
    INTO v_agent_provider, v_agent_model
    FROM public.agents
   WHERE id = p_entry_agent_id
     AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_agent_provider IS NULL OR v_agent_model IS NULL THEN
    RAISE EXCEPTION 'agent_llm_not_configured' USING ERRCODE = 'P0001';
  END IF;

  -- Valida que o user tem chave configurada para esse provider
  SELECT EXISTS (
    SELECT 1 FROM public.llm_provider_configs
     WHERE user_id = v_user_id
       AND provider = v_agent_provider
       AND is_active = true
  ) INTO v_has_provider;

  IF NOT v_has_provider THEN
    RAISE EXCEPTION 'provider_not_configured' USING ERRCODE = 'P0001';
  END IF;

  -- Cria a sessão
  INSERT INTO public.chat_sessions (user_id, entry_agent_id, client_id, title, status)
       VALUES (v_user_id, p_entry_agent_id, p_client_id,
               COALESCE(p_title, 'Nova conversa'), 'active')
    RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_chat_session(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.start_chat_session(uuid, uuid, text) TO authenticated;

-- 9) RPC register_provider_key ---------------------------------------------
-- Recebe a chave em plaintext, guarda + extrai últimos 4 para exibição.
-- Upsert por (user_id, provider).

CREATE OR REPLACE FUNCTION public.register_provider_key(
  p_provider             public.provider_code,
  p_api_key              text,
  p_set_default          boolean DEFAULT true,
  p_monthly_budget_usd   numeric DEFAULT NULL,
  p_notes                text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_config_id  uuid;
  v_last_4     text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_api_key IS NULL OR length(trim(p_api_key)) < 16 THEN
    RAISE EXCEPTION 'invalid_api_key_format' USING ERRCODE = 'P0001';
  END IF;

  v_last_4 := right(trim(p_api_key), 4);

  -- Desmarca default das outras chaves se vamos virar default
  IF p_set_default THEN
    UPDATE public.llm_provider_configs
       SET is_default = false
     WHERE user_id = v_user_id AND is_default = true;
  END IF;

  INSERT INTO public.llm_provider_configs
    (user_id, provider, api_key, api_key_last_4, is_active, is_default,
     monthly_budget_usd, notes, budget_period_start)
  VALUES
    (v_user_id, p_provider, trim(p_api_key), v_last_4, true, p_set_default,
     p_monthly_budget_usd, p_notes, date_trunc('month', now())::date)
  ON CONFLICT (user_id, provider) DO UPDATE
    SET api_key            = EXCLUDED.api_key,
        api_key_last_4     = EXCLUDED.api_key_last_4,
        is_active          = true,
        is_default         = CASE WHEN p_set_default THEN true ELSE llm_provider_configs.is_default END,
        monthly_budget_usd = COALESCE(EXCLUDED.monthly_budget_usd, llm_provider_configs.monthly_budget_usd),
        notes              = COALESCE(EXCLUDED.notes, llm_provider_configs.notes),
        updated_at         = now()
  RETURNING id INTO v_config_id;

  RETURN v_config_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_provider_key(public.provider_code, text, boolean, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_provider_key(public.provider_code, text, boolean, numeric, text) TO authenticated;

-- 10) RPC validate_agent_for_chat ------------------------------------------
-- Checa se o agente tem provider+model E se o user tem chave correspondente.
-- Retorna linha única com is_valid/reason/agent_provider/agent_model.

CREATE OR REPLACE FUNCTION public.validate_agent_for_chat(
  p_agent_id uuid
) RETURNS TABLE (
  is_valid       boolean,
  reason         text,
  agent_provider text,
  agent_model    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_provider public.provider_code;
  v_model    text;
  v_active   boolean;
BEGIN
  SELECT a.provider, a.model, a.is_active
    INTO v_provider, v_model, v_active
    FROM public.agents a
   WHERE a.id = p_agent_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'agent_not_found', NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT v_active THEN
    RETURN QUERY SELECT false, 'agent_inactive', v_provider::text, v_model;
    RETURN;
  END IF;

  IF v_provider IS NULL OR v_model IS NULL THEN
    RETURN QUERY SELECT false, 'agent_llm_not_configured', v_provider::text, v_model;
    RETURN;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'not_authenticated', v_provider::text, v_model;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.llm_provider_configs
     WHERE user_id = v_user_id
       AND provider = v_provider
       AND is_active = true
  ) THEN
    RETURN QUERY SELECT false, 'provider_not_configured', v_provider::text, v_model;
    RETURN;
  END IF;

  -- Checa orçamento mensal (se setado)
  IF EXISTS (
    SELECT 1 FROM public.llm_provider_configs
     WHERE user_id = v_user_id
       AND provider = v_provider
       AND monthly_budget_usd IS NOT NULL
       AND monthly_spent_usd >= monthly_budget_usd
  ) THEN
    RETURN QUERY SELECT false, 'monthly_budget_exhausted', v_provider::text, v_model;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'ok', v_provider::text, v_model;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_agent_for_chat(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.validate_agent_for_chat(uuid) TO authenticated;

-- 11) Seed catálogo Anthropic ----------------------------------------------
-- OpenAI já é populado pela migração 20260525000000_openai_models_catalog…
-- Aqui completamos com Anthropic (Maio/2026: Sonnet 4.5/4.6, Opus 4.6/4.7,
-- Haiku 4.5).

INSERT INTO public.model_pricing
  (provider, model_id, display_name, tier, input_price_per_mtok, output_price_per_mtok,
   context_window, max_output_tokens, supports_tools, supports_vision, is_active)
VALUES
  ('anthropic', 'claude-opus-4-7',     'Claude Opus 4.7 · flagship',  'flagship',  15.00, 75.00, 200000, 32000, true, true, true),
  ('anthropic', 'claude-opus-4-6',     'Claude Opus 4.6 · flagship',  'flagship',  15.00, 75.00, 200000, 32000, true, true, true),
  ('anthropic', 'claude-sonnet-4-6',   'Claude Sonnet 4.6 · balanced','balanced',   3.00, 15.00, 1000000,64000, true, true, true),
  ('anthropic', 'claude-sonnet-4-5',   'Claude Sonnet 4.5 · balanced','balanced',   3.00, 15.00,  200000,64000, true, true, true),
  ('anthropic', 'claude-haiku-4-5',    'Claude Haiku 4.5 · fast',     'fast',       1.00,  5.00,  200000, 8192, true, true, true),
  ('anthropic', 'claude-3-7-sonnet-latest', 'Claude 3.7 Sonnet · legacy','balanced',3.00, 15.00,  200000, 8192, true, true, true)
ON CONFLICT (provider, model_id) DO UPDATE SET
  display_name           = EXCLUDED.display_name,
  tier                   = EXCLUDED.tier,
  input_price_per_mtok   = EXCLUDED.input_price_per_mtok,
  output_price_per_mtok  = EXCLUDED.output_price_per_mtok,
  context_window         = EXCLUDED.context_window,
  max_output_tokens      = EXCLUDED.max_output_tokens,
  supports_tools         = EXCLUDED.supports_tools,
  supports_vision        = EXCLUDED.supports_vision,
  is_active              = EXCLUDED.is_active,
  updated_at             = now();

-- ============================================================================
-- FIM. Após esta migração:
--   • supabase/functions/chat-orchestrator passa a ter todas as tabelas/RPCs
--     que precisa.
--   • Realtime fica habilitado para chat_messages / chat_sessions.
--   • Frontend (useChatOrchestrator, useProviders, useAgentLLMConfig) para de
--     dar @ts-expect-error em produção depois de `supabase gen types`.
-- ============================================================================
