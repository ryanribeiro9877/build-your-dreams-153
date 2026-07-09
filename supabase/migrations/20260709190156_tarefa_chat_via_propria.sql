-- 4.1: tipo genérico de tarefa via chat + RPC própria (todos menos tech). Aditiva.
-- Aplicada em produção via apply_migration (name: tarefa_chat_via_propria,
-- version 20260709190156). Arquivo espelho para evitar desync repo↔banco.
--
-- Decisão (Ryan, interpretação 1): o 4.1 é criação rápida/pessoal de tarefa pelo
-- chat; todos os papéis MENOS `tech` podem usar. Via PRÓPRIA (igual create_meeting_task
-- do 5.3) — NÃO abre a role_task_matrix (matriz de delegação formal do AssignTask).

-- 1) Tipo genérico (stage 'todas' existe no enum org_stage). Idempotente.
INSERT INTO public.task_types (code, display_name, description, stage, requires_validation, is_active, sort_order)
VALUES ('tarefa_chat', 'Tarefa (via chat)', 'Tarefa pessoal criada por linguagem natural no chat', 'todas', false, true, 10)
ON CONFLICT (code) DO NOTHING;

-- 2) RPC dedicada: autoriza por "autenticado e papel <> tech"; NÃO usa role_task_matrix.
CREATE OR REPLACE FUNCTION public.create_chat_task(
  p_title       text,
  p_description text DEFAULT NULL,
  p_client_id   uuid DEFAULT NULL,
  p_deadline_at timestamptz DEFAULT NULL,
  p_assignee_user_id uuid DEFAULT NULL,     -- default: o próprio criador
  p_priority    task_priority DEFAULT 'medium'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_role_code text;
  v_type_id   uuid;
  v_task_id   uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'create_chat_task: não autenticado'; END IF;

  SELECT rt.code INTO v_role_code
  FROM public.profiles p JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE p.user_id = v_uid;

  IF v_role_code IS NULL THEN
    RAISE EXCEPTION 'create_chat_task: usuário sem cargo';
  END IF;
  IF v_role_code = 'tech' THEN
    RAISE EXCEPTION 'create_chat_task: perfil tech não cria tarefa via chat' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION 'create_chat_task: título obrigatório';
  END IF;

  SELECT id INTO v_type_id FROM public.task_types WHERE code = 'tarefa_chat';
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'create_chat_task: tipo tarefa_chat ausente'; END IF;

  INSERT INTO public.user_tasks (
    task_type_id, title, description, assigner_user_id, assignee_user_id,
    client_id, status, priority, deadline_at, payload
  ) VALUES (
    v_type_id, btrim(p_title), p_description, v_uid, COALESCE(p_assignee_user_id, v_uid),
    p_client_id, 'assigned', p_priority, p_deadline_at,
    jsonb_build_object('source', 'chat')
  ) RETURNING id INTO v_task_id;

  RETURN v_task_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_chat_task(text, text, uuid, timestamptz, uuid, task_priority) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_chat_task(text, text, uuid, timestamptz, uuid, task_priority) TO authenticated;
