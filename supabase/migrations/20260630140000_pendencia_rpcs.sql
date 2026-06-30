-- ORQ-01 + FEAT-02: RPCs de pendência interna sobre user_tasks (estendido em
-- 20260630130000_pendencias_internas.sql) + seed de task_type e allowed_tools.
-- SECURITY DEFINER, idempotente (CREATE OR REPLACE), RBAC validado dentro de cada RPC.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. task_type para pendências (idempotente). stage é NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.task_types (code, display_name, description, stage, sort_order)
VALUES ('pendencia_interna', 'Pendência interna',
        'Pendência operacional interna (recepção/departamentos)',
        'kanban_pendencias', 500)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. criar_pendencia
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.criar_pendencia(
  p_tipo TEXT,
  p_titulo TEXT,
  p_cliente_id UUID DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_responsavel_user_id UUID DEFAULT NULL,
  p_prazo TIMESTAMPTZ DEFAULT NULL,
  p_data_fatal DATE DEFAULT NULL,
  p_departamento public.org_stage DEFAULT 'kanban_pendencias'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_assignee UUID;
  v_type_id UUID;
  v_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'criar_pendencia: não autenticado';
  END IF;

  v_assignee := COALESCE(p_responsavel_user_id, v_caller);

  SELECT id INTO v_type_id FROM public.task_types WHERE code = 'pendencia_interna';
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'criar_pendencia: task_type pendencia_interna ausente';
  END IF;

  INSERT INTO public.user_tasks (
    task_type_id, title, description,
    assigner_user_id, assignee_user_id, client_id,
    priority, status, deadline_at,
    is_pendencia, pendencia_tipo, pendencia_estado, data_fatal,
    origem_user_id, origem_departamento, departamento_atual
  ) VALUES (
    v_type_id, p_titulo, p_descricao,
    v_caller, v_assignee, p_cliente_id,
    'medium', 'assigned', p_prazo,
    true, p_tipo, 'aberta', p_data_fatal,
    v_caller, p_departamento, p_departamento
  ) RETURNING id INTO v_id;

  -- Auditoria (task_audit_log: user_task_id, actor_user_id, field, old_value, new_value).
  INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
  VALUES (v_id, v_caller, 'pendencia_criada', NULL,
          jsonb_build_object('tipo', p_tipo, 'departamento', p_departamento,
                             'assignee', v_assignee, 'data_fatal', p_data_fatal)::text);

  -- Notifica o responsável.
  INSERT INTO public.bottleneck_notifications (user_id, alert_type, severity, department, message, agent_name)
  VALUES (v_assignee, 'pendencia_atribuida', 'info', p_departamento::text,
          'Nova pendência atribuída: ' || p_titulo, 'Sistema - Pendências');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_pendencia(TEXT, TEXT, UUID, TEXT, UUID, TIMESTAMPTZ, DATE, public.org_stage) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- helper interno: caller pode operar a pendência?
-- master/tech OR caller in (assignee, assigner, origem) OR papel de recepção.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pode_operar_pendencia(_user_id UUID, _task public.user_tasks)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    public.is_master_admin(_user_id)
    OR public.has_role(_user_id, 'tech')
    OR _user_id IN (_task.assignee_user_id, _task.assigner_user_id, _task.origem_user_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.role_templates rt ON rt.id = p.role_template_id
      WHERE p.user_id = _user_id
        AND rt.code IN ('recepcionista','lider_recepcao','estagiaria_recepcao','socio')
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. transferir_pendencia
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transferir_pendencia(
  p_id UUID,
  p_departamento_destino public.org_stage DEFAULT NULL,
  p_responsavel_destino UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_task public.user_tasks;
  v_novo_dep public.org_stage;
  v_novo_resp UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'transferir_pendencia: não autenticado';
  END IF;

  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_id;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'transferir_pendencia: pendência não encontrada';
  END IF;
  IF NOT v_task.is_pendencia THEN
    RAISE EXCEPTION 'transferir_pendencia: tarefa não é uma pendência';
  END IF;

  IF NOT public.pode_operar_pendencia(v_caller, v_task) THEN
    RAISE EXCEPTION 'transferir_pendencia: sem permissão';
  END IF;

  v_novo_dep  := COALESCE(p_departamento_destino, v_task.departamento_atual);
  v_novo_resp := COALESCE(p_responsavel_destino, v_task.assignee_user_id);

  UPDATE public.user_tasks
  SET departamento_atual = v_novo_dep,
      assignee_user_id   = v_novo_resp,
      pendencia_estado   = 'em_tratamento',
      updated_at         = now()
  WHERE id = p_id;

  INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
  VALUES (p_id, v_caller, 'pendencia_transferida',
          jsonb_build_object('departamento', v_task.departamento_atual,
                             'assignee', v_task.assignee_user_id)::text,
          jsonb_build_object('departamento', v_novo_dep,
                             'assignee', v_novo_resp)::text);

  IF v_novo_resp IS NOT NULL THEN
    INSERT INTO public.bottleneck_notifications (user_id, alert_type, severity, department, message, agent_name)
    VALUES (v_novo_resp, 'pendencia_atribuida', 'info', v_novo_dep::text,
            'Pendência transferida para você: ' || v_task.title, 'Sistema - Pendências');
  END IF;

  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transferir_pendencia(UUID, public.org_stage, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. resolver_pendencia
-- Resolve e, se o departamento atual difere da origem, devolve ao gerador:
-- estado final 'devolvida', reatribuída a origem_user_id / origem_departamento.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolver_pendencia(
  p_id UUID,
  p_resolucao TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_task public.user_tasks;
  v_devolver BOOLEAN;
  v_estado_final TEXT;
  v_dep_final public.org_stage;
  v_resp_final UUID;
  v_notes TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'resolver_pendencia: não autenticado';
  END IF;

  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_id;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'resolver_pendencia: pendência não encontrada';
  END IF;
  IF NOT v_task.is_pendencia THEN
    RAISE EXCEPTION 'resolver_pendencia: tarefa não é uma pendência';
  END IF;

  IF NOT public.pode_operar_pendencia(v_caller, v_task) THEN
    RAISE EXCEPTION 'resolver_pendencia: sem permissão';
  END IF;

  -- Devolve ao gerador quando há origem definida e ela difere do depto atual.
  v_devolver := v_task.origem_departamento IS NOT NULL
                AND v_task.origem_departamento IS DISTINCT FROM v_task.departamento_atual;

  IF v_devolver THEN
    v_estado_final := 'devolvida';
    v_dep_final    := v_task.origem_departamento;
    v_resp_final   := COALESCE(v_task.origem_user_id, v_task.assignee_user_id);
  ELSE
    v_estado_final := 'resolvida';
    v_dep_final    := v_task.departamento_atual;
    v_resp_final   := v_task.assignee_user_id;
  END IF;

  v_notes := CONCAT_WS(E'\n', v_task.notes,
                       CASE WHEN p_resolucao IS NOT NULL THEN '[Resolução] ' || p_resolucao END);

  UPDATE public.user_tasks
  SET pendencia_estado   = v_estado_final,
      status             = 'completed',
      completed_at       = now(),
      departamento_atual = v_dep_final,
      assignee_user_id   = v_resp_final,
      notes              = NULLIF(v_notes, ''),
      payload            = COALESCE(payload, '{}'::jsonb)
                           || jsonb_build_object('resolucao', p_resolucao,
                                                 'resolvida_por', v_caller,
                                                 'resolvida_em', now()),
      updated_at         = now()
  WHERE id = p_id;

  INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
  VALUES (p_id, v_caller,
          CASE WHEN v_devolver THEN 'pendencia_resolvida_devolvida' ELSE 'pendencia_resolvida' END,
          v_task.pendencia_estado,
          jsonb_build_object('estado', v_estado_final, 'departamento', v_dep_final,
                             'assignee', v_resp_final, 'resolucao', p_resolucao)::text);

  IF v_devolver AND v_task.origem_user_id IS NOT NULL THEN
    INSERT INTO public.bottleneck_notifications (user_id, alert_type, severity, department, message, agent_name)
    VALUES (v_task.origem_user_id, 'pendencia_devolvida', 'info', v_dep_final::text,
            'Pendência resolvida e devolvida: ' || v_task.title, 'Sistema - Pendências');
  END IF;

  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_pendencia(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed allowed_tools: habilita os 4 tools de pendência/agenda nos agentes.
-- (inerte até o edge com loop de ferramentas ser deployado e CHAT_TOOLS_ENABLED on)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.agents SET allowed_tools = (
  SELECT array_agg(DISTINCT t)
  FROM unnest(allowed_tools || ARRAY['criar_pendencia','transferir_pendencia','resolver_pendencia','agendar_reuniao']) t
) WHERE role = 'assistant_root';

UPDATE public.agents SET allowed_tools = (
  SELECT array_agg(DISTINCT t)
  FROM unnest(allowed_tools || ARRAY['criar_pendencia','transferir_pendencia','resolver_pendencia','agendar_reuniao']) t
) WHERE role IN ('specialist','monitor')
  AND (lower(name) LIKE '%recep%' OR lower(name) LIKE '%triagem%' OR lower(name) LIKE '%cadastro%'
       OR lower(name) LIKE '%pend%' OR lower(name) LIKE '%lembrete%');
