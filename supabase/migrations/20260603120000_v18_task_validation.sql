-- ============================================================================
-- V18 — Validação obrigatória de tarefas (fluxo Yasmin → Kailane)
-- ============================================================================
-- Quando uma task_type tem requires_validation=true, ao funcionário marcar
-- como concluída, o status vira "awaiting_validation" em vez de "completed".
-- O validador (definido em validator_role_code) recebe na inbox dele e aprova
-- ou rejeita.
--
-- Schema já existe no V14:
--   task_types.requires_validation BOOLEAN
--   task_types.validator_role_code TEXT
--   user_tasks.validator_user_id UUID
--   user_tasks.validated_at TIMESTAMPTZ
--   user_task_status: 'awaiting_validation' já no enum
--
-- Esta migration adiciona apenas as RPCs e ajustes de fluxo.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Sobrescreve update_user_task_status para respeitar requires_validation
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
  v_task RECORD;
  v_task_type RECORD;
  v_effective_status public.user_task_status;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'update_user_task_status: não autenticado';
  END IF;

  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_task_id;
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'update_user_task_status: tarefa não encontrada';
  END IF;

  -- Só assignee, assigner ou master podem alterar
  IF v_task.assignee_user_id != v_user_id
     AND v_task.assigner_user_id != v_user_id
     AND NOT public.is_master_admin(v_user_id) THEN
    RAISE EXCEPTION 'update_user_task_status: sem permissão';
  END IF;

  -- Carrega config de validação do tipo
  SELECT * INTO v_task_type FROM public.task_types WHERE id = v_task.task_type_id;

  -- V18: Se tipo requer validação E user tá tentando marcar como completed,
  -- desvia pra awaiting_validation (a menos que seja master forçando)
  v_effective_status := p_new_status;
  IF p_new_status = 'completed'
     AND COALESCE(v_task_type.requires_validation, false) = true
     AND v_task.validated_at IS NULL
     AND NOT public.is_master_admin(v_user_id) THEN
    v_effective_status := 'awaiting_validation';
    RAISE NOTICE 'V18: tarefa % redirecionada para awaiting_validation (requer % validar)',
      p_task_id, v_task_type.validator_role_code;
  END IF;

  UPDATE public.user_tasks
  SET
    status = v_effective_status,
    notes = COALESCE(p_notes, notes),
    completed_at = CASE WHEN v_effective_status = 'completed' THEN now() ELSE completed_at END,
    cancelled_at = CASE WHEN v_effective_status = 'cancelled' THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = p_task_id;

  RETURN v_effective_status;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. RPC validate_user_task(task_id, approve, notes)
