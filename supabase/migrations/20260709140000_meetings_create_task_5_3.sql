-- Trilha B 5.3 — create_meeting_task: cria tarefa vinculada à reunião + cliente.
-- SECURITY DEFINER, gate por dentro (recepção/advogado/gestor), R-1.
-- NÃO toca em create_user_task (admin-only permanece intocado).
-- Vínculo tarefa->reunião via payload jsonb (sem alterar o schema de user_tasks).

BEGIN;

CREATE OR REPLACE FUNCTION public.create_meeting_task(p_meeting_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  m      public.meetings;
  v_type uuid;
  v_task uuid;
  v_title text;
  v_deadline timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'create_meeting_task: não autenticado'; END IF;
  IF NOT public.meetings_can_access() THEN RAISE EXCEPTION 'create_meeting_task: sem permissão'; END IF;

  SELECT * INTO m FROM public.meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'create_meeting_task: reunião não encontrada'; END IF;

  -- Evita duplicar tarefa para a mesma reunião.
  SELECT id INTO v_task FROM public.user_tasks
    WHERE payload->>'meeting_id' = p_meeting_id::text LIMIT 1;
  IF v_task IS NOT NULL THEN RETURN v_task; END IF;

  SELECT id INTO v_type FROM public.task_types WHERE code = 'agendar_atendimento';
  IF v_type IS NULL THEN RAISE EXCEPTION 'create_meeting_task: task_type agendar_atendimento inexistente'; END IF;

  v_title := 'Atendimento — ' || COALESCE(NULLIF(btrim(COALESCE(m.client_name,'')),''), 'cliente')
             || ' ' || to_char(m.scheduled_date,'DD/MM') || ' ' || to_char(m.start_time,'HH24:MI');
  v_deadline := (m.scheduled_date::timestamp + m.start_time) AT TIME ZONE 'America/Bahia';

  INSERT INTO public.user_tasks (
    task_type_id, title, assigner_user_id, assignee_user_id, client_id, deadline_at, payload, notes
  ) VALUES (
    v_type, v_title, v_uid, m.lawyer_user_id, m.client_id, v_deadline,
    jsonb_build_object('meeting_id', m.id), NULLIF(btrim(COALESCE(m.summary,'')),'')
  ) RETURNING id INTO v_task;

  RETURN v_task;
END;
$$;
REVOKE ALL ON FUNCTION public.create_meeting_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_meeting_task(uuid) TO authenticated;

COMMIT;
