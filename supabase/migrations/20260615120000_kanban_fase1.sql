-- Kanban da Operação (Fase 1) — Model A (coluna = task_types.stage).
-- Sem novas tabelas/enums. RPCs SECURITY DEFINER (gate na função; RLS já adequada
-- em user_tasks). Idempotente (CREATE OR REPLACE / DROP IF EXISTS).
--
-- Nota: a CHECK constraint user_tasks_check exige assignee interno OU externo (não
-- permite ambos null). Por isso "aguardando responsável" (papel sem usuário) é
-- representado atribuindo o card ao sócio (gestor) como placeholder e marcando
-- payload.awaiting_role; o board exibe "Aguardando responsável: <papel>".

-- Próxima fase no fluxo operacional. Faixas de apoio (gestao, admin_equipe,
-- kanban_pendencias, recepcao_supervisionada, todas) e financeiro (terminal) -> null.
CREATE OR REPLACE FUNCTION public.kanban_next_stage(p_stage org_stage)
RETURNS org_stage LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE p_stage
    WHEN 'recepcao' THEN 'atendimento'
    WHEN 'captacao_cooperativa' THEN 'atendimento'
    WHEN 'atendimento' THEN 'confeccao'
    WHEN 'confeccao' THEN 'revisao'
    WHEN 'revisao' THEN 'protocolo'
    WHEN 'protocolo' THEN 'audiencia'
    WHEN 'audiencia' THEN 'execucao'
    WHEN 'execucao' THEN 'execucao_sindicato'
    WHEN 'execucao_sindicato' THEN 'recursos'
    WHEN 'recursos' THEN 'recursos_criticos'
    WHEN 'recursos_criticos' THEN 'alvara'
    WHEN 'alvara' THEN 'diligencia'
    WHEN 'diligencia' THEN 'acompanhamento'
    WHEN 'acompanhamento' THEN 'financeiro'
    ELSE NULL
  END)::org_stage;
$$;

-- Papel dono de cada fase (mapa canônico do briefing, item 1).
CREATE OR REPLACE FUNCTION public.kanban_stage_owner_role(p_stage org_stage)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_stage
    WHEN 'atendimento' THEN 'adv_confeccao_geral'
    WHEN 'confeccao' THEN 'adv_confeccao_geral'
    WHEN 'revisao' THEN 'socio'
    WHEN 'gestao' THEN 'socio'
    WHEN 'alvara' THEN 'socio'
    WHEN 'recursos_criticos' THEN 'socio'
    WHEN 'execucao' THEN 'socio'
    WHEN 'protocolo' THEN 'adv_protocolo'
    WHEN 'audiencia' THEN 'adv_audiencia_execucao'
    WHEN 'execucao_sindicato' THEN 'adv_audiencia_execucao'
    WHEN 'recursos' THEN 'adv_audiencia_execucao'
    WHEN 'diligencia' THEN 'adv_audiencia_execucao'
    WHEN 'acompanhamento' THEN 'adv_audiencia_execucao'
    WHEN 'recepcao' THEN 'lider_recepcao'
    WHEN 'captacao_cooperativa' THEN 'lider_recepcao'
    WHEN 'kanban_pendencias' THEN 'lider_recepcao'
    WHEN 'admin_equipe' THEN 'lider_recepcao'
    WHEN 'financeiro' THEN 'financeiro'
    ELSE NULL
  END;
$$;

-- Board da operação: cards com a FASE e o papel dono. Gate: master/admin/quem
-- pode atribuir (socio, lider_recepcao). Bypassa RLS por ser SECURITY DEFINER.
DROP FUNCTION IF EXISTS public.get_kanban_board(boolean);
CREATE FUNCTION public.get_kanban_board(p_include_completed boolean DEFAULT false)
RETURNS TABLE(
  id uuid, title text, task_type_id uuid, task_type_code text, task_type_label text,
  stage org_stage, status user_task_status, priority task_priority, area legal_area,
  client_id uuid, process_id uuid,
  assignee_user_id uuid, assignee_name text, assignee_role_label text,
  owner_role_code text, owner_role_label text, awaiting_role_code text,
  assigner_user_id uuid, assigner_name text,
  deadline_at timestamptz, is_overdue boolean, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (
    public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.role_templates rt ON rt.id = p.role_template_id
               WHERE p.user_id = auth.uid() AND rt.can_assign_tasks = true)
  ) THEN
    RAISE EXCEPTION 'get_kanban_board: acesso restrito';
  END IF;
  RETURN QUERY
    SELECT ut.id, ut.title, tt.id, tt.code, tt.display_name,
      tt.stage, ut.status, ut.priority, ut.area,
      ut.client_id, ut.process_id,
      ut.assignee_user_id, COALESCE(pa.full_name, pa.display_name, '—'), COALESCE(rta.display_name, '—'),
      orr.code, orr.display_name, (ut.payload->>'awaiting_role'),
      ut.assigner_user_id, COALESCE(pg.full_name, pg.display_name, '—'),
      ut.deadline_at,
      (ut.deadline_at IS NOT NULL AND ut.deadline_at < now() AND ut.status NOT IN ('completed','cancelled')),
      ut.created_at
    FROM public.user_tasks ut
    JOIN public.task_types tt ON tt.id = ut.task_type_id
    LEFT JOIN public.profiles pa ON pa.user_id = ut.assignee_user_id
    LEFT JOIN public.role_templates rta ON rta.id = pa.role_template_id
    LEFT JOIN public.profiles pg ON pg.user_id = ut.assigner_user_id
    LEFT JOIN public.role_templates orr ON orr.code = public.kanban_stage_owner_role(tt.stage)
    WHERE (p_include_completed OR ut.status NOT IN ('completed','cancelled'))
    ORDER BY tt.stage,
      CASE ut.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
      ut.deadline_at NULLS LAST, ut.created_at DESC;