-- ----------------------------------------------------------------------------
-- Permite ao validador aprovar ou rejeitar uma tarefa awaiting_validation.
-- - approve=true → vira completed
-- - approve=false → vira in_progress (volta pro assignee corrigir)
CREATE OR REPLACE FUNCTION public.validate_user_task(
  p_task_id UUID,
  p_approve BOOLEAN,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.user_task_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_task RECORD;
  v_task_type RECORD;
  v_validator_role_code TEXT;
  v_user_role_code TEXT;
  v_new_status public.user_task_status;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'validate_user_task: não autenticado';
  END IF;

  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_task_id;
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'validate_user_task: tarefa não encontrada';
  END IF;

  IF v_task.status != 'awaiting_validation' THEN
    RAISE EXCEPTION 'validate_user_task: tarefa não está aguardando validação (status atual: %)',
      v_task.status;
  END IF;

  -- Carrega tipo + cargo do validador esperado
  SELECT requires_validation, validator_role_code
  INTO v_task_type
  FROM public.task_types
  WHERE id = v_task.task_type_id;

  v_validator_role_code := v_task_type.validator_role_code;

  IF v_validator_role_code IS NULL THEN
    -- Sem cargo definido → só master pode validar
    IF NOT public.is_master_admin(v_user_id) THEN
      RAISE EXCEPTION 'validate_user_task: sem cargo validador definido — só master pode validar';
    END IF;
  ELSE
    -- Carrega cargo do user logado
    SELECT rt.code INTO v_user_role_code
    FROM public.profiles p
    JOIN public.role_templates rt ON rt.id = p.role_template_id
    WHERE p.user_id = v_user_id;

    IF v_user_role_code != v_validator_role_code AND NOT public.is_master_admin(v_user_id) THEN
      RAISE EXCEPTION 'validate_user_task: apenas % ou master pode validar', v_validator_role_code;
    END IF;
  END IF;

  -- Define novo status
  v_new_status := CASE WHEN p_approve THEN 'completed' ELSE 'in_progress' END;

  UPDATE public.user_tasks
  SET
    status = v_new_status,
    validator_user_id = v_user_id,
    validated_at = CASE WHEN p_approve THEN now() ELSE NULL END,
    notes = COALESCE(
      CASE WHEN p_notes IS NOT NULL THEN
        COALESCE(notes, '') || E'\n[' || (CASE WHEN p_approve THEN 'APROVADA' ELSE 'REJEITADA' END) || '] ' || p_notes
      ELSE NULL END,
      notes
    ),
    completed_at = CASE WHEN p_approve THEN now() ELSE completed_at END,
    updated_at = now()
  WHERE id = p_task_id;

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_user_task(UUID, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.validate_user_task IS
  'Aprova ou rejeita tarefa em awaiting_validation. Apenas cargo definido em task_types.validator_role_code (ou master) pode chamar.';

-- ----------------------------------------------------------------------------
-- 3. RPC get_my_validation_queue() — caixa de validação do líder
-- ----------------------------------------------------------------------------
-- Retorna tarefas awaiting_validation cujo validator_role_code é o cargo do user.
CREATE OR REPLACE FUNCTION public.get_my_validation_queue()
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  task_type_code TEXT,
  task_type_label TEXT,
  priority public.task_priority,
  deadline_at TIMESTAMPTZ,
  area public.legal_area,
  assignee_user_id UUID,
  assignee_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  is_overdue BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role_code TEXT;
  v_is_master BOOLEAN;
BEGIN
  SELECT rt.code INTO v_user_role_code
  FROM public.profiles p
  JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE p.user_id = auth.uid();

  v_is_master := public.is_master_admin(auth.uid());

  RETURN QUERY
  SELECT
    ut.id, ut.title, ut.description,
    tt.code, tt.display_name,
    ut.priority, ut.deadline_at, ut.area,
    ut.assignee_user_id,
    COALESCE(pa.full_name, pa.display_name, '—') AS assignee_name,
    ut.notes,
    ut.created_at, ut.updated_at,
    (ut.deadline_at IS NOT NULL AND ut.deadline_at < now()) AS is_overdue
  FROM public.user_tasks ut
  JOIN public.task_types tt ON tt.id = ut.task_type_id
  LEFT JOIN public.profiles pa ON pa.user_id = ut.assignee_user_id
  WHERE ut.status = 'awaiting_validation'
    AND (
      v_is_master
      OR (tt.validator_role_code IS NOT NULL AND tt.validator_role_code = v_user_role_code)
    )
  ORDER BY
    CASE ut.priority
      WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3
    END,
    ut.deadline_at NULLS LAST,
    ut.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_validation_queue() TO authenticated;

COMMENT ON FUNCTION public.get_my_validation_queue IS
  'Fila de tarefas awaiting_validation que o user pode validar (baseado em task_types.validator_role_code = cargo do user, ou se for master).';

-- ----------------------------------------------------------------------------
-- 4. RPC get_validation_count() — badge no header
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_validation_count()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role_code TEXT;
  v_is_master BOOLEAN;
  v_count INTEGER;
BEGIN
  SELECT rt.code INTO v_user_role_code
  FROM public.profiles p
  JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE p.user_id = auth.uid();

  v_is_master := public.is_master_admin(auth.uid());

  SELECT COUNT(*) INTO v_count
  FROM public.user_tasks ut
  JOIN public.task_types tt ON tt.id = ut.task_type_id
  WHERE ut.status = 'awaiting_validation'
    AND (
      v_is_master
      OR (tt.validator_role_code IS NOT NULL AND tt.validator_role_code = v_user_role_code)
    );

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_validation_count() TO authenticated;

COMMIT;
