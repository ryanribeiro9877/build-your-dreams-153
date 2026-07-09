-- Trilha B 5.2 — Capacidade + horários configuráveis + máquina de estados.
-- Aditivo/idempotente. NÃO usar db push. Reusa business_hours_config/holidays (Trilha A).

BEGIN;

-- 1. Config: capacidade e duração do slot (aditivo na tabela singleton da Trilha A).
ALTER TABLE public.business_hours_config
  ADD COLUMN IF NOT EXISTS max_parallel int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS slot_minutes int NOT NULL DEFAULT 15;

-- 2. get_business_hours passa a expor max_parallel/slot_minutes.
CREATE OR REPLACE FUNCTION public.get_business_hours()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'timezone', c.timezone, 'workdays', to_jsonb(c.workdays),
    'open_time', c.open_time::text, 'close_time', c.close_time::text,
    'windows', c.windows,
    'max_parallel', c.max_parallel, 'slot_minutes', c.slot_minutes,
    'holidays', COALESCE((SELECT jsonb_agg(h.day ORDER BY h.day) FROM public.holidays h), '[]'::jsonb)
  ) FROM public.business_hours_config c WHERE c.id = true;
$$;

-- 3. Helper: slot dentro do expediente (dia útil, não feriado, dentro de uma janela).
CREATE OR REPLACE FUNCTION public.meeting_slot_is_valid(p_date date, p_start time)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c public.business_hours_config; w jsonb; ok boolean := false;
BEGIN
  SELECT * INTO c FROM public.business_hours_config WHERE id = true;
  IF NOT FOUND THEN RETURN true; END IF; -- sem config: não bloqueia
  IF NOT (EXTRACT(ISODOW FROM p_date)::int = ANY (c.workdays)) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.holidays h WHERE h.day = p_date) THEN RETURN false; END IF;
  FOR w IN SELECT * FROM jsonb_array_elements(c.windows) LOOP
    IF p_start >= (w->>0)::time AND p_start < (w->>1)::time THEN ok := true; END IF;
  END LOOP;
  RETURN ok;
