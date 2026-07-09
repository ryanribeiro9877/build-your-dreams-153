-- Trilha B — correções pós-validação:
-- (1) create_meeting_task: assignee cai para o criador quando a reunião não tem advogado
--     (evita violação do CHECK user_tasks_check, que exige exatamente um responsável).
-- (2) meetings entra na publication supabase_realtime + REPLICA IDENTITY FULL
--     (para o hook useMeetingsByDate receber eventos ao vivo, inclusive UPDATE/DELETE filtrados).
-- Aditiva. Não usar db push.

CREATE OR REPLACE FUNCTION public.create_meeting_task(p_meeting_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_type, v_title, v_uid, COALESCE(m.lawyer_user_id, v_uid), m.client_id, v_deadline,
    jsonb_build_object('meeting_id', m.id), NULLIF(btrim(COALESCE(m.summary,'')),'')
  ) RETURNING id INTO v_task;

  RETURN v_task;
END;
$function$;

-- (2) Realtime: adicionar meetings à publication (idempotente) + replica identity full
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meetings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
  END IF;
END$$;

ALTER TABLE public.meetings REPLICA IDENTITY FULL;
