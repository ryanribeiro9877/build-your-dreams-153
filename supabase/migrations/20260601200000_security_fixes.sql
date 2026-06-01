-- ============================================================================
-- Security Fixes Migration
-- Date: 2026-06-01
-- ============================================================================
-- This migration addresses multiple security vulnerabilities found during
-- audit. Each fix is numbered and commented for traceability.
--
-- Fix 1: consume_tokens / consume_tokens_with_ref — ownership check
-- Fix 2: is_master_admin() — remove hardcoded email
-- Fix 3: token_transactions — UNIQUE constraint on (reference_id, transaction_type)
-- Fix 4: increment_session_counters / increment_provider_spend — ownership + search_path
-- Fix 5: user_roles SELECT policy — restrict to own roles or admin
-- Fix 6: agents_with_owner_v — security_invoker = true
-- Fix 7: provision_user_agents — ownership check
-- Fix 8: find_users_missing_agents — master admin access control
-- Fix 9: get_eligible_assignees — authorization check
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX 1 (CRITICAL): consume_tokens — add ownership check
-- ============================================================================
-- Previously any authenticated user could consume tokens for any other user.
-- Now enforces p_user_id == auth.uid().

CREATE OR REPLACE FUNCTION public.consume_tokens(
  p_user_id uuid,
  p_amount integer,
  p_description text DEFAULT 'Mensagem enviada'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance integer;
BEGIN
  -- Security: only consume your own tokens
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: cannot consume tokens for another user';
  END IF;

  SELECT balance INTO current_balance
  FROM public.token_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF current_balance IS NULL OR current_balance < p_amount THEN
    RETURN false;
  END IF;

  UPDATE public.token_balances
  SET balance = balance - p_amount,
      total_consumed = total_consumed + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.token_transactions (user_id, amount, transaction_type, description)
  VALUES (p_user_id, -p_amount, 'consumption', p_description);

  RETURN true;
END;
$$;

-- FIX 1 (cont.): consume_tokens_with_ref — add ownership check

CREATE OR REPLACE FUNCTION public.consume_tokens_with_ref(
  p_user_id uuid,
  p_amount integer,
  p_description text,
  p_reference_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance integer;
BEGIN
  -- Security: only consume your own tokens
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: cannot consume tokens for another user';
  END IF;

  SELECT balance INTO current_balance
  FROM public.token_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF current_balance IS NULL OR current_balance < p_amount THEN
    RETURN false;
  END IF;

  UPDATE public.token_balances
  SET balance = balance - p_amount,
      total_consumed = total_consumed + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.token_transactions (user_id, amount, transaction_type, description, reference_id)
  VALUES (p_user_id, -p_amount, 'consumption', p_description, p_reference_id);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_tokens_with_ref(uuid, integer, text, text) TO authenticated;

-- ============================================================================
-- FIX 2 (CRITICAL): is_master_admin() — remove hardcoded admin@juridico.com
-- ============================================================================
-- The hardcoded email check is a backdoor risk. Only role-based checks remain.

CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'director')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_templates rt ON rt.id = p.role_template_id
      WHERE p.user_id = _user_id
        AND rt.code = 'socio'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin(UUID) TO authenticated;

-- ============================================================================
-- FIX 3 (CRITICAL): token_transactions UNIQUE constraint
-- ============================================================================
-- Prevents duplicate transactions for the same reference_id + type,
-- enforcing idempotency at the DB level.

ALTER TABLE public.token_transactions
  ADD CONSTRAINT uq_token_transactions_reference
  UNIQUE (reference_id, transaction_type);

-- ============================================================================
-- FIX 4 (HIGH): increment_session_counters — ownership + search_path
-- ============================================================================
-- Previously had no ownership check and no search_path pinning.

CREATE OR REPLACE FUNCTION public.increment_session_counters(
  p_session_id   uuid,
  p_tokens_in    int,
  p_tokens_out   int,
  p_cost         numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security: verify the caller owns this session
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_sessions
    WHERE id = p_session_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.chat_sessions
  SET
    message_count        = message_count + 2,
    total_tokens_input   = total_tokens_input  + p_tokens_in,
    total_tokens_output  = total_tokens_output + p_tokens_out,
    total_cost_usd       = total_cost_usd + p_cost,
    last_message_at      = now()
  WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_session_counters(uuid, int, int, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_session_counters(uuid, int, int, numeric) TO authenticated;

-- FIX 4 (cont.): increment_provider_spend — ownership + search_path

CREATE OR REPLACE FUNCTION public.increment_provider_spend(
  p_config_id  uuid,
  p_cost       numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security: verify the caller owns this provider config
  IF NOT EXISTS (
    SELECT 1 FROM public.llm_provider_configs
    WHERE id = p_config_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.llm_provider_configs
  SET
    monthly_spent_usd = monthly_spent_usd + p_cost,
    last_used_at      = now()
  WHERE id = p_config_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_provider_spend(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_provider_spend(uuid, numeric) TO authenticated;

-- ============================================================================
-- FIX 5 (HIGH): user_roles SELECT policy — restrict visibility
-- ============================================================================
-- Previously all authenticated users could see ALL roles (USING (true)).
-- Now users can only see their own roles, unless they are an admin.

DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.user_roles;
CREATE POLICY "Users can view own roles or admins can view all" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- FIX 6 (HIGH): agents_with_owner_v — add security_invoker
-- ============================================================================
-- Without security_invoker the view runs as the definer (superuser), leaking
-- data past RLS. Recreating with security_invoker = true.

DROP VIEW IF EXISTS public.agents_with_owner_v;
CREATE VIEW public.agents_with_owner_v WITH (security_invoker = true) AS
SELECT
  a.id,
  a.name,
  a.color,
  a.role,
  a.status,
  a.department_id,
  a.can_orchestrate,
  a.max_concurrent_tasks,
  a.current_tasks,
  a.description,
  a.level,
  a.is_active,
  a.owner_user_id,
  a.source_template_id,
  a.is_personal,
  a.is_overridden,
  at.code AS template_code,
  at.stage AS template_stage,
  at.area AS template_area,
  d.name AS department_name,
  p.display_name AS owner_display_name,
  rt.code AS owner_role_code,
  rt.display_name AS owner_role_label
FROM public.agents a
LEFT JOIN public.agent_templates at ON at.id = a.source_template_id
LEFT JOIN public.departments d ON d.id = a.department_id
LEFT JOIN public.profiles p ON p.user_id = a.owner_user_id
LEFT JOIN public.role_templates rt ON rt.id = p.role_template_id
WHERE a.is_active = true;

COMMENT ON VIEW public.agents_with_owner_v IS
  'View enriquecida de agents incluindo info do dono (profile + role_template) e template de origem (stage, area). security_invoker=true para respeitar RLS do caller.';

GRANT SELECT ON public.agents_with_owner_v TO authenticated;

-- ============================================================================
-- FIX 7 (MEDIUM): provision_user_agents — ownership check
-- ============================================================================
-- Authenticated users should only provision agents for themselves,
-- unless they are a master admin.

CREATE OR REPLACE FUNCTION public.provision_user_agents(p_user_id UUID)
RETURNS TABLE (
  agent_id UUID,
  template_code TEXT,
  display_name TEXT,
  was_created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_template_id UUID;
  v_is_estagiario BOOLEAN;
  v_default_dept_id UUID;
  v_template RECORD;
  v_new_agent_id UUID;
  v_existing_agent_id UUID;
  v_was_created BOOLEAN;
BEGIN
  -- Security: only provision for yourself or if you are master admin
  IF p_user_id != auth.uid() AND NOT public.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 1. Carrega perfil do usuario
  SELECT p.role_template_id, COALESCE(p.is_estagiario, false)
  INTO v_role_template_id, v_is_estagiario
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  IF v_role_template_id IS NULL THEN
    RAISE NOTICE 'provision_user_agents: usuario % sem role_template_id; nenhum agente provisionado', p_user_id;
    RETURN;
  END IF;

  -- 2. Departamento default (fallback "assistente" ou primeiro disponivel)
  SELECT id INTO v_default_dept_id
  FROM public.departments
  WHERE name ILIKE '%assistente%'
  LIMIT 1;

  IF v_default_dept_id IS NULL THEN
    SELECT id INTO v_default_dept_id FROM public.departments LIMIT 1;
  END IF;

  IF v_default_dept_id IS NULL THEN
    RAISE EXCEPTION 'provision_user_agents: nenhum departamento disponivel para vincular agentes';
  END IF;

  -- 3. Loop nos agent_templates do role do usuario (respeitando filtro is_estagiario)
  FOR v_template IN
    SELECT
      at.id           AS template_id,
      at.code         AS template_code,
      at.display_name AS display_name,
      at.description  AS description,
      at.role         AS agent_role,
      at.default_color AS color,
      at.default_provider AS provider,
      at.default_model AS model,
      at.default_temperature AS temperature,
      at.default_max_tokens AS max_tokens,
      at.default_system_prompt AS system_prompt
    FROM public.role_agent_matrix ram
    JOIN public.agent_templates at ON at.id = ram.agent_template_id
    WHERE ram.role_template_id = v_role_template_id
      AND at.is_active = true
      AND (
        ram.requires_is_estagiario IS NULL
        OR ram.requires_is_estagiario = v_is_estagiario
      )
    ORDER BY at.sort_order ASC
  LOOP
    -- Verifica se ja existe agente desse template pra esse user
    SELECT a.id INTO v_existing_agent_id
    FROM public.agents a
    WHERE a.owner_user_id = p_user_id
      AND a.source_template_id = v_template.template_id
    LIMIT 1;

    IF v_existing_agent_id IS NOT NULL THEN
      agent_id := v_existing_agent_id;
      template_code := v_template.template_code;
      display_name := v_template.display_name;
      was_created := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Clona como agente pessoal
    INSERT INTO public.agents (
      name, color, role, status,
      department_id, can_orchestrate, max_concurrent_tasks, current_tasks,
      description, is_active, level,
      owner_user_id, source_template_id, is_overridden, is_personal,
      provider, model, temperature, max_tokens, system_prompt
    ) VALUES (
      v_template.display_name,
      v_template.color,
      v_template.agent_role,
      'idle',
      v_default_dept_id,
      v_template.agent_role IN ('ceo', 'director', 'assistant_root'),
      CASE v_template.agent_role
        WHEN 'ceo' THEN 20
        WHEN 'assistant_root' THEN 15
        WHEN 'director' THEN 10
        WHEN 'manager' THEN 8
        ELSE 5
      END,
      0,
      v_template.description,
      true,
      CASE v_template.agent_role
        WHEN 'ceo' THEN 1
        WHEN 'assistant_root' THEN 1
        WHEN 'director' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'specialist' THEN 3
        WHEN 'monitor' THEN 3
        ELSE 4
      END,
      p_user_id,
      v_template.template_id,
      false,
      true,
      v_template.provider::text,
      v_template.model,
      v_template.temperature,
      v_template.max_tokens,
      v_template.system_prompt
    )
    RETURNING id INTO v_new_agent_id;

    agent_id := v_new_agent_id;
    template_code := v_template.template_code;
    display_name := v_template.display_name;
    was_created := true;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_user_agents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_user_agents(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_user_agents(UUID) TO authenticated;

COMMENT ON FUNCTION public.provision_user_agents(UUID) IS
  'Clona agent_templates como agentes pessoais baseado no role_template do perfil + flag is_estagiario. Idempotente. Security: requer p_user_id == auth.uid() ou is_master_admin.';

-- ============================================================================
-- FIX 8 (MEDIUM): find_users_missing_agents — master admin access control
-- ============================================================================
-- This function reads auth.users and all profiles. Restrict to master admins.
-- Changed from LANGUAGE sql to plpgsql to add the access check.

CREATE OR REPLACE FUNCTION public.find_users_missing_agents()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  cargo TEXT,
  cargo_label TEXT,
  is_estagiario BOOLEAN,
  templates_esperados INTEGER,
  agentes_atuais INTEGER,
  faltam INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security: only master admins (or service_role via NULL auth.uid) can list all users
  IF auth.uid() IS NOT NULL AND NOT public.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    u.email::text,
    COALESCE(p.full_name, p.display_name, '—'),
    rt.code,
    rt.display_name,
    COALESCE(p.is_estagiario, false),
    (
      SELECT count(*)::INTEGER
      FROM public.role_agent_matrix ram
      WHERE ram.role_template_id = p.role_template_id
        AND (ram.requires_is_estagiario IS NULL
             OR ram.requires_is_estagiario = COALESCE(p.is_estagiario, false))
    ),
    (
      SELECT count(*)::INTEGER
      FROM public.agents a
      WHERE a.owner_user_id = p.user_id
        AND a.is_personal = true
        AND a.is_active = true
    ),
    (
      SELECT count(*)::INTEGER
      FROM public.role_agent_matrix ram
      WHERE ram.role_template_id = p.role_template_id
        AND (ram.requires_is_estagiario IS NULL
             OR ram.requires_is_estagiario = COALESCE(p.is_estagiario, false))
    ) - (
      SELECT count(*)::INTEGER
      FROM public.agents a
      WHERE a.owner_user_id = p.user_id
        AND a.is_personal = true
        AND a.is_active = true
    )
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE rt.has_login = true
    AND (
      SELECT count(*)
      FROM public.agents a
      WHERE a.owner_user_id = p.user_id AND a.is_personal = true
    ) < (
      SELECT count(*)
      FROM public.role_agent_matrix ram
      WHERE ram.role_template_id = p.role_template_id
        AND (ram.requires_is_estagiario IS NULL
             OR ram.requires_is_estagiario = COALESCE(p.is_estagiario, false))
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_users_missing_agents() TO authenticated, service_role;

-- ============================================================================
-- FIX 9 (MEDIUM): get_eligible_assignees — authorization check
-- ============================================================================
-- Only master admins or users with can_assign permission for this task type
-- should be able to list eligible assignees.

CREATE OR REPLACE FUNCTION public.get_eligible_assignees(p_task_type_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  role_code TEXT,
  role_label TEXT,
  is_estagiario BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Security: only master admins or users with can_assign for this task type
  IF NOT public.is_master_admin(v_caller) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_task_matrix rtm
        ON rtm.role_template_id = p.role_template_id
       AND rtm.task_type_id = p_task_type_id
      WHERE p.user_id = v_caller
        AND rtm.can_assign = true
    ) THEN
      RAISE EXCEPTION 'unauthorized: caller lacks assignment permission for this task type';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(p.full_name, p.display_name, '—') AS full_name,
    rt.code AS role_code,
    rt.display_name AS role_label,
    COALESCE(p.is_estagiario, false) AS is_estagiario
  FROM public.profiles p
  JOIN public.role_templates rt ON rt.id = p.role_template_id
  JOIN public.role_task_matrix rtm ON rtm.role_template_id = rt.id
  WHERE rtm.task_type_id = p_task_type_id
    AND rtm.can_execute = true
    AND rt.has_login = true
  ORDER BY rtm.is_default_assignee DESC, COALESCE(p.full_name, p.display_name) ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_assignees(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_eligible_assignees(UUID) IS
  'Lista usuarios elegiveis para receber uma tarefa do tipo dado. Requer master admin ou can_assign no role_task_matrix.';

COMMIT;
