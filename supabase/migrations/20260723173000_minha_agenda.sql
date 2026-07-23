-- ============================================================================
-- Onda 1.4 — minha_agenda (consulta): atendimentos + audiências + prazos do dia
-- ============================================================================
-- Escopo estrito em auth.uid() (cada um vê a SUA agenda). p_ate nulo = mesmo dia.
-- Fuso America/Bahia. Consulta (sem ActionCard). REVOKE de PUBLIC/anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.minha_agenda(p_de date DEFAULT current_date, p_ate date DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_ate   date := coalesce(p_ate, p_de);
  v_atend jsonb;
  v_aud   jsonb;
  v_prz   jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Atendimentos (meetings) onde o usuário é advogado, recepcionista ou criador.
  select coalesce(jsonb_agg(jsonb_build_object(
           'data', m.scheduled_date, 'hora', to_char(m.start_time, 'HH24:MI'),
           'cliente', m.client_name, 'tipo', m.type, 'status', m.status
         ) order by m.scheduled_date, m.start_time), '[]'::jsonb)
    into v_atend
  from public.meetings m
  where m.scheduled_date between p_de and v_ate
    and m.status in ('scheduled','confirmed','rescheduled')
    and (m.lawyer_user_id = v_uid or m.receptionist_user_id = v_uid or m.created_by = v_uid);

  -- Audiências dos processos do usuário (ou onde ele é o advogado da audiência).
  select coalesce(jsonb_agg(jsonb_build_object(
           'quando', to_char(a.data_hora at time zone 'America/Bahia', 'DD/MM HH24:MI'),
           'processo', a.process_number, 'tipo', a.tipo_acao, 'local', a.link_local, 'status', a.status
         ) order by a.data_hora), '[]'::jsonb)
    into v_aud
  from public.audiencias a
  where (a.data_hora at time zone 'America/Bahia')::date between p_de and v_ate
    and coalesce(a.status::text,'') not ilike '%cancel%'
    and (a.advogado_user_id = v_uid
         or a.process_id in (select p.id from public.processes p where p.responsible_lawyer_user_id = v_uid));

  -- Prazos (user_tasks) do usuário abertos no intervalo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'prazo', to_char(t.deadline_at at time zone 'America/Bahia', 'DD/MM HH24:MI'),
           'titulo', t.title, 'status', t.status
         ) order by t.deadline_at), '[]'::jsonb)
    into v_prz
  from public.user_tasks t
  where t.assignee_user_id = v_uid
    and t.deadline_at is not null
    and (t.deadline_at at time zone 'America/Bahia')::date between p_de and v_ate
    and t.status not in ('completed','cancelled');

  return jsonb_build_object('de', p_de, 'ate', v_ate,
    'atendimentos', v_atend, 'audiencias', v_aud, 'prazos', v_prz);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.minha_agenda(date,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.minha_agenda(date,date) TO authenticated, service_role;
