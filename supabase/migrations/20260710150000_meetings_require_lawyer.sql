-- Correção 4 (parte de banco) — advogado responsável OBRIGATÓRIO em reuniões ativas.
-- create_meeting/update_meeting passam a RAISE EXCEPTION se p_lawyer_user_id IS NULL
-- quando o status é ativo (scheduled/confirmed/rescheduled). Estados terminais
-- (canceled/no_show/done) NÃO exigem — permite fechar o ciclo de reuniões antigas
-- sem advogado. Autorizado pelo dono (afeta o modal manual da Agenda também).
--
-- IMPORTANTE: corpos FIÉIS à produção (capturados via pg_get_functiondef) — usam
-- `meetings_can_create()` (recepção-only), NÃO `meetings_can_access()` das migrations
-- 5.1/5.2. Este arquivo reconcilia repo↔banco além de adicionar a checagem. Aditivo,
-- idempotente (CREATE OR REPLACE). NÃO usar db push.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_meeting(
  p_scheduled_date       date,
  p_start_time           time without time zone,
  p_client_id            uuid DEFAULT NULL::uuid,
  p_client_name          text DEFAULT NULL::text,
  p_phone                text DEFAULT NULL::text,
  p_end_time             time without time zone DEFAULT NULL::time without time zone,
  p_type                 text DEFAULT NULL::text,
  p_lawyer_user_id       uuid DEFAULT NULL::uuid,
  p_receptionist_user_id uuid DEFAULT NULL::uuid,
  p_summary              text DEFAULT NULL::text,
  p_notes                text DEFAULT NULL::text,
  p_status               meeting_status DEFAULT 'scheduled'::meeting_status
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid(); v_id UUID; v_slot int; v_cap int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'create_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_create() THEN RAISE EXCEPTION 'create_meeting: sem permissão (apenas recepção)'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'create_meeting: data e horário são obrigatórios';
  END IF;
  SELECT COALESCE(slot_minutes,15), COALESCE(max_parallel,2) INTO v_slot, v_cap
    FROM public.business_hours_config WHERE id = true;
  v_slot := COALESCE(v_slot,15); v_cap := COALESCE(v_cap,2);
  IF COALESCE(p_status,'scheduled') IN ('scheduled','confirmed','rescheduled') THEN
    IF p_lawyer_user_id IS NULL THEN
      RAISE EXCEPTION 'create_meeting: advogado responsável é obrigatório';
    END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.update_meeting(
  p_id                   uuid,
  p_scheduled_date       date,
  p_start_time           time without time zone,
  p_end_time             time without time zone,
  p_type                 text,
  p_lawyer_user_id       uuid,
  p_receptionist_user_id uuid,
  p_client_id            uuid,
  p_client_name          text,
  p_phone                text,
  p_summary              text,
  p_notes                text,
  p_status               meeting_status
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid(); v_slot int; v_cap int; v_old public.meeting_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'update_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_create() THEN RAISE EXCEPTION 'update_meeting: sem permissão (apenas recepção)'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'update_meeting: data e horário são obrigatórios';
  END IF;
  SELECT status INTO v_old FROM public.meetings WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'update_meeting: reunião não encontrada'; END IF;
  IF p_status IS DISTINCT FROM v_old AND v_old IN ('canceled','no_show','done') THEN
    RAISE EXCEPTION 'update_meeting: "%" é estado final e não pode ser alterado', v_old;
  END IF;
  SELECT COALESCE(slot_minutes,15), COALESCE(max_parallel,2) INTO v_slot, v_cap
    FROM public.business_hours_config WHERE id = true;
  v_slot := COALESCE(v_slot,15); v_cap := COALESCE(v_cap,2);
  IF COALESCE(p_status, v_old) IN ('scheduled','confirmed','rescheduled') THEN
    IF p_lawyer_user_id IS NULL THEN
      RAISE EXCEPTION 'update_meeting: advogado responsável é obrigatório';
    END IF;
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
$function$;

COMMIT;
