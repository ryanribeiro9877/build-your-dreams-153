-- ============================================================================
-- Onda 2.1 — criar_processo (processo novo pelo chat)
-- ============================================================================
-- Não havia criação de processo (nem tela nem RPC): é feature nova. Schema real
-- não tem coluna 'area' (a área vem de tipo_acao_id→tipos_acao) nem 'reu' (vai em
-- description). process_number é NOT NULL → sem número grava placeholder
-- '(a distribuir)'. Anti-duplicata por número quando informado. Gate advogado/
-- sócio/admin (is_socio_or_advogado + admin). SECURITY DEFINER (RLS de processes é
-- owner-only). REVOKE de PUBLIC/anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.criar_processo(
  p_client_id  uuid,
  p_tipo_acao  text DEFAULT NULL,
  p_numero     text DEFAULT NULL,
  p_reu        text DEFAULT NULL,
  p_notes      text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_cname text;
  v_tipo  uuid;
  v_tnome text;
  v_num   text;
  v_desc  text;
  v_exist uuid;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not (public.is_socio_or_advogado() or public.has_role(v_uid,'admin'::public.app_role)) then
    raise exception 'sem permissão para criar processo (advogado, sócio ou admin)' using errcode = '42501';
  end if;

  -- Cliente obrigatório e existente.
  select full_name into v_cname from public.clients where id = p_client_id;
  if not found then raise exception 'cliente não encontrado'; end if;

  -- Resolve o tipo de ação por nome/código (define a área/categoria).
  if p_tipo_acao is not null and btrim(p_tipo_acao) <> '' then
    select id, nome into v_tipo, v_tnome from public.tipos_acao
    where coalesce(ativo, true)
      and (public.txt_fold(nome) ilike '%'||public.txt_fold(btrim(p_tipo_acao))||'%'
           or code = lower(btrim(p_tipo_acao)))
    order by sort_order nulls last limit 1;
  end if;

  -- Número: opcional. Anti-duplicata quando informado.
  v_num := nullif(btrim(coalesce(p_numero,'')),'');
  if v_num is not null then
    select id into v_exist from public.processes where process_number = v_num limit 1;
    if found then
      return jsonb_build_object('ok', false, 'duplicate', true, 'existing_id', v_exist,
        'process_number', v_num, 'message', 'Já existe um processo com esse número — abra o existente.');
    end if;
  else
    v_num := '(a distribuir)';
  end if;

  -- Réu (sem coluna própria) + notas vão em description.
  v_desc := nullif(btrim(concat_ws('. ',
    case when p_reu is not null and btrim(p_reu) <> '' then 'Réu: '||btrim(p_reu) else null end,
    nullif(btrim(p_notes),''))), '');

  insert into public.processes (process_number, client_name, client_id, tipo_acao_id, description, status, user_id)
  values (v_num, v_cname, p_client_id, v_tipo, v_desc, 'ativo', v_uid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'process_number', v_num,
    'cliente', v_cname, 'tipo_acao', v_tnome);
end; $function$;

REVOKE EXECUTE ON FUNCTION public.criar_processo(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_processo(uuid,text,text,text,text) TO authenticated, service_role;
