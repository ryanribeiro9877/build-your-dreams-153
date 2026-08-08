-- Corrige deep-links do sino (public.notifications) que apontavam para rotas
-- inexistentes no App.tsx e caíam em NotFound (*).
--
-- Medido em produção (2026-08-07):
--   8 linhas route='/kanban'  (task_assigned via trg_notify_task_assignment)
--   1 linha  route='/agenda'  (atendimento_incompleto via supervisor_check_atendimentos)
--   0 linhas route='/tarefas' (incluído no backfill por segurança)
-- Rotas reais: /sistema/tarefas (MyInbox), /sistema/agenda (Agenda).
--
-- Idempotente: CREATE OR REPLACE + UPDATE com WHERE nas rotas legadas.

-- 1) Gatilho de atribuição de tarefa: '/kanban' → '/sistema/tarefas'
CREATE OR REPLACE FUNCTION public.trg_notify_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_actor uuid := coalesce(auth.uid(), NEW.assigner_user_id);
  v_actor_nome text;
begin
  if NEW.assignee_user_id is null then return NEW; end if;
  if TG_OP='UPDATE' and NEW.assignee_user_id is not distinct from OLD.assignee_user_id then return NEW; end if;
  if NEW.assignee_user_id = v_actor then return NEW; end if;
  select coalesce(nullif(btrim(pr.full_name),''), pr.display_name, 'alguém')
    into v_actor_nome from public.profiles pr where pr.user_id = v_actor;
  perform public.create_notification(
    NEW.assignee_user_id, 'task_assigned', 'Nova tarefa atribuída',
    coalesce(NEW.title,'Tarefa') || ' — por ' || coalesce(v_actor_nome,'alguém'),
    'user_task', NEW.id, v_actor, '/sistema/tarefas');
  return NEW;
end;
$function$;

-- 2) Cron/supervisor de atendimento sem resumo: '/agenda' → '/sistema/agenda'
CREATE OR REPLACE FUNCTION public.supervisor_check_atendimentos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_count int := 0; r record; v_target uuid;
BEGIN
  FOR r IN
    SELECT m.id, m.client_name, m.scheduled_date, m.receptionist_user_id, m.created_by, m.lawyer_user_id
    FROM public.meetings m
    WHERE m.status = 'done'::public.meeting_status
      AND coalesce(btrim(m.summary),'') = ''
      AND m.updated_at < now() - interval '2 hours'
      AND m.scheduled_date > (now() - interval '30 days')::date
      AND NOT EXISTS (SELECT 1 FROM public.notifications n
                       WHERE n.entity_type='meeting' AND n.entity_id=m.id AND n.type='atendimento_incompleto')
  LOOP
    v_target := coalesce(r.receptionist_user_id, r.created_by, r.lawyer_user_id);
    IF v_target IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id, route)
    VALUES (v_target, 'atendimento_incompleto', 'Atendimento sem registro',
      'O atendimento de '||coalesce(r.client_name,'(cliente)')||' em '||to_char(r.scheduled_date,'DD/MM/YYYY')||
      ' foi concluído sem resumo. Registre o resultado.', 'meeting', r.id, '/sistema/agenda');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- 3) Backfill: só rotas legadas conhecidas. Não toca read_at/created_at nem rotas válidas.
UPDATE public.notifications
SET route = CASE route
  WHEN '/kanban' THEN '/sistema/tarefas'
  WHEN '/tarefas' THEN '/sistema/tarefas'
  WHEN '/agenda' THEN '/sistema/agenda'
  ELSE route
END
WHERE route IN ('/kanban', '/tarefas', '/agenda');
