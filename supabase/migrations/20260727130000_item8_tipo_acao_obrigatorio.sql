-- ============================================================================
-- Item 8 do adendo (27/07) — processo NUNCA nasce sem tipo_acao_id
-- ============================================================================
-- Evidência: processo criado às 10:57 ficou com tipo_acao_id NULL e rótulo
-- "(a distribuir)", embora a frase dissesse "tipo refinanciamento não autorizado"
-- e o catálogo tenha `refin_nao_autorizado`. O casamento por texto livre falhava
-- em silêncio ("refinanciamento" vs "Refin"). Sem tipo: o gate de documentos-âncora
-- (verificar_ancora_24_1) não funciona, a distribuição por área não sabe o destino,
-- o pré-voo de duplicata perde precisão e a lista fica ilegível.
--
-- Desenho: o LLM escolhe um CODE de uma enumeração FECHADA (o schema da tool é
-- montado em runtime a partir desta tabela — ver withTiposAcaoEnum no edge) e o
-- banco resolve code→id. `resolver_tipo_acao` também tem uma rede de texto, mas
-- CONSERVADORA: casa por prefixo no CODE (curto e específico) e, no nome longo, só
-- com 2+ palavras — com 1 palavra havia falso positivo ("xyz INEXISTENTE" casava
-- "inexistência de relação jurídica"). Não resolvendo, PERGUNTA em vez de chutar.
--
-- Dry-run (ROLLBACK, impersonação): code exato ✓; "refinanciamento não autorizado"
-- → refin_nao_autorizado ✓; "refinanciamento" ✓; "xyz inexistente"/"bla bla" →
-- need_tipo ✓; sem tipo → need_tipo com os 12 tipos ✓; criação grava tipo não-nulo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolver_tipo_acao(p_termo text)
  RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_in text; v_id uuid; v_code text; v_nome text;
begin
  v_in := nullif(btrim(coalesce(p_termo,'')),'');
  if v_in is null then return jsonb_build_object('ok', false, 'need_tipo', true); end if;

  -- 1. CODE exato — caminho normal (enumeração fechada no schema da tool).
  select id, code, nome into v_id, v_code, v_nome from public.tipos_acao
  where coalesce(ativo,true) and lower(code) = lower(v_in) limit 1;

  -- 2. Rede de texto no CODE: prefixo (5) de cada palavra >=7 do termo.
  if v_id is null then
    select t.id, t.code, t.nome into v_id, v_code, v_nome
    from public.tipos_acao t
    cross join lateral (
      select count(*) as score from unnest(string_to_array(public.txt_fold(v_in), ' ')) w
      where length(w) >= 7 and public.txt_fold(t.code) ilike '%'||substring(w from 1 for 5)||'%'
    ) s
    where coalesce(t.ativo,true) and s.score > 0
    order by s.score desc, t.sort_order nulls last limit 1;
  end if;

  -- 3. Rede de texto no NOME: exige >=2 palavras casadas (evita falso positivo).
  if v_id is null then
    select t.id, t.code, t.nome into v_id, v_code, v_nome
    from public.tipos_acao t
    cross join lateral (
      select count(*) as score from unnest(string_to_array(public.txt_fold(v_in), ' ')) w
      where length(w) >= 7 and public.txt_fold(t.nome) ilike '%'||substring(w from 1 for 5)||'%'
    ) s
    where coalesce(t.ativo,true) and s.score >= 2
    order by s.score desc, t.sort_order nulls last limit 1;
  end if;

  if v_id is null then return jsonb_build_object('ok', false, 'need_tipo', true, 'informado', v_in); end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'nome', v_nome);
end; $function$;

REVOKE EXECUTE ON FUNCTION public.resolver_tipo_acao(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolver_tipo_acao(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.criar_processo(
  p_client_id  uuid,
  p_tipo_acao  text DEFAULT NULL,
  p_numero     text DEFAULT NULL,
  p_reu        text DEFAULT NULL,
  p_notes      text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cname text; v_tipo uuid; v_tnome text; v_num text; v_desc text;
  v_exist uuid; v_enum text; v_id uuid; v_res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not (public.is_socio_or_advogado() or public.has_role(v_uid,'admin'::public.app_role)) then
    raise exception 'sem permissão para criar processo (advogado, sócio ou admin)' using errcode = '42501';
  end if;

  select full_name into v_cname from public.clients where id = p_client_id;
  if not found then raise exception 'cliente não encontrado'; end if;

  -- TIPO OBRIGATÓRIO: não resolvido => NÃO cria; devolve a lista para PERGUNTAR.
  v_res := public.resolver_tipo_acao(p_tipo_acao);
  if (v_res->>'ok')::boolean is not true then
    return jsonb_build_object('ok', false, 'need_tipo', true, 'cliente', v_cname,
      'informado', v_res->>'informado',
      'tipos', (select jsonb_agg(jsonb_build_object('code', code, 'nome', nome) order by sort_order nulls last)
                from public.tipos_acao where coalesce(ativo,true)),
      'message', case when v_res->>'informado' is null
        then 'Preciso saber a tese do processo antes de abrir. Qual é?'
        else 'Não reconheci o tipo de ação "'||(v_res->>'informado')||'". Qual é a tese?' end);
  end if;
  v_tipo  := (v_res->>'id')::uuid;
  v_tnome := v_res->>'nome';

  v_num := nullif(btrim(coalesce(p_numero,'')),'');
  if v_num is not null then
    select id into v_exist from public.processes where process_number = v_num limit 1;
    if found then
      return jsonb_build_object('ok', false, 'duplicate', true, 'existing_id', v_exist,
        'process_number', v_num, 'message', 'Já existe um processo com esse número — abra o existente.');
    end if;
  else
    -- Defesa em profundidade (o pré-voo do item 7 barra antes do cartão): corrida /
    -- duplo clique dentro de 30 min.
    select id, process_number into v_exist, v_enum
    from public.processes
    where client_id = p_client_id and tipo_acao_id is not distinct from v_tipo
      and coalesce(status,'ativo') = 'ativo' and created_at > now() - interval '30 minutes'
    order by created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'duplicate', true, 'existing_id', v_exist,
        'process_number', v_enum, 'recent', true,
        'message', 'Já abri um processo assim para '||v_cname||' agora há pouco ('||v_enum||
                   '). Quer atualizar esse processo em vez de criar outro?');
    end if;
    -- Rótulo curto e identificável (o nome do tipo pode ser muito longo).
    v_num := '(a distribuir) — '||split_part(btrim(v_cname),' ',1)||' — '||
             left(v_tnome, 28)||' — '||to_char(now() at time zone 'America/Bahia','DD/MM HH24:MI');
  end if;

  v_desc := nullif(btrim(concat_ws('. ',
    case when p_reu is not null and btrim(p_reu) <> '' then 'Réu: '||btrim(p_reu) else null end,
    nullif(btrim(p_notes),''))), '');

  insert into public.processes (process_number, client_name, client_id, tipo_acao_id, description, status, user_id)
  values (v_num, v_cname, p_client_id, v_tipo, v_desc, 'ativo', v_uid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'process_number', v_num,
    'cliente', v_cname, 'tipo_acao', v_tnome, 'tipo_acao_id', v_tipo);
end; $function$;

REVOKE EXECUTE ON FUNCTION public.criar_processo(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_processo(uuid,text,text,text,text) TO authenticated, service_role;