END; $$;

-- Avançar um card para a próxima fase (atômico): conclui a atual e cria a
-- sucessora no próximo estágio, resolvendo o papel dono -> usuário (ou placeholder
-- do sócio + payload.awaiting_role). Insere direto (create_user_task rejeita
-- assignee null e re-checa permissão). Próxima fase ambígua -> 'choose_task_type:<stage>'.
CREATE OR REPLACE FUNCTION public.advance_user_task(p_task_id uuid, p_next_task_type_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid; v_task record; v_cur_stage org_stage; v_next_stage org_stage;
  v_next_type record; v_owner_role text; v_owner_role_id uuid; v_assignee uuid;
  v_awaiting text; v_new_id uuid; v_n int; v_n_area int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'advance_user_task: não autenticado'; END IF;

  SELECT ut.*, tt.stage AS tt_stage, tt.area AS tt_area INTO v_task
    FROM public.user_tasks ut JOIN public.task_types tt ON tt.id = ut.task_type_id
    WHERE ut.id = p_task_id;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'advance_user_task: tarefa não encontrada'; END IF;

  IF v_task.assignee_user_id IS DISTINCT FROM v_uid
     AND v_task.assigner_user_id IS DISTINCT FROM v_uid
     AND NOT public.is_master_admin(v_uid)
     AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'advance_user_task: sem permissão';
  END IF;

  v_cur_stage := v_task.tt_stage;
  v_next_stage := public.kanban_next_stage(v_cur_stage);
  IF v_next_stage IS NULL THEN
    RAISE EXCEPTION 'advance_user_task: a fase % não possui próxima etapa no fluxo', v_cur_stage;
  END IF;

  IF p_next_task_type_id IS NOT NULL THEN
    SELECT * INTO v_next_type FROM public.task_types WHERE id = p_next_task_type_id AND is_active = true;
    IF v_next_type.id IS NULL THEN RAISE EXCEPTION 'advance_user_task: task_type inválido'; END IF;
    IF v_next_type.stage <> v_next_stage THEN
      RAISE EXCEPTION 'advance_user_task: task_type não pertence à fase %', v_next_stage;
    END IF;
  ELSE
    SELECT count(*) INTO v_n FROM public.task_types WHERE stage = v_next_stage AND is_active = true;
    IF v_n = 0 THEN RAISE EXCEPTION 'advance_user_task: sem task_type ativo na fase %', v_next_stage; END IF;
    IF v_n = 1 THEN
      SELECT * INTO v_next_type FROM public.task_types WHERE stage = v_next_stage AND is_active = true;
    ELSE
      SELECT count(*) INTO v_n_area FROM public.task_types
        WHERE stage = v_next_stage AND is_active = true AND area IS NOT DISTINCT FROM v_task.area;
      IF v_n_area = 1 THEN
        SELECT * INTO v_next_type FROM public.task_types
          WHERE stage = v_next_stage AND is_active = true AND area IS NOT DISTINCT FROM v_task.area;
      ELSE
        RAISE EXCEPTION 'choose_task_type:%', v_next_stage;
      END IF;
    END IF;
  END IF;

  v_owner_role := public.kanban_stage_owner_role(v_next_stage);
  v_assignee := NULL;
  IF v_owner_role IS NOT NULL THEN
    SELECT id INTO v_owner_role_id FROM public.role_templates WHERE code = v_owner_role;
    SELECT p.user_id INTO v_assignee FROM public.profiles p WHERE p.role_template_id = v_owner_role_id LIMIT 1;
  END IF;
  IF v_assignee IS NULL THEN
    v_awaiting := COALESCE(v_owner_role, 'indefinido');
    SELECT p.user_id INTO v_assignee FROM public.profiles p
      JOIN public.role_templates rt ON rt.id = p.role_template_id WHERE rt.code = 'socio' LIMIT 1;
    IF v_assignee IS NULL THEN v_assignee := v_uid; END IF;
  END IF;

  UPDATE public.user_tasks SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_task_id;

  INSERT INTO public.user_tasks (task_type_id, title, description, assigner_user_id, assignee_user_id,
    process_id, client_id, area, status, priority, deadline_at, external_kanban_ref, payload)
  VALUES (v_next_type.id, v_next_type.display_name, v_task.description, v_uid, v_assignee,
    v_task.process_id, v_task.client_id, COALESCE(v_task.area, v_next_type.area),
    'assigned', v_task.priority,
    CASE WHEN v_next_type.default_sla_hours IS NOT NULL THEN now() + (v_next_type.default_sla_hours || ' hours')::interval ELSE NULL END,
    v_task.external_kanban_ref,
    COALESCE(v_task.payload, '{}'::jsonb)
      || jsonb_build_object('advanced_from_task', p_task_id, 'advanced_from_stage', v_cur_stage)
      || CASE WHEN v_awaiting IS NOT NULL THEN jsonb_build_object('awaiting_role', v_awaiting) ELSE '{}'::jsonb END)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('new_task_id', v_new_id, 'next_stage', v_next_stage,
    'assignee_user_id', v_assignee, 'task_type_id', v_next_type.id, 'awaiting_role', v_awaiting);
END; $$;

GRANT EXECUTE ON FUNCTION public.kanban_next_stage(org_stage) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kanban_stage_owner_role(org_stage) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kanban_board(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_user_task(uuid, uuid) TO authenticated;
