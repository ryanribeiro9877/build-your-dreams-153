-- Espelho versionado do estado JÁ APLICADO em produção (a Agenda foi criada por
-- outra sessão via MCP apply_migration, sem gerar arquivo no repo). NÃO rodar
-- db push: produção já tem tudo isto. Este arquivo apenas VERSIONA o que existe.
--
-- Por que é load-bearing: sem ele, um replay das migrations 5.1/5.2 (que usam
-- meetings_can_access, incluindo advogado) reverteria em produção a regra 4
-- (criação/edição recepção-only) e a R3 (advogado vê só a própria agenda) —
-- regressão de segurança. Conferido contra prod (pg_get_functiondef) em 2026-07-10.
BEGIN;

-- 1. Gate de ESCRITA recepção-only (prod-only até aqui). Difere de
--    meetings_can_access (que inclui adv_%): advogado NÃO cria/edita reunião.
CREATE OR REPLACE FUNCTION public.meetings_can_create()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_templates rt ON rt.id = p.role_template_id
      WHERE p.user_id = auth.uid()
        AND rt.code IN ('socio','lider_recepcao','recepcionista','estagiaria_recepcao')
    )
    OR public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.meetings_can_create() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meetings_can_create() TO authenticated;

-- 2. create_meeting: gate recepção-only (troca meetings_can_access -> meetings_can_create).
--    Corpo idêntico ao de prod (capacidade/janela/estado inalterados).
CREATE OR REPLACE FUNCTION public.create_meeting(
  p_scheduled_date DATE, p_start_time TIME, p_client_id UUID DEFAULT NULL,
  p_client_name TEXT DEFAULT NULL, p_phone TEXT DEFAULT NULL, p_end_time TIME DEFAULT NULL,
  p_type TEXT DEFAULT NULL, p_lawyer_user_id UUID DEFAULT NULL, p_receptionist_user_id UUID DEFAULT NULL,
  p_summary TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL,
  p_status public.meeting_status DEFAULT 'scheduled')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_id UUID; v_slot int; v_cap int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'create_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_create() THEN RAISE EXCEPTION 'create_meeting: sem permissão (apenas recepção)'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN RAISE EXCEPTION 'create_meeting: data e horário são obrigatórios'; END IF;
  SELECT COALESCE(slot_minutes,15), COALESCE(max_parallel,2) INTO v_slot, v_cap FROM public.business_hours_config WHERE id = true;
  v_slot := COALESCE(v_slot,15); v_cap := COALESCE(v_cap,2);
  IF COALESCE(p_status,'scheduled') IN ('scheduled','confirmed','rescheduled') THEN
    IF NOT public.meeting_slot_is_valid(p_scheduled_date, p_start_time) THEN
      RAISE EXCEPTION 'create_meeting: horário fora do expediente (dia útil/janela/feriado)'; END IF;
    IF (SELECT count(*) FROM public.meetings m WHERE m.scheduled_date = p_scheduled_date AND m.start_time = p_start_time
          AND m.status IN ('scheduled','confirmed','rescheduled')) >= v_cap THEN
      RAISE EXCEPTION 'create_meeting: slot cheio (capacidade % atingida)', v_cap; END IF;
  END IF;
  INSERT INTO public.meetings (client_id, client_name, phone, scheduled_date, start_time, end_time, type,
    lawyer_user_id, receptionist_user_id, summary, status, notes, created_by)
  VALUES (p_client_id, NULLIF(btrim(COALESCE(p_client_name,'')),''), NULLIF(btrim(COALESCE(p_phone,'')),''),
    p_scheduled_date, p_start_time, COALESCE(p_end_time, (p_start_time + (v_slot || ' minutes')::interval)::time),
    NULLIF(btrim(COALESCE(p_type,'')),''), p_lawyer_user_id, p_receptionist_user_id,
    NULLIF(btrim(COALESCE(p_summary,'')),''), COALESCE(p_status,'scheduled'),
    NULLIF(btrim(COALESCE(p_notes,'')),''), v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 3. update_meeting: gate recepção-only. Corpo idêntico ao de prod (máquina de estados inalterada).
CREATE OR REPLACE FUNCTION public.update_meeting(
  p_id UUID, p_scheduled_date DATE, p_start_time TIME, p_end_time TIME, p_type TEXT,
  p_lawyer_user_id UUID, p_receptionist_user_id UUID, p_client_id UUID, p_client_name TEXT,
  p_phone TEXT, p_summary TEXT, p_notes TEXT, p_status public.meeting_status)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_slot int; v_cap int; v_old public.meeting_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'update_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_create() THEN RAISE EXCEPTION 'update_meeting: sem permissão (apenas recepção)'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN RAISE EXCEPTION 'update_meeting: data e horário são obrigatórios'; END IF;
  SELECT status INTO v_old FROM public.meetings WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'update_meeting: reunião não encontrada'; END IF;
  IF p_status IS DISTINCT FROM v_old AND v_old IN ('canceled','no_show','done') THEN
    RAISE EXCEPTION 'update_meeting: "%" é estado final e não pode ser alterado', v_old; END IF;
  SELECT COALESCE(slot_minutes,15), COALESCE(max_parallel,2) INTO v_slot, v_cap FROM public.business_hours_config WHERE id = true;
  v_slot := COALESCE(v_slot,15); v_cap := COALESCE(v_cap,2);
  IF COALESCE(p_status, v_old) IN ('scheduled','confirmed','rescheduled') THEN
    IF NOT public.meeting_slot_is_valid(p_scheduled_date, p_start_time) THEN
      RAISE EXCEPTION 'update_meeting: horário fora do expediente (dia útil/janela/feriado)'; END IF;
    IF (SELECT count(*) FROM public.meetings m WHERE m.scheduled_date = p_scheduled_date AND m.start_time = p_start_time
          AND m.id <> p_id AND m.status IN ('scheduled','confirmed','rescheduled')) >= v_cap THEN
      RAISE EXCEPTION 'update_meeting: slot cheio (capacidade % atingida)', v_cap; END IF;
  END IF;
  UPDATE public.meetings SET
    scheduled_date=p_scheduled_date, start_time=p_start_time,
    end_time=COALESCE(p_end_time, (p_start_time + (v_slot || ' minutes')::interval)::time),
    type=NULLIF(btrim(COALESCE(p_type,'')),''), lawyer_user_id=p_lawyer_user_id,
    receptionist_user_id=p_receptionist_user_id, client_id=p_client_id,
    client_name=NULLIF(btrim(COALESCE(p_client_name,'')),''), phone=NULLIF(btrim(COALESCE(p_phone,'')),''),
    summary=NULLIF(btrim(COALESCE(p_summary,'')),''), notes=NULLIF(btrim(COALESCE(p_notes,'')),''),
    status=COALESCE(p_status, status), updated_at=now()
  WHERE id = p_id;
END; $$;

-- 4. Policy de leitura R3: recepção vê tudo; advogado vê só a própria agenda.
DROP POLICY IF EXISTS "meetings read" ON public.meetings;
CREATE POLICY "meetings read" ON public.meetings FOR SELECT TO authenticated
  USING (public.meetings_can_create() OR (lawyer_user_id = auth.uid()));

COMMIT;
