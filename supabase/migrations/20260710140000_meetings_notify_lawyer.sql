-- TRILHA B · Notificações ao advogado: na criação (imediata) + 40 min antes.
-- Aditivo. Reusa enqueue_task_chat_alert, a task 'agendar_atendimento' e o fuso
-- America/Bahia (uma única conversão do instante — NÃO reintroduzir o bug do +3h).
-- Canais: criação -> cartão 'meeting_created' + tarefa no inbox; 40 min antes ->
-- cartão 'meeting_reminder'; reagendou -> zera reminder_sent_at + 'meeting_rescheduled'.
-- Espelho do que foi aplicado em produção via MCP apply_migration (mesmo SQL).

-- ---------------------------------------------------------------------------
-- a) Coluna anti-duplicado do lembrete de 40 min.
-- ---------------------------------------------------------------------------
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- b) Notificação na criação (AFTER INSERT): cria a tarefa se não existir
--    (idempotente por payload.meeting_id, espelhando create_meeting_task) e
--    dispara o cartão 'meeting_created' no chat do advogado.
--    SECURITY DEFINER: roda como owner (não depende de auth.uid()/RLS), igual ao
--    notificador de tarefas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_meeting_notify_on_create()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_task uuid; v_type uuid; v_title text; v_deadline timestamptz;
BEGIN
  IF NEW.lawyer_user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('scheduled','confirmed','rescheduled') THEN RETURN NEW; END IF;

  SELECT id INTO v_task FROM public.user_tasks WHERE payload->>'meeting_id' = NEW.id::text LIMIT 1;
  IF v_task IS NULL THEN
    SELECT id INTO v_type FROM public.task_types WHERE code = 'agendar_atendimento';
    v_title := 'Atendimento — ' || COALESCE(NULLIF(btrim(COALESCE(NEW.client_name,'')),''),'cliente')
               || ' ' || to_char(NEW.scheduled_date,'DD/MM') || ' ' || to_char(NEW.start_time,'HH24:MI');
    v_deadline := (NEW.scheduled_date::timestamp + NEW.start_time) AT TIME ZONE 'America/Bahia';
    INSERT INTO public.user_tasks (task_type_id, title, assigner_user_id, assignee_user_id, client_id, deadline_at, payload, notes)
    VALUES (v_type, v_title, COALESCE(NEW.created_by, NEW.lawyer_user_id), NEW.lawyer_user_id, NEW.client_id, v_deadline,
            jsonb_build_object('meeting_id', NEW.id), NULLIF(btrim(COALESCE(NEW.summary,'')),''))
    RETURNING id INTO v_task;
  END IF;

  PERFORM public.enqueue_task_chat_alert(
    NEW.lawyer_user_id, v_task,
    'Novo atendimento agendado para você: '
      || COALESCE(NULLIF(btrim(COALESCE(NEW.client_name,'')),''),'cliente')
      || ' em ' || to_char(NEW.scheduled_date,'DD/MM') || ' às ' || to_char(NEW.start_time,'HH24:MI') || '.',
    'meeting_created');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_meetings_notify_create ON public.meetings;
CREATE TRIGGER trg_meetings_notify_create AFTER INSERT ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.trg_meeting_notify_on_create();

-- ---------------------------------------------------------------------------
-- c) Lembrete 40 min antes: função + cron (*/5). SEM trava de expediente, de
--    propósito (um atendimento 08:00 deve avisar ~07:20). Marca reminder_sent_at
--    mesmo sem tarefa vinculada (evita re-varrer legados a cada tick).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_reunioes_proximas()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int := 0; v_rec RECORD; v_task uuid;
BEGIN
  FOR v_rec IN
    SELECT m.id, m.lawyer_user_id, m.client_name, m.start_time
    FROM public.meetings m
    WHERE m.lawyer_user_id IS NOT NULL
      AND m.status IN ('scheduled','confirmed','rescheduled')
      AND m.reminder_sent_at IS NULL
      AND (m.scheduled_date::timestamp + m.start_time) AT TIME ZONE 'America/Bahia' >  now()
      AND (m.scheduled_date::timestamp + m.start_time) AT TIME ZONE 'America/Bahia' <= now() + interval '40 minutes'
  LOOP
    SELECT id INTO v_task FROM public.user_tasks WHERE payload->>'meeting_id' = v_rec.id::text LIMIT 1;
    IF v_task IS NOT NULL THEN
      PERFORM public.enqueue_task_chat_alert(
        v_rec.lawyer_user_id, v_task,
        'Lembrete: seu atendimento com '
          || COALESCE(NULLIF(btrim(COALESCE(v_rec.client_name,'')),''),'o cliente')
          || ' começa às ' || to_char(v_rec.start_time,'HH24:MI') || ' (em ~40 min).',
        'meeting_reminder');
    END IF;
    UPDATE public.meetings SET reminder_sent_at = now() WHERE id = v_rec.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- cron idempotente: recria o job pelo nome se já existir.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reunioes_proximas') THEN
    PERFORM cron.unschedule('reunioes_proximas');
  END IF;
