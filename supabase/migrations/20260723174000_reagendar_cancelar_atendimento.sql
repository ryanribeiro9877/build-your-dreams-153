-- ============================================================================
-- Onda 1.5 — reagendar_atendimento + cancelar_atendimento (reusam update_meeting)
-- ============================================================================
-- update_meeting SUBSTITUI os campos (não faz COALESCE) e exige data/hora +
-- advogado, além de validar expediente/slot/passado e disparar trg_meetings_sync
-- (Google). Estes wrappers leem a reunião e repassam o conjunto completo, mudando
-- só o necessário. Gate = meetings_can_create() herdado de update_meeting
-- (auth.uid() é preservado). REVOKE de PUBLIC/anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reagendar_atendimento(p_id uuid, p_nova_data date, p_nova_hora time without time zone)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare m public.meetings%rowtype;
begin
  select * into m from public.meetings where id = p_id;
  if not found then raise exception 'atendimento não encontrado'; end if;
  -- Reusa update_meeting: valida expediente/slot/passado e sincroniza o Google.
  perform public.update_meeting(
    p_id, p_nova_data, p_nova_hora, NULL, m.type, m.lawyer_user_id, m.receptionist_user_id,
    m.client_id, m.client_name, m.phone, m.summary, m.notes, 'rescheduled'::public.meeting_status);
  return jsonb_build_object('ok', true, 'id', p_id, 'cliente', m.client_name,
    'de', to_char(m.scheduled_date,'DD/MM')||' '||to_char(m.start_time,'HH24:MI'),
    'para', to_char(p_nova_data,'DD/MM')||' '||to_char(p_nova_hora,'HH24:MI'));
end; $function$;

CREATE OR REPLACE FUNCTION public.cancelar_atendimento(p_id uuid, p_motivo text DEFAULT NULL)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare m public.meetings%rowtype; v_notes text;
begin
  select * into m from public.meetings where id = p_id;
  if not found then raise exception 'atendimento não encontrado'; end if;
  v_notes := coalesce(nullif(btrim(m.notes),''),'');
  if p_motivo is not null and btrim(p_motivo) <> '' then
    v_notes := btrim(v_notes || ' | Cancelado: ' || btrim(p_motivo));
  end if;
  -- status 'canceled' pula a validação de expediente em update_meeting (só ativos validam).
  perform public.update_meeting(
    p_id, m.scheduled_date, m.start_time, m.end_time, m.type, m.lawyer_user_id, m.receptionist_user_id,
    m.client_id, m.client_name, m.phone, m.summary, nullif(v_notes,''), 'canceled'::public.meeting_status);
  return jsonb_build_object('ok', true, 'id', p_id, 'cliente', m.client_name,
    'quando', to_char(m.scheduled_date,'DD/MM')||' '||to_char(m.start_time,'HH24:MI'));
end; $function$;

REVOKE EXECUTE ON FUNCTION public.reagendar_atendimento(uuid,date,time without time zone) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reagendar_atendimento(uuid,date,time without time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cancelar_atendimento(uuid,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancelar_atendimento(uuid,text) TO authenticated, service_role;
