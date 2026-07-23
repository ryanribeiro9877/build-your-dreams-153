-- ============================================================================
-- Onda 1.6 — criar_audiencia + consultar_audiencias
-- ============================================================================
-- Gate criar: advogado responsável pelo processo, sócio (role_template) ou admin.
-- (app_role NÃO tem 'socio'; sócio é role_templates.code='socio'.) Herda cliente e
-- número do processo. data_hora no fuso America/Bahia; futura. INSERT dispara
-- trg_audiencias_sync (Google). Consulta escopo por papel. REVOKE de PUBLIC/anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.criar_audiencia(
  p_process_id uuid, p_data date, p_hora time without time zone,
  p_tipo text, p_local text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_client uuid; v_pnum text; v_resp uuid;
  v_cname  text; v_aname text; v_dt timestamptz; v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select client_id, process_number, responsible_lawyer_user_id
    into v_client, v_pnum, v_resp
    from public.processes where id = p_process_id;
  if not found then raise exception 'processo não encontrado'; end if;
  if not (v_resp = v_uid
          or public.has_role(v_uid,'admin'::public.app_role)
          or exists (select 1 from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
                     where p.user_id = v_uid and rt.code = 'socio')) then
    raise exception 'sem permissão para criar audiência neste processo' using errcode = '42501';
  end if;
  v_dt := (p_data::text || ' ' || p_hora::text)::timestamp at time zone 'America/Bahia';
  if v_dt < now() then
    raise exception 'a audiência não pode ser marcada no passado (% BRT).', to_char(v_dt at time zone 'America/Bahia','DD/MM/YYYY HH24:MI');
  end if;
  select full_name into v_cname from public.clients where id = v_client;
  select coalesce(nullif(btrim(display_name),''), nullif(btrim(full_name),'')) into v_aname
    from public.profiles where user_id = v_resp;

  insert into public.audiencias (client_id, client_name, process_id, process_number, tipo_acao,
    data_hora, link_local, advogado_user_id, advogado_nome, status, observacoes, docs, origem)
  values (v_client, v_cname, p_process_id, v_pnum, p_tipo, v_dt, p_local, v_resp, v_aname,
    'marcada'::public.audiencia_status, p_notes, '[]'::jsonb, 'chat')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'processo', v_pnum,
    'quando', to_char(v_dt at time zone 'America/Bahia','DD/MM/YYYY HH24:MI'));
end; $function$;

CREATE OR REPLACE FUNCTION public.consultar_audiencias(
  p_de date, p_ate date, p_processo uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_all boolean; v_res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Sócio/admin/recepção veem todas; advogado vê as suas (por processo ou audiência).
  v_all := public.has_role(v_uid,'admin'::public.app_role) or public.is_recepcao_or_socio();
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'quando', to_char(a.data_hora at time zone 'America/Bahia','DD/MM HH24:MI'),
           'processo', a.process_number, 'cliente', a.client_name, 'tipo', a.tipo_acao,
           'local', a.link_local, 'advogado', a.advogado_nome, 'status', a.status
         ) order by a.data_hora), '[]'::jsonb) into v_res
  from public.audiencias a
  where (a.data_hora at time zone 'America/Bahia')::date between p_de and p_ate
    and (p_processo is null or a.process_id = p_processo)
    and (v_all or a.advogado_user_id = v_uid
         or a.process_id in (select id from public.processes where responsible_lawyer_user_id = v_uid));
  return v_res;
end; $function$;

REVOKE EXECUTE ON FUNCTION public.criar_audiencia(uuid,date,time without time zone,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_audiencia(uuid,date,time without time zone,text,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.consultar_audiencias(date,date,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.consultar_audiencias(date,date,uuid) TO authenticated, service_role;
