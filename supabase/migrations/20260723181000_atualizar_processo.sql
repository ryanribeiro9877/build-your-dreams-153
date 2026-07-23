-- ============================================================================
-- Onda 2.2 — atualizar_processo (andamento/fase pelo chat)
-- ============================================================================
-- Não há tabela de andamentos: o histórico vai em description por APPEND
-- estruturado "[data - autor] texto" (auditoria embutida com quem/quando). Campos
-- diretos por whitelist. Gate: advogado responsável, sócio ou admin. SECURITY
-- DEFINER (RLS owner-only). REVOKE de PUBLIC/anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atualizar_processo(p_process_id uuid, p_fields jsonb)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_before  public.processes%rowtype;
  v_author  text;
  v_desc    text;
  v_changes jsonb := '{}'::jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_before from public.processes where id = p_process_id;
  if not found then raise exception 'processo não encontrado'; end if;
  if not (v_before.responsible_lawyer_user_id = v_uid
          or public.has_role(v_uid,'admin'::public.app_role)
          or exists (select 1 from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
                     where p.user_id = v_uid and rt.code = 'socio')) then
    raise exception 'sem permissão para atualizar este processo (advogado responsável, sócio ou admin)' using errcode = '42501';
  end if;

  -- Andamento: APPEND em description, com data (Bahia) + autor.
  v_desc := v_before.description;
  if (p_fields ? 'andamento') and nullif(btrim(p_fields->>'andamento'),'') is not null then
    select coalesce(nullif(btrim(display_name),''), nullif(btrim(full_name),''), 'usuário') into v_author
      from public.profiles where user_id = v_uid;
    v_desc := btrim(coalesce(v_desc,'') || E'\n' ||
      '[' || to_char(now() at time zone 'America/Bahia','DD/MM/YYYY HH24:MI') || ' - ' || v_author || '] '
      || btrim(p_fields->>'andamento'));
    v_changes := v_changes || jsonb_build_object('andamento', btrim(p_fields->>'andamento'));
  end if;

  update public.processes set
    status                     = case when p_fields ? 'status' then nullif(btrim(p_fields->>'status'),'') else status end,
    description                = v_desc,
    next_hearing_date          = case when p_fields ? 'next_hearing_date' then nullif(p_fields->>'next_hearing_date','')::timestamptz else next_hearing_date end,
    responsible_lawyer_user_id = case when p_fields ? 'responsible_lawyer_user_id' then nullif(p_fields->>'responsible_lawyer_user_id','')::uuid else responsible_lawyer_user_id end,
    tipo_acao_id               = case when p_fields ? 'tipo_acao_id' then nullif(p_fields->>'tipo_acao_id','')::uuid else tipo_acao_id end,
    updated_at                 = now()
  where id = p_process_id;

  if p_fields ? 'status' then v_changes := v_changes || jsonb_build_object('status', p_fields->>'status'); end if;
  if p_fields ? 'next_hearing_date' then v_changes := v_changes || jsonb_build_object('next_hearing_date', p_fields->>'next_hearing_date'); end if;

  return jsonb_build_object('ok', true, 'process_id', p_process_id,
    'process_number', v_before.process_number, 'changes', v_changes);
end; $function$;

REVOKE EXECUTE ON FUNCTION public.atualizar_processo(uuid,jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.atualizar_processo(uuid,jsonb) TO authenticated, service_role;
