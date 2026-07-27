-- ============================================================================
-- B3 (E2E 24/07) — anti-duplicata de processo SEM número + rótulo auditável
-- ============================================================================
-- Sintoma: repetir "abre um processo pro cliente X…" criou 2 processos idênticos
-- em silêncio (14:37 e 14:38). O anti-duplicata da Onda 2.1 dependia do NÚMERO do
-- processo — e na abertura normal o número não existe ainda, então não havia
-- checagem nenhuma.
--
-- 1. Guarda por janela quando não há número: mesmo client_id + mesmo tipo_acao_id
--    (inclusive ambos NULL, via `is not distinct from`) + status ativo + criado nos
--    últimos 30 min → NÃO cria; devolve ok:false com o processo existente e oferece
--    atualizar. Tipo diferente segue criando (não é duplicata).
-- 2. Rótulo: '(a distribuir)' repetido não distinguia um processo do outro na
--    lista. Agora: '(a distribuir) — {primeiro nome} — {tipo} — {DD/MM HH:MM}'.
--    Mantém o prefixo '(a distribuir)' para não quebrar filtros existentes.
--
-- Dry-run (ROLLBACK, impersonação da advogada): 1ª chamada cria; 2ª idêntica
-- devolve duplicate=true com mensagem; total = 1 processo; tipo diferente cria.
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
  v_enum  text;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not (public.is_socio_or_advogado() or public.has_role(v_uid,'admin'::public.app_role)) then
    raise exception 'sem permissão para criar processo (advogado, sócio ou admin)' using errcode = '42501';
  end if;

  select full_name into v_cname from public.clients where id = p_client_id;
  if not found then raise exception 'cliente não encontrado'; end if;

  if p_tipo_acao is not null and btrim(p_tipo_acao) <> '' then
    select id, nome into v_tipo, v_tnome from public.tipos_acao
    where coalesce(ativo, true)
      and (public.txt_fold(nome) ilike '%'||public.txt_fold(btrim(p_tipo_acao))||'%'
           or code = lower(btrim(p_tipo_acao)))
    order by sort_order nulls last limit 1;
  end if;

  v_num := nullif(btrim(coalesce(p_numero,'')),'');
  if v_num is not null then
    select id into v_exist from public.processes where process_number = v_num limit 1;
    if found then
      return jsonb_build_object('ok', false, 'duplicate', true, 'existing_id', v_exist,
        'process_number', v_num, 'message', 'Já existe um processo com esse número — abra o existente.');
    end if;
  else
    select id, process_number into v_exist, v_enum
    from public.processes
    where client_id = p_client_id
      and tipo_acao_id is not distinct from v_tipo
      and coalesce(status,'ativo') = 'ativo'
      and created_at > now() - interval '30 minutes'
    order by created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'duplicate', true, 'existing_id', v_exist,
        'process_number', v_enum, 'recent', true,
        'message', 'Já abri um processo assim para '||v_cname||' agora há pouco ('||v_enum||
                   '). Quer atualizar esse processo em vez de criar outro?');
    end if;
    v_num := '(a distribuir) — '||split_part(btrim(v_cname),' ',1)||
             coalesce(' — '||v_tnome,'')||' — '||
             to_char(now() at time zone 'America/Bahia','DD/MM HH24:MI');
  end if;

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
