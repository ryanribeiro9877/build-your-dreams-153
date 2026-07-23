-- ============================================================================
-- Onda 2.4 — resumo_do_dia (consulta): visão única do dia do usuário
-- ============================================================================
-- Escopo estrito auth.uid(). Agrega: tarefas com prazo hoje, tarefas atrasadas,
-- atendimentos do dia, audiências próximas (7d), pendências abertas, notificações
-- não lidas. Uma chamada. Fuso America/Bahia. REVOKE de PUBLIC/anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resumo_do_dia()
  RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'America/Bahia')::date;
  v_hoje  jsonb; v_atras jsonb; v_atend jsonb; v_aud jsonb; v_pend jsonb; v_notif int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('titulo', t.title,
           'prazo', to_char(t.deadline_at at time zone 'America/Bahia','HH24:MI')) order by t.deadline_at), '[]'::jsonb)
    into v_hoje
  from public.user_tasks t
  where t.assignee_user_id = v_uid and t.status not in ('completed','cancelled')
    and t.deadline_at is not null and (t.deadline_at at time zone 'America/Bahia')::date = v_today;

  select coalesce(jsonb_agg(jsonb_build_object('titulo', t.title,
           'prazo', to_char(t.deadline_at at time zone 'America/Bahia','DD/MM HH24:MI')) order by t.deadline_at), '[]'::jsonb)
    into v_atras
  from public.user_tasks t
  where t.assignee_user_id = v_uid and t.status not in ('completed','cancelled')
    and t.deadline_at is not null and (t.deadline_at at time zone 'America/Bahia')::date < v_today;

  select coalesce(jsonb_agg(jsonb_build_object('hora', to_char(m.start_time,'HH24:MI'),
           'cliente', m.client_name, 'tipo', m.type) order by m.start_time), '[]'::jsonb)
    into v_atend
  from public.meetings m
  where m.scheduled_date = v_today and m.status in ('scheduled','confirmed','rescheduled')
    and (m.lawyer_user_id = v_uid or m.receptionist_user_id = v_uid or m.created_by = v_uid);

  select coalesce(jsonb_agg(jsonb_build_object('quando', to_char(a.data_hora at time zone 'America/Bahia','DD/MM HH24:MI'),
           'processo', a.process_number, 'tipo', a.tipo_acao) order by a.data_hora), '[]'::jsonb)
    into v_aud
  from public.audiencias a
  where (a.data_hora at time zone 'America/Bahia')::date between v_today and v_today + 7
    and coalesce(a.status::text,'') not ilike '%cancel%'
    and (a.advogado_user_id = v_uid or a.process_id in (select id from public.processes where responsible_lawyer_user_id = v_uid));

  select coalesce(jsonb_agg(jsonb_build_object('titulo', t.title) order by t.created_at), '[]'::jsonb)
    into v_pend
  from public.user_tasks t
  where t.assignee_user_id = v_uid and t.is_pendencia and t.status not in ('completed','cancelled');

  select count(*) into v_notif from public.notifications n where n.user_id = v_uid and n.read_at is null;

  return jsonb_build_object('data', v_today,
    'tarefas_hoje', v_hoje, 'tarefas_atrasadas', v_atras, 'atendimentos_hoje', v_atend,
    'audiencias_7d', v_aud, 'pendencias_abertas', v_pend, 'notificacoes_nao_lidas', v_notif);
end; $function$;

REVOKE EXECUTE ON FUNCTION public.resumo_do_dia() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resumo_do_dia() TO authenticated, service_role;
