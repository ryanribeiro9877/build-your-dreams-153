-- ============================================================================
-- V17 — Atribuição de Tarefas Humano → Humano
-- ============================================================================
-- 1. RPCs pra criar/listar/atualizar user_tasks
-- 2. View task_types_with_eligible_roles (pra UI de atribuição)
-- 3. Função is_role_eligible_for_task (validador usado pelo create_user_task)
-- 4. Realtime ON em user_tasks (já estava no V14)
--
-- NÃO altera schema de user_tasks (V14 já criou a tabela).
-- NÃO toca em agent_tasks (orquestração entre agentes — separado).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper: is_role_eligible_for_task(task_type, role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_role_eligible_for_task(
  p_task_type_id UUID,
  p_role_template_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_task_matrix rtm
    WHERE rtm.task_type_id = p_task_type_id
      AND rtm.role_template_id = p_role_template_id
      AND rtm.can_execute = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_role_eligible_for_task(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. RPC get_eligible_assignees(task_type_id)
-- ----------------------------------------------------------------------------
-- Retorna lista de usuários que podem RECEBER esse tipo de tarefa.
-- Usado pela UI do sócio na hora de atribuir.
CREATE OR REPLACE FUNCTION public.get_eligible_assignees(p_task_type_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  role_code TEXT,
  role_label TEXT,
  is_estagiario BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_assignees(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_eligible_assignees(UUID) IS
  'Lista usuários elegíveis para receber uma tarefa do tipo dado. Ordena: default_assignee primeiro, depois alfabético.';

-- ----------------------------------------------------------------------------
-- 3. RPC create_user_task() — sócio atribui tarefa a funcionário
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_user_task(
  p_task_type_id UUID,
  p_assignee_user_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_process_id UUID DEFAULT NULL,
  p_priority public.task_priority DEFAULT 'medium',
  p_deadline_at TIMESTAMPTZ DEFAULT NULL,
  p_area public.legal_area DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_external_kanban_ref TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigner_id UUID;
  v_assignee_role UUID;
  v_eligible BOOLEAN;
  v_task_default_sla INTEGER;
  v_task_id UUID;
BEGIN
  v_assigner_id := auth.uid();

  IF v_assigner_id IS NULL THEN
    RAISE EXCEPTION 'create_user_task: não autenticado';
  END IF;

  -- Valida que assigner pode atribuir essa tarefa
  -- Por enquanto: master_admin (sócio/diretor) atribui qualquer tipo;
  -- funcionário comum pode reatribuir só dentro do mesmo escopo
  IF NOT public.is_master_admin(v_assigner_id) THEN
    -- Funcionário comum: só pode atribuir tarefas onde o role dele tenha can_assign=true
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_task_matrix rtm
        ON rtm.role_template_id = p.role_template_id
       AND rtm.task_type_id = p_task_type_id
      WHERE p.user_id = v_assigner_id
        AND rtm.can_assign = true
    ) THEN
      RAISE EXCEPTION 'create_user_task: usuário não tem permissão para atribuir essa tarefa';
    END IF;
  END IF;

  -- Valida que assignee tem cargo elegível
  SELECT p.role_template_id INTO v_assignee_role
  FROM public.profiles p
  WHERE p.user_id = p_assignee_user_id;

  IF v_assignee_role IS NULL THEN
    RAISE EXCEPTION 'create_user_task: destinatário sem cargo definido';
  END IF;

  SELECT public.is_role_eligible_for_task(p_task_type_id, v_assignee_role) INTO v_eligible;

  IF NOT v_eligible THEN
    RAISE EXCEPTION 'create_user_task: cargo do destinatário não pode executar essa tarefa';
  END IF;

  -- Aplica deadline default da task_type se não foi passado
  IF p_deadline_at IS NULL THEN
    SELECT default_sla_hours INTO v_task_default_sla
    FROM public.task_types
    WHERE id = p_task_type_id;

    IF v_task_default_sla IS NOT NULL THEN
      p_deadline_at := now() + (v_task_default_sla || ' hours')::INTERVAL;
    END IF;
  END IF;

  -- Cria a tarefa
  INSERT INTO public.user_tasks (
    task_type_id, title, description,
    assigner_user_id, assignee_user_id,
    process_id, client_id, area,
    status, priority, deadline_at, external_kanban_ref, payload
  ) VALUES (
    p_task_type_id, p_title, p_description,
    v_assigner_id, p_assignee_user_id,
    p_process_id, p_client_id, p_area,
    'assigned', p_priority, p_deadline_at, p_external_kanban_ref, p_payload
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_task(
  UUID, UUID, TEXT, TEXT, UUID, UUID, public.task_priority,
  TIMESTAMPTZ, public.legal_area, JSONB, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.create_user_task IS
  'Atribui tarefa de um usuário para outro. Valida que assigner pode atribuir e assignee pode executar (via role_task_matrix). Aplica SLA default da task_type se deadline não for passado.';

-- ----------------------------------------------------------------------------
-- 4. RPC update_user_task_status — funcionário atualiza status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_task_status(
  p_task_id UUID,
  p_new_status public.user_task_status,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.user_task_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_old_status public.user_task_status;
  v_task RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'update_user_task_status: não autenticado';
  END IF;

  SELECT * INTO v_task
  FROM public.user_tasks
  WHERE id = p_task_id;

  IF v_task IS NULL THEN
    RAISE EXCEPTION 'update_user_task_status: tarefa não encontrada';
  END IF;

  -- Só assignee, assigner ou master podem alterar
  IF v_task.assignee_user_id != v_user_id
     AND v_task.assigner_user_id != v_user_id
     AND NOT public.is_master_admin(v_user_id) THEN
    RAISE EXCEPTION 'update_user_task_status: sem permissão';
  END IF;

  v_old_status := v_task.status;

  UPDATE public.user_tasks
  SET
    status = p_new_status,
    notes = COALESCE(p_notes, notes),
    completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE completed_at END,
    cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = p_task_id;

  RETURN p_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_task_status(
  UUID, public.user_task_status, TEXT
) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPC get_my_inbox — lista tarefas atribuídas ao usuário logado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_inbox(
  p_include_completed BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  task_type_code TEXT,
  task_type_label TEXT,
  status public.user_task_status,
  priority public.task_priority,
  deadline_at TIMESTAMPTZ,
  area public.legal_area,
  client_id UUID,
  process_id UUID,
  assigner_user_id UUID,
  assigner_name TEXT,
  external_kanban_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  documentation_completed_at TIMESTAMPTZ,
  is_overdue BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ut.id, ut.title, ut.description,
    tt.code, tt.display_name,
    ut.status, ut.priority,
    ut.deadline_at, ut.area, ut.client_id, ut.process_id,
    ut.assigner_user_id,
    COALESCE(p.full_name, p.display_name, '—') AS assigner_name,
    ut.external_kanban_ref, ut.notes,
    ut.created_at, ut.updated_at, ut.documentation_completed_at,
    (ut.deadline_at IS NOT NULL
      AND ut.deadline_at < now()
      AND ut.status NOT IN ('completed', 'cancelled')) AS is_overdue
  FROM public.user_tasks ut
  JOIN public.task_types tt ON tt.id = ut.task_type_id
  LEFT JOIN public.profiles p ON p.user_id = ut.assigner_user_id
  WHERE ut.assignee_user_id = auth.uid()
    AND (p_include_completed OR ut.status NOT IN ('completed', 'cancelled'))
  ORDER BY
    CASE ut.priority
      WHEN 'critical' THEN 0
      WHEN 'high'     THEN 1
      WHEN 'medium'   THEN 2
      WHEN 'low'      THEN 3
    END,
    ut.deadline_at NULLS LAST,
    ut.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_inbox(BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.get_my_inbox IS
  'Caixa de entrada do usuário logado. Ordena: prioridade > deadline > recência. is_overdue calculado em runtime.';

-- ----------------------------------------------------------------------------
-- 6. RPC get_team_tasks — visão do sócio (todas as tarefas em curso)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_team_tasks(
  p_status public.user_task_status DEFAULT NULL,
  p_assignee_user_id UUID DEFAULT NULL,
  p_include_completed BOOLEAN DEFAULT false,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  task_type_label TEXT,
  status public.user_task_status,
  priority public.task_priority,
  deadline_at TIMESTAMPTZ,
  assignee_user_id UUID,
  assignee_name TEXT,
  assignee_role_label TEXT,
  assigner_user_id UUID,
  assigner_name TEXT,
  area public.legal_area,
  created_at TIMESTAMPTZ,
  is_overdue BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'get_team_tasks: acesso restrito ao master admin';
  END IF;

  RETURN QUERY
  SELECT
    ut.id, ut.title,
    tt.display_name,
    ut.status, ut.priority,
    ut.deadline_at,
    ut.assignee_user_id,
    COALESCE(pa.full_name, pa.display_name, '—') AS assignee_name,
    COALESCE(rta.display_name, '—') AS assignee_role_label,
    ut.assigner_user_id,
    COALESCE(pg.full_name, pg.display_name, '—') AS assigner_name,
    ut.area,
    ut.created_at,
    (ut.deadline_at IS NOT NULL
      AND ut.deadline_at < now()
      AND ut.status NOT IN ('completed', 'cancelled')) AS is_overdue
  FROM public.user_tasks ut
  JOIN public.task_types tt ON tt.id = ut.task_type_id
  LEFT JOIN public.profiles pa ON pa.user_id = ut.assignee_user_id
  LEFT JOIN public.role_templates rta ON rta.id = pa.role_template_id
  LEFT JOIN public.profiles pg ON pg.user_id = ut.assigner_user_id
  WHERE
    (p_status IS NULL OR ut.status = p_status)
    AND (p_assignee_user_id IS NULL OR ut.assignee_user_id = p_assignee_user_id)
    AND (p_include_completed OR ut.status NOT IN ('completed', 'cancelled'))
  ORDER BY
    CASE ut.priority
      WHEN 'critical' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
    END,
    ut.deadline_at NULLS LAST,
    ut.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_tasks(
  public.user_task_status, UUID, BOOLEAN, INTEGER
) TO authenticated;

COMMENT ON FUNCTION public.get_team_tasks IS
  'Visão do sócio: todas as tarefas em curso. Restrito a is_master_admin.';

-- ----------------------------------------------------------------------------
-- 7. RPC get_task_types_by_stage — lista task_types agrupados (UI)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_task_types_by_stage()
RETURNS TABLE (
  id UUID,
  code TEXT,
  display_name TEXT,
  description TEXT,
  stage public.org_stage,
  area public.legal_area,
  default_sla_hours INTEGER,
  eligible_role_codes TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tt.id,
    tt.code,
    tt.display_name,
    tt.description,
    tt.stage,
    tt.area,
    tt.default_sla_hours,
    COALESCE(
      array_agg(DISTINCT rt.code) FILTER (WHERE rt.code IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS eligible_role_codes
  FROM public.task_types tt
  LEFT JOIN public.role_task_matrix rtm ON rtm.task_type_id = tt.id AND rtm.can_execute = true
  LEFT JOIN public.role_templates rt ON rt.id = rtm.role_template_id AND rt.has_login = true
  WHERE tt.is_active = true
  GROUP BY tt.id
  ORDER BY tt.stage, tt.sort_order, tt.display_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_task_types_by_stage() TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. RPC get_inbox_count — número de tarefas abertas (pra badge no header)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_inbox_count()
RETURNS TABLE (
  total INTEGER,
  overdue INTEGER,
  critical INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::INTEGER AS total,
    COUNT(*) FILTER (
      WHERE deadline_at IS NOT NULL
        AND deadline_at < now()
    )::INTEGER AS overdue,
    COUNT(*) FILTER (WHERE priority = 'critical')::INTEGER AS critical
  FROM public.user_tasks
  WHERE assignee_user_id = auth.uid()
    AND status NOT IN ('completed', 'cancelled');
$$;

GRANT EXECUTE ON FUNCTION public.get_inbox_count() TO authenticated;

COMMIT;
