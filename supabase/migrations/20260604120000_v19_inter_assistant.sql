-- ============================================================================
-- V19 — Protocolo inter-Assistente
-- ============================================================================
-- Cada usuário tem "Meu Assistente" (role 'assistant_root') que pode pedir
-- informações ao Assistente de outro usuário. Ex:
--   "Meu Assistente da Ana" → pede RG do cliente X →
--   "Meu Assistente da Kailane" → consulta agentes de recepção →
--   responde (tenho/não tenho) → reformula pra Ana
--
-- Schema já existe no V14 (inter_assistant_requests).
-- Esta migration adiciona as RPCs e validação cruzada.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC create_inter_assistant_request
-- ----------------------------------------------------------------------------
-- Cria um pedido entre Assistentes. Valida que ambos têm assistant_root.
CREATE OR REPLACE FUNCTION public.create_inter_assistant_request(
  p_to_user_id UUID,
  p_request_type TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_related_task_id UUID DEFAULT NULL,
  p_expires_in_hours INTEGER DEFAULT 72
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_user_id UUID;
  v_from_agent_id UUID;
  v_to_agent_id UUID;
  v_request_id UUID;
BEGIN
  v_from_user_id := auth.uid();
  IF v_from_user_id IS NULL THEN
    RAISE EXCEPTION 'create_inter_assistant_request: não autenticado';
  END IF;

  IF v_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'create_inter_assistant_request: from_user e to_user iguais';
  END IF;

  -- Acha o agente raiz (assistant_root ou ceo) do remetente
  SELECT id INTO v_from_agent_id
  FROM public.agents
  WHERE owner_user_id = v_from_user_id
    AND role IN ('assistant_root', 'ceo')
    AND is_active = true
  ORDER BY (role = 'ceo') DESC NULLS LAST
  LIMIT 1;

  IF v_from_agent_id IS NULL THEN
    RAISE EXCEPTION 'create_inter_assistant_request: remetente sem Meu Assistente provisionado';
  END IF;

  -- Acha o agente raiz do destinatário
  SELECT id INTO v_to_agent_id
  FROM public.agents
  WHERE owner_user_id = p_to_user_id
    AND role IN ('assistant_root', 'ceo')
    AND is_active = true
  ORDER BY (role = 'ceo') DESC NULLS LAST
  LIMIT 1;

  IF v_to_agent_id IS NULL THEN
    RAISE EXCEPTION 'create_inter_assistant_request: destinatário sem Meu Assistente provisionado';
  END IF;

  INSERT INTO public.inter_assistant_requests (
    from_user_id, to_user_id,
    from_agent_id, to_agent_id,
    request_type, payload,
    related_task_id,
    expires_at,
    status
  ) VALUES (
    v_from_user_id, p_to_user_id,
    v_from_agent_id, v_to_agent_id,
    p_request_type, p_payload,
    p_related_task_id,
    now() + (p_expires_in_hours || ' hours')::INTERVAL,
    'pending'
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inter_assistant_request(
  UUID, TEXT, JSONB, UUID, INTEGER
) TO authenticated;

COMMENT ON FUNCTION public.create_inter_assistant_request IS
  'Cria pedido inter-Assistente do user logado pra outro user. Valida que ambos têm agente raiz (assistant_root ou ceo).';

-- ----------------------------------------------------------------------------
-- 2. RPC answer_inter_assistant_request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.answer_inter_assistant_request(
  p_request_id UUID,
  p_response_payload JSONB,
  p_status public.inter_assistant_status DEFAULT 'answered'
)
RETURNS public.inter_assistant_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_request RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'answer_inter_assistant_request: não autenticado';
  END IF;

  SELECT * INTO v_request FROM public.inter_assistant_requests WHERE id = p_request_id;
  IF v_request IS NULL THEN
    RAISE EXCEPTION 'answer_inter_assistant_request: pedido não encontrado';
  END IF;

  -- Só destinatário (ou master) pode responder
  IF v_request.to_user_id != v_user_id AND NOT public.is_master_admin(v_user_id) THEN
    RAISE EXCEPTION 'answer_inter_assistant_request: apenas o destinatário pode responder';
  END IF;

  IF v_request.status IN ('answered', 'denied', 'expired') THEN
    RAISE EXCEPTION 'answer_inter_assistant_request: pedido já foi finalizado (status: %)', v_request.status;
  END IF;

  IF p_status NOT IN ('answered', 'denied') THEN
    RAISE EXCEPTION 'answer_inter_assistant_request: status final inválido (use answered ou denied)';
  END IF;

  UPDATE public.inter_assistant_requests
  SET
    response_payload = p_response_payload,
    status = p_status,
    answered_at = now(),
    updated_at = now()
  WHERE id = p_request_id;

  RETURN p_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.answer_inter_assistant_request(
  UUID, JSONB, public.inter_assistant_status
) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC get_my_inter_assistant_inbox
-- ----------------------------------------------------------------------------
-- Pedidos RECEBIDOS pelo user (ele é o to_user).
CREATE OR REPLACE FUNCTION public.get_my_inter_assistant_inbox(
  p_include_finalized BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  from_user_id UUID,
  from_user_name TEXT,
  from_user_role_label TEXT,
  request_type TEXT,
  payload JSONB,
  status public.inter_assistant_status,
  related_task_id UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  is_expired BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    iar.id,
    iar.from_user_id,
    COALESCE(p.full_name, p.display_name, '—') AS from_user_name,
    COALESCE(rt.display_name, '—') AS from_user_role_label,
    iar.request_type, iar.payload, iar.status,
    iar.related_task_id, iar.expires_at, iar.created_at,
    (iar.expires_at IS NOT NULL AND iar.expires_at < now()) AS is_expired
  FROM public.inter_assistant_requests iar
  LEFT JOIN public.profiles p ON p.user_id = iar.from_user_id
  LEFT JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE iar.to_user_id = auth.uid()
    AND (p_include_finalized OR iar.status IN ('pending', 'in_progress'))
  ORDER BY
    CASE iar.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
    iar.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_inter_assistant_inbox(BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. RPC get_my_inter_assistant_outbox (pedidos QUE EU FIZ)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_inter_assistant_outbox(
  p_include_finalized BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id UUID,
  to_user_id UUID,
  to_user_name TEXT,
  to_user_role_label TEXT,
  request_type TEXT,
  payload JSONB,
  status public.inter_assistant_status,
  response_payload JSONB,
  related_task_id UUID,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    iar.id,
    iar.to_user_id,
    COALESCE(p.full_name, p.display_name, '—') AS to_user_name,
    COALESCE(rt.display_name, '—') AS to_user_role_label,
    iar.request_type, iar.payload, iar.status,
    iar.response_payload, iar.related_task_id,
    iar.answered_at, iar.created_at
  FROM public.inter_assistant_requests iar
  LEFT JOIN public.profiles p ON p.user_id = iar.to_user_id
  LEFT JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE iar.from_user_id = auth.uid()
    AND (p_include_finalized OR iar.status IN ('pending', 'in_progress'))
  ORDER BY iar.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_inter_assistant_outbox(BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPC get_inter_assistant_inbox_count (badge)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_inter_assistant_inbox_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.inter_assistant_requests
  WHERE to_user_id = auth.uid()
    AND status = 'pending';
$$;

GRANT EXECUTE ON FUNCTION public.get_inter_assistant_inbox_count() TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC list_users_for_inter_assistant
-- ----------------------------------------------------------------------------
-- Lista usuários (exceto o próprio) que têm Meu Assistente provisionado.
-- Usado pela UI pra escolher destinatário.
CREATE OR REPLACE FUNCTION public.list_users_for_inter_assistant()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  role_label TEXT,
  has_assistant BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    COALESCE(p.full_name, p.display_name, '—') AS full_name,
    COALESCE(rt.display_name, '—') AS role_label,
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.owner_user_id = p.user_id
        AND a.role IN ('assistant_root', 'ceo')
        AND a.is_active = true
    ) AS has_assistant
  FROM public.profiles p
  LEFT JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE p.user_id != auth.uid()
    AND rt.has_login = true
  ORDER BY rt.sort_order, p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_users_for_inter_assistant() TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Realtime publication
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.inter_assistant_requests;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

COMMIT;
