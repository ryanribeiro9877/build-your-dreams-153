-- Trilha B 5.1 — RPCs da Agenda. Todas SECURITY DEFINER, gate por dentro, R-1.
BEGIN;

-- CREATE ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_meeting(
  p_scheduled_date       DATE,
  p_start_time           TIME,
  p_client_id            UUID DEFAULT NULL,
  p_client_name          TEXT DEFAULT NULL,
  p_phone                TEXT DEFAULT NULL,
  p_end_time             TIME DEFAULT NULL,
  p_type                 TEXT DEFAULT NULL,
  p_lawyer_user_id       UUID DEFAULT NULL,
  p_receptionist_user_id UUID DEFAULT NULL,
  p_summary              TEXT DEFAULT NULL,
  p_notes                TEXT DEFAULT NULL,
  p_status               public.meeting_status DEFAULT 'scheduled'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'create_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_access() THEN RAISE EXCEPTION 'create_meeting: sem permissão'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'create_meeting: data e horário são obrigatórios';
  END IF;
  INSERT INTO public.meetings (
    client_id, client_name, phone, scheduled_date, start_time, end_time, type,
    lawyer_user_id, receptionist_user_id, summary, status, notes, created_by
  ) VALUES (
    p_client_id, NULLIF(btrim(COALESCE(p_client_name,'')),''), NULLIF(btrim(COALESCE(p_phone,'')),''),
    p_scheduled_date, p_start_time,
    COALESCE(p_end_time, (p_start_time + INTERVAL '15 minutes')::time),
    NULLIF(btrim(COALESCE(p_type,'')),''),
    p_lawyer_user_id, p_receptionist_user_id,
    NULLIF(btrim(COALESCE(p_summary,'')),''), COALESCE(p_status,'scheduled'),
    NULLIF(btrim(COALESCE(p_notes,'')),''), v_uid
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_meeting(DATE,TIME,UUID,TEXT,TEXT,TIME,TEXT,UUID,UUID,TEXT,TEXT,public.meeting_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_meeting(DATE,TIME,UUID,TEXT,TEXT,TIME,TEXT,UUID,UUID,TEXT,TEXT,public.meeting_status) TO authenticated;

-- UPDATE (overwrite dos campos do formulário) ---------------------------------
CREATE OR REPLACE FUNCTION public.update_meeting(
  p_id                   UUID,
  p_scheduled_date       DATE,
  p_start_time           TIME,
  p_end_time             TIME,
  p_type                 TEXT,
  p_lawyer_user_id       UUID,
  p_receptionist_user_id UUID,
  p_client_id            UUID,
  p_client_name          TEXT,
  p_phone                TEXT,
  p_summary              TEXT,
  p_notes                TEXT,
  p_status               public.meeting_status
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'update_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_access() THEN RAISE EXCEPTION 'update_meeting: sem permissão'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'update_meeting: data e horário são obrigatórios';
  END IF;
  UPDATE public.meetings SET
    scheduled_date       = p_scheduled_date,
    start_time           = p_start_time,
    end_time             = COALESCE(p_end_time, (p_start_time + INTERVAL '15 minutes')::time),
    type                 = NULLIF(btrim(COALESCE(p_type,'')),''),
    lawyer_user_id       = p_lawyer_user_id,
    receptionist_user_id = p_receptionist_user_id,
    client_id            = p_client_id,
    client_name          = NULLIF(btrim(COALESCE(p_client_name,'')),''),
    phone                = NULLIF(btrim(COALESCE(p_phone,'')),''),
    summary              = NULLIF(btrim(COALESCE(p_summary,'')),''),
    notes                = NULLIF(btrim(COALESCE(p_notes,'')),''),
    status               = COALESCE(p_status, status),
    updated_at           = now()
  WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'update_meeting: reunião não encontrada'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_meeting(UUID,DATE,TIME,TIME,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,public.meeting_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_meeting(UUID,DATE,TIME,TIME,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,public.meeting_status) TO authenticated;

-- DELETE (hard delete restrito a sócio/admin) --------------------------------
CREATE OR REPLACE FUNCTION public.delete_meeting(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'delete_meeting: não autenticado'; END IF;
  IF NOT (public.is_socio() OR public.kanban_can_admin(v_uid)) THEN
    RAISE EXCEPTION 'delete_meeting: apenas sócio/admin podem excluir';
  END IF;
  DELETE FROM public.meetings WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_meeting(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_meeting(UUID) TO authenticated;

-- GET AUDIT (espelha get_task_audit) -----------------------------------------
CREATE OR REPLACE FUNCTION public.get_meeting_audit(p_meeting_id UUID)
RETURNS TABLE (id UUID, actor_user_id UUID, actor_name TEXT, field TEXT, old_value TEXT, new_value TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'get_meeting_audit: não autenticado'; END IF;
  IF NOT public.meetings_can_access() THEN RAISE EXCEPTION 'get_meeting_audit: sem permissão'; END IF;
  RETURN QUERY
    SELECT a.id, a.actor_user_id, COALESCE(p.full_name, p.display_name, 'Sistema'),
           a.field, a.old_value, a.new_value, a.created_at
    FROM public.meeting_audit_log a
    LEFT JOIN public.profiles p ON p.user_id = a.actor_user_id
    WHERE a.meeting_id = p_meeting_id
    ORDER BY a.created_at DESC
    LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.get_meeting_audit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_meeting_audit(UUID) TO authenticated;

COMMIT;
