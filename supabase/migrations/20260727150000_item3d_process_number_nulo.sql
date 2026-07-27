-- ============================================================================
-- Item 3d do reteste 3 (27/07) — rótulo auditável estava no CAMPO ERRADO
-- ============================================================================
-- Achado de modelagem: o rótulo legível vinha sendo gravado em
-- `processes.process_number`:
--   "(a distribuir) — [TESTE] — Refin não autorizado / inexi — 27/07 13:15"
-- Mas process_number é o número do processo NO TRIBUNAL. Enchê-lo com texto
-- descritivo quebraria: busca por número, registrar_protocolo, integração futura
-- com Projudi/PJE e relatórios.
--
-- Correção: sem número real, process_number fica NULL; o rótulo legível é DERIVADO
-- na exibição (cliente + tipo + data) — no banco, pela chave `rotulo` que
-- criar_processo devolve; no front, pelo helper src/lib/processLabel.ts. Nada de
-- rótulo persistido e nenhuma coluna nova.
--
-- Inclui a limpeza dos registros que já nasceram assim.
-- ============================================================================
ALTER TABLE public.processes ALTER COLUMN process_number DROP NOT NULL;

UPDATE public.processes SET process_number = NULL
WHERE process_number LIKE '(a distribuir)%';

CREATE OR REPLACE FUNCTION public.criar_processo(
  p_client_id uuid, p_tipo_acao text DEFAULT NULL, p_numero text DEFAULT NULL,
  p_reu text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cname text; v_tipo uuid; v_tnome text; v_num text; v_desc text;
  v_exist uuid; v_enum text; v_id uuid; v_res jsonb; v_rotulo text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not (public.is_socio_or_advogado() or public.has_role(v_uid,'admin'::public.app_role)) then
    raise exception 'sem permissão para criar processo (advogado, sócio ou admin)' using errcode = '42501';
  end if;
  select full_name into v_cname from public.clients where id = p_client_id;
  if not found then raise exception 'cliente não encontrado'; end if;

  -- TIPO OBRIGATÓRIO (item 8): não resolvido => não cria; devolve a lista.
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
  v_tipo := (v_res->>'id')::uuid; v_tnome := v_res->>'nome';

  v_num := nullif(btrim(coalesce(p_numero,'')),'');
  if v_num is not null then
    select id into v_exist from public.processes where process_number = v_num limit 1;
    if found then
      return jsonb_build_object('ok', false, 'duplicate', true, 'existing_id', v_exist,
        'process_number', v_num, 'message', 'Já existe um processo com esse número — abra o existente.');
    end if;
  else
    -- Defesa em profundidade (o pré-voo barra antes do cartão): corrida/duplo clique.
    select id, coalesce(process_number,'(sem número)') into v_exist, v_enum
    from public.processes
    where client_id = p_client_id and tipo_acao_id is not distinct from v_tipo
      and coalesce(status,'ativo') = 'ativo' and created_at > now() - interval '30 minutes'
    order by created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'duplicate', true, 'existing_id', v_exist,
        'process_number', v_enum, 'recent', true,
        'message', 'Já abri um processo assim para '||v_cname||' agora há pouco. Quer que eu registre um andamento nele em vez de abrir outro?');
    end if;
    -- v_num permanece NULL: sem número do tribunal, não se inventa número.
  end if;

  v_desc := nullif(btrim(concat_ws('. ',
    case when p_reu is not null and btrim(p_reu) <> '' then 'Réu: '||btrim(p_reu) else null end,
    nullif(btrim(p_notes),''))), '');

  insert into public.processes (process_number, client_name, client_id, tipo_acao_id, description, status, user_id)
  values (v_num, v_cname, p_client_id, v_tipo, v_desc, 'ativo', v_uid)
  returning id into v_id;

  -- Rótulo legível DERIVADO (exibição), não persistido.
  v_rotulo := coalesce(v_num, '(a distribuir) — '||split_part(btrim(v_cname),' ',1)||' — '||
              left(v_tnome, 28)||' — '||to_char(now() at time zone 'America/Bahia','DD/MM HH24:MI'));

  return jsonb_build_object('ok', true, 'id', v_id, 'process_number', v_num,
    'rotulo', v_rotulo, 'cliente', v_cname, 'tipo_acao', v_tnome, 'tipo_acao_id', v_tipo);
end; $function$;

REVOKE EXECUTE ON FUNCTION public.criar_processo(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_processo(uuid,text,text,text,text) TO authenticated, service_role;