END;
$$;
REVOKE ALL ON FUNCTION public.meeting_slot_is_valid(date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meeting_slot_is_valid(date, time) TO authenticated;

-- 4. Slots disponíveis do dia (esconde os cheios). Fonte única p/ o seletor de horário.
CREATE OR REPLACE FUNCTION public.get_available_slots(p_date date)
RETURNS TABLE (slot time)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c public.business_hours_config; w jsonb; v_slot int; v_cap int; t time; wend time;
BEGIN
  IF NOT public.meetings_can_access() THEN RAISE EXCEPTION 'get_available_slots: sem permissão'; END IF;
  SELECT * INTO c FROM public.business_hours_config WHERE id = true;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT (EXTRACT(ISODOW FROM p_date)::int = ANY (c.workdays)) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.holidays h WHERE h.day = p_date) THEN RETURN; END IF;
  v_slot := COALESCE(c.slot_minutes, 15);
  v_cap  := COALESCE(c.max_parallel, 2);
  FOR w IN SELECT * FROM jsonb_array_elements(c.windows) LOOP
    t := (w->>0)::time; wend := (w->>1)::time;
    WHILE t < wend LOOP
      IF (SELECT count(*) FROM public.meetings m
            WHERE m.scheduled_date = p_date AND m.start_time = t
              AND m.status IN ('scheduled','confirmed','rescheduled')) < v_cap THEN
        slot := t; RETURN NEXT;
      END IF;
      t := (t + (v_slot || ' minutes')::interval)::time;
    END LOOP;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.get_available_slots(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_slots(date) TO authenticated;

-- 5. create_meeting: + validação de janela e capacidade (só p/ status ativo); end_time da config.
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
DECLARE v_uid UUID := auth.uid(); v_id UUID; v_slot int; v_cap int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'create_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_access() THEN RAISE EXCEPTION 'create_meeting: sem permissão'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'create_meeting: data e horário são obrigatórios';
  END IF;
  SELECT COALESCE(slot_minutes,15), COALESCE(max_parallel,2) INTO v_slot, v_cap
    FROM public.business_hours_config WHERE id = true;
  v_slot := COALESCE(v_slot,15); v_cap := COALESCE(v_cap,2);
  IF COALESCE(p_status,'scheduled') IN ('scheduled','confirmed','rescheduled') THEN
    IF NOT public.meeting_slot_is_valid(p_scheduled_date, p_start_time) THEN
      RAISE EXCEPTION 'create_meeting: horário fora do expediente (dia útil/janela/feriado)';
    END IF;
    IF (SELECT count(*) FROM public.meetings m
          WHERE m.scheduled_date = p_scheduled_date AND m.start_time = p_start_time
            AND m.status IN ('scheduled','confirmed','rescheduled')) >= v_cap THEN
      RAISE EXCEPTION 'create_meeting: slot cheio (capacidade % atingida)', v_cap;
    END IF;
  END IF;
  INSERT INTO public.meetings (
    client_id, client_name, phone, scheduled_date, start_time, end_time, type,
    lawyer_user_id, receptionist_user_id, summary, status, notes, created_by
  ) VALUES (
    p_client_id, NULLIF(btrim(COALESCE(p_client_name,'')),''), NULLIF(btrim(COALESCE(p_phone,'')),''),
    p_scheduled_date, p_start_time,
    COALESCE(p_end_time, (p_start_time + (v_slot || ' minutes')::interval)::time),
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

-- 6. update_meeting: + máquina de estados (terminais) + janela/capacidade; end_time da config.
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
DECLARE v_uid UUID := auth.uid(); v_slot int; v_cap int; v_old public.meeting_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'update_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_access() THEN RAISE EXCEPTION 'update_meeting: sem permissão'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'update_meeting: data e horário são obrigatórios';
  END IF;
  SELECT status INTO v_old FROM public.meetings WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'update_meeting: reunião não encontrada'; END IF;
  -- Máquina de estados: terminais não podem sair do estado.
  IF p_status IS DISTINCT FROM v_old AND v_old IN ('canceled','no_show','done') THEN
    RAISE EXCEPTION 'update_meeting: "%" é estado final e não pode ser alterado', v_old;
  END IF;
  SELECT COALESCE(slot_minutes,15), COALESCE(max_parallel,2) INTO v_slot, v_cap
    FROM public.business_hours_config WHERE id = true;
  v_slot := COALESCE(v_slot,15); v_cap := COALESCE(v_cap,2);
  IF COALESCE(p_status, v_old) IN ('scheduled','confirmed','rescheduled') THEN
    IF NOT public.meeting_slot_is_valid(p_scheduled_date, p_start_time) THEN
      RAISE EXCEPTION 'update_meeting: horário fora do expediente (dia útil/janela/feriado)';
    END IF;
    IF (SELECT count(*) FROM public.meetings m
          WHERE m.scheduled_date = p_scheduled_date AND m.start_time = p_start_time
            AND m.id <> p_id
            AND m.status IN ('scheduled','confirmed','rescheduled')) >= v_cap THEN
      RAISE EXCEPTION 'update_meeting: slot cheio (capacidade % atingida)', v_cap;
    END IF;
  END IF;
  UPDATE public.meetings SET
    scheduled_date       = p_scheduled_date,
    start_time           = p_start_time,
    end_time             = COALESCE(p_end_time, (p_start_time + (v_slot || ' minutes')::interval)::time),
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
END;
$$;
REVOKE ALL ON FUNCTION public.update_meeting(UUID,DATE,TIME,TIME,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,public.meeting_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_meeting(UUID,DATE,TIME,TIME,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,public.meeting_status) TO authenticated;

COMMIT;