END $$;
SELECT cron.schedule('reunioes_proximas', '*/5 * * * *', $$SELECT public.notificar_reunioes_proximas();$$);

-- ---------------------------------------------------------------------------
-- d) Reagendou (mudou data/hora) -> zera o flag (BEFORE UPDATE) e avisa a
--    mudança (AFTER UPDATE). O guard de status evita cartão 'reagendado' quando
--    a linha está sendo cancelada/encerrada com mudança de data.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_meeting_reset_reminder()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.scheduled_date, NEW.start_time) IS DISTINCT FROM (OLD.scheduled_date, OLD.start_time) THEN
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_meetings_reset_reminder ON public.meetings;
CREATE TRIGGER trg_meetings_reset_reminder BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.trg_meeting_reset_reminder();

CREATE OR REPLACE FUNCTION public.trg_meeting_notify_reschedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_task uuid;
BEGIN
  IF NEW.lawyer_user_id IS NULL THEN RETURN NEW; END IF;
  IF (NEW.scheduled_date, NEW.start_time) IS NOT DISTINCT FROM (OLD.scheduled_date, OLD.start_time) THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('scheduled','confirmed','rescheduled') THEN RETURN NEW; END IF;
  SELECT id INTO v_task FROM public.user_tasks WHERE payload->>'meeting_id' = NEW.id::text LIMIT 1;
  IF v_task IS NOT NULL THEN
    PERFORM public.enqueue_task_chat_alert(
      NEW.lawyer_user_id, v_task,
      'Atendimento reagendado para ' || to_char(NEW.scheduled_date,'DD/MM') || ' às ' || to_char(NEW.start_time,'HH24:MI') || '.',
      'meeting_rescheduled');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_meetings_notify_reschedule ON public.meetings;
CREATE TRIGGER trg_meetings_notify_reschedule AFTER UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.trg_meeting_notify_reschedule();

-- ---------------------------------------------------------------------------
-- e) Suprimir o alerta "na hora" para a tarefa da reunião: o advogado recebe
--    exatamente os 2 avisos (criação + 40 min). Reautor da função existente,
--    preservando o corpo e adicionando só o filtro de task_type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_tarefas_no_horario()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count int := 0; v_rec RECORD; v_now_local timestamp;
  v_dow int; v_hm int; v_open int; v_close int;
BEGIN
  v_now_local := (now() AT TIME ZONE 'America/Bahia');
  v_dow := EXTRACT(ISODOW FROM v_now_local);
  v_hm  := EXTRACT(HOUR FROM v_now_local) * 60 + EXTRACT(MINUTE FROM v_now_local);
  SELECT EXTRACT(HOUR FROM open_time)*60+EXTRACT(MINUTE FROM open_time),
         EXTRACT(HOUR FROM close_time)*60+EXTRACT(MINUTE FROM close_time)
    INTO v_open, v_close FROM public.business_hours_config WHERE id = true;

  IF NOT (v_dow BETWEEN 1 AND 5) THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.holidays WHERE day = v_now_local::date) THEN RETURN 0; END IF;
  IF v_hm < v_open OR v_hm >= v_close THEN RETURN 0; END IF;

  FOR v_rec IN
    SELECT t.id, t.assignee_user_id
    FROM public.user_tasks t
    WHERE t.assignee_user_id IS NOT NULL
      AND (t.payload->>'awaiting_role') IS NULL
      AND t.deadline_at IS NOT NULL
      AND t.deadline_at <= now()
      AND t.status NOT IN ('completed','cancelled')
      -- TRILHA B: reuniões têm os 2 avisos próprios (criação + 40 min); não
      -- disparar o "na hora" para a tarefa 'agendar_atendimento'.
      AND t.task_type_id NOT IN (SELECT id FROM public.task_types WHERE code = 'agendar_atendimento')
      AND NOT EXISTS (SELECT 1 FROM public.task_audit_log a
                      WHERE a.user_task_id = t.id AND a.field = 'chat_alert_sent')
  LOOP
    PERFORM public.enqueue_task_chat_alert(
      v_rec.assignee_user_id, v_rec.id,
      'Chegou o horário desta tarefa. O que deseja fazer?', 'task_alert');
    INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
    VALUES (v_rec.id, NULL, 'chat_alert_sent', NULL, now()::text);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- ---------------------------------------------------------------------------
-- Hardening: entrypoint de cron só para cron/service_role (espelha
-- enqueue_task_chat_alert) e funções de trigger fora do alcance de RPC público.
-- Trigger continua disparando (a execução de trigger não depende de EXECUTE).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.notificar_reunioes_proximas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_meeting_notify_on_create() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_meeting_notify_reschedule() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_meeting_reset_reminder() FROM PUBLIC, anon, authenticated;
