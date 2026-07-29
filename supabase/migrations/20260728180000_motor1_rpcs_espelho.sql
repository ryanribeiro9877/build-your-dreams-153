-- ============================================================================
-- Motor 1 (Cards 3, 4 e 5) — ESPELHO das RPCs
-- ============================================================================
-- ESPELHO de migrações JÁ APLICADAS em produção (28–29/07). NÃO rodar `db push`.
-- As definições abaixo foram extraídas do banco com pg_get_functiondef em 29/07,
-- então batem byte a byte com o que está no ar.
--
-- Escopo: só as FUNÇÕES. O DDL das tabelas (`campanhas`, `campanha_itens`,
-- `ligacoes`, `client_bank_relations`), suas RLS e os índices foram aplicados
-- direto em produção pelo autor do banco e NÃO estão reproduzidos aqui — preferi
-- não inventar DDL que poderia divergir do real (constraints, policies e defaults).
-- Referência do que existe hoje em produção:
--   · campanhas.objetivo CHECK: pedir_documento · pedir_senha_gov ·
--     agendar_atendimento · renovar_procuracao · converter_conta_bronze ·
--     informar_andamento · outro
--   · ligacoes.resultado CHECK: atendeu · nao_atendeu · numero_errado · retornar ·
--     recusou · caixa_postal
--   · client_bank_relations: UNIQUE (client_id, banco, tipo_relacao) — base do upsert
--   · 1.528 relações vivas em 29/07 (1.230 consignado · 208 seguro · 74 benefício · 16 outro)
--
-- Contrato consumido pelo chat-orchestrator (tools/handlers.ts):
--   · o filtro de criar_campanha é repassado a `search_clients`, que IGNORA chave
--     desconhecida em SILÊNCIO — `consignado_com` devolvia a base toda (562) contra
--     214 de `tem_consignado_com`. O edge normaliza os aliases (campanhaFiltro.ts).
--   · objetivo fora do CHECK derruba a criação com 23514; o edge normaliza também.
-- ============================================================================

-- ─── Card 3 ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_relacao_bancaria(p_client_id uuid DEFAULT NULL::uuid, p_banco text DEFAULT NULL::text, p_tipo_relacao text DEFAULT NULL::text, p_reconhece boolean DEFAULT NULL::boolean, p_extrato_em_posse boolean DEFAULT NULL::boolean, p_extrato_ano integer DEFAULT NULL::integer, p_contrato_em_posse boolean DEFAULT NULL::boolean, p_notes text DEFAULT NULL::text, p_banco_beneficio text DEFAULT NULL::text, p_cliente_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid; v_cli uuid; v_n int; v_cands jsonb; v_nome text;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_menu_grant(auth.uid(),'clientes')) THEN
    RAISE EXCEPTION 'sem permissão para dados bancários de cliente' USING errcode='42501';
  END IF;

  v_cli := p_client_id;
  IF v_cli IS NULL AND nullif(btrim(coalesce(p_cliente_nome,'')),'') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    IF v_n = 0 THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_encontrado'); END IF;
    IF v_n > 1 THEN
      SELECT jsonb_agg(x) INTO v_cands FROM (SELECT jsonb_build_object('nome',cd.full_name) x
        FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 5) z;
      RETURN jsonb_build_object('ok',false,'motivo','ambiguo','candidatos',v_cands);
    END IF;
    SELECT cd.id INTO v_cli FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 1;
  END IF;
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_informado'); END IF;
  SELECT cd.full_name INTO v_nome FROM public.clients_decrypted cd WHERE cd.id=v_cli;

  IF p_banco_beneficio IS NOT NULL THEN
    UPDATE public.clients SET banco_beneficio = btrim(p_banco_beneficio) WHERE id = v_cli;
  END IF;
  IF p_banco IS NOT NULL AND p_tipo_relacao IS NOT NULL THEN
    INSERT INTO public.client_bank_relations
      (client_id, banco, tipo_relacao, reconhece, extrato_em_posse, extrato_ano, contrato_em_posse, notes, created_by)
    VALUES (v_cli, upper(btrim(p_banco)), p_tipo_relacao, p_reconhece,
            coalesce(p_extrato_em_posse,false), p_extrato_ano, coalesce(p_contrato_em_posse,false), p_notes, auth.uid())
    ON CONFLICT (client_id, banco, tipo_relacao) DO UPDATE
      SET reconhece = coalesce(excluded.reconhece, public.client_bank_relations.reconhece),
          extrato_em_posse = greatest(public.client_bank_relations.extrato_em_posse, excluded.extrato_em_posse),
          extrato_ano = coalesce(excluded.extrato_ano, public.client_bank_relations.extrato_ano),
          contrato_em_posse = greatest(public.client_bank_relations.contrato_em_posse, excluded.contrato_em_posse),
          notes = coalesce(excluded.notes, public.client_bank_relations.notes),
          updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'relation_id',v_id,'cliente',v_nome);
END; $function$;

-- ─── Card 4 ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.criar_campanha(p_nome text, p_objetivo text, p_filtro jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid; v_n int;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para criar campanha' USING errcode='42501';
  END IF;
  INSERT INTO public.campanhas (nome, objetivo, filtro, created_by)
  VALUES (btrim(p_nome), lower(coalesce(p_objetivo,'outro')), coalesce(p_filtro,'{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.campanha_itens (campanha_id, client_id)
  SELECT v_id, s.id FROM public.search_clients(coalesce(p_filtro,'{}'::jsonb)) s
  ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_n FROM public.campanha_itens WHERE campanha_id=v_id;
  RETURN jsonb_build_object('campanha_id',v_id,'nome',btrim(p_nome),'clientes',v_n);
END; $function$;

CREATE OR REPLACE FUNCTION public.registrar_ligacao(p_resultado text, p_client_id uuid DEFAULT NULL::uuid, p_cliente_nome text DEFAULT NULL::text, p_observacao text DEFAULT NULL::text, p_campanha_id uuid DEFAULT NULL::uuid, p_retornar_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_cli uuid; v_nome text; v_n int; v_res text; v_lig uuid; v_task uuid; v_cands jsonb;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para registrar ligação' USING errcode='42501';
  END IF;
  v_res := lower(btrim(coalesce(p_resultado,'')));
  v_res := CASE WHEN v_res IN ('atendeu','atendida','falou') THEN 'atendeu'
                WHEN v_res IN ('nao_atendeu','não atendeu','nao atendeu','nao atendida') THEN 'nao_atendeu'
                WHEN v_res IN ('numero_errado','número errado','numero errado','nao e o cliente') THEN 'numero_errado'
                WHEN v_res IN ('retornar','ligar depois','pediu retorno') THEN 'retornar'
                WHEN v_res IN ('recusou','nao quer','desistiu') THEN 'recusou'
                WHEN v_res IN ('caixa_postal','caixa postal') THEN 'caixa_postal'
                ELSE NULL END;
  IF v_res IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','resultado_invalido',
      'mensagem','Resultado deve ser: atendeu, nao_atendeu, numero_errado, retornar, recusou ou caixa_postal.');
  END IF;

  v_cli := p_client_id;
  IF v_cli IS NULL AND nullif(btrim(coalesce(p_cliente_nome,'')),'') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    IF v_n = 0 THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_encontrado'); END IF;
    IF v_n > 1 THEN
      SELECT jsonb_agg(x) INTO v_cands FROM (SELECT jsonb_build_object('nome',cd.full_name) x
        FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 5) z;
      RETURN jsonb_build_object('ok',false,'motivo','ambiguo','candidatos',v_cands);
    END IF;
    SELECT cd.id INTO v_cli FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 1;
  END IF;
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_informado'); END IF;
  SELECT cd.full_name INTO v_nome FROM public.clients_decrypted cd WHERE cd.id=v_cli;

  INSERT INTO public.ligacoes (client_id, campanha_id, operador_user_id, resultado, observacao)
  VALUES (v_cli, p_campanha_id, auth.uid(), v_res, nullif(btrim(coalesce(p_observacao,'')),''))
  RETURNING id INTO v_lig;

  UPDATE public.campanha_itens ci
     SET tentativas = ci.tentativas + 1, ultima_tentativa = now(),
         status = CASE WHEN v_res IN ('atendeu','recusou') THEN 'concluido'
                       WHEN v_res = 'numero_errado' THEN 'descartado' ELSE 'em_andamento' END,
         observacao = coalesce(nullif(btrim(coalesce(p_observacao,'')),''), ci.observacao)
   WHERE ci.client_id = v_cli
     AND (p_campanha_id IS NULL OR ci.campanha_id = p_campanha_id)
     AND ci.status IN ('pendente','em_andamento');

  IF v_res = 'retornar' AND p_retornar_em IS NOT NULL THEN
    v_task := public.criar_pendencia('ligacao','Retornar ligação: '||v_nome, v_cli,
      coalesce(p_observacao,'Cliente pediu retorno.'), auth.uid(), p_retornar_em, NULL, 'kanban_pendencias');
  END IF;

  RETURN jsonb_build_object('ok',true,'ligacao_id',v_lig,'cliente',v_nome,'resultado',v_res,
    'follow_up_criado',(v_task IS NOT NULL));
END; $function$;

CREATE OR REPLACE FUNCTION public.kpi_ligacoes(p_de date DEFAULT CURRENT_DATE, p_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_ate date := coalesce(p_ate, p_de); v_por_op jsonb; v_camp jsonb;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
            'operador', t.op, 'total', t.total, 'atendeu', t.atendeu,
            'nao_atendeu', t.nao_atendeu, 'retornar', t.retornar, 'numero_errado', t.numero_errado)
          ORDER BY t.total DESC), '[]'::jsonb)
    INTO v_por_op
  FROM (
    SELECT coalesce(p.display_name, p.full_name, au.email::text) AS op,
           count(*) AS total,
           count(*) FILTER (WHERE l.resultado='atendeu')       AS atendeu,
           count(*) FILTER (WHERE l.resultado='nao_atendeu')   AS nao_atendeu,
           count(*) FILTER (WHERE l.resultado='retornar')      AS retornar,
           count(*) FILTER (WHERE l.resultado='numero_errado') AS numero_errado
      FROM public.ligacoes l
      LEFT JOIN public.profiles p ON p.user_id = l.operador_user_id
      LEFT JOIN auth.users au ON au.id = l.operador_user_id
     WHERE (l.created_at AT TIME ZONE 'America/Bahia')::date BETWEEN p_de AND v_ate
     GROUP BY 1
  ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
            'campanha', c2.nome, 'total', c2.total,
            'pendentes', c2.pendentes, 'concluidos', c2.concluidos) ORDER BY c2.nome), '[]'::jsonb)
    INTO v_camp
  FROM (
    SELECT c.nome,
           count(ci.id) AS total,
           count(*) FILTER (WHERE ci.status='pendente')  AS pendentes,
           count(*) FILTER (WHERE ci.status='concluido') AS concluidos
      FROM public.campanhas c
      LEFT JOIN public.campanha_itens ci ON ci.campanha_id = c.id
     WHERE c.status='ativa'
     GROUP BY c.nome
  ) c2;

  RETURN jsonb_build_object('de',p_de,'ate',v_ate,'por_operador',v_por_op,'campanhas_ativas',v_camp);
END; $function$;

-- ─── Card 5 ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anexar_audio_autorizacao(p_file_path text, p_client_id uuid DEFAULT NULL::uuid, p_cliente_nome text DEFAULT NULL::text, p_transcricao text DEFAULT NULL::text, p_process_id uuid DEFAULT NULL::uuid, p_nome_arquivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_cli uuid; v_nome text; v_n int; v_doc uuid; v_cands jsonb;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para anexar documento de cliente' USING errcode='42501';
  END IF;
  IF coalesce(btrim(p_file_path),'') = '' THEN RAISE EXCEPTION 'file_path é obrigatório (o edge grava o áudio antes)'; END IF;

  v_cli := p_client_id;
  IF v_cli IS NULL AND nullif(btrim(coalesce(p_cliente_nome,'')),'') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    IF v_n = 0 THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_encontrado'); END IF;
    IF v_n > 1 THEN
      SELECT jsonb_agg(x) INTO v_cands FROM (SELECT jsonb_build_object('nome',cd.full_name) x
        FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 5) z;
      RETURN jsonb_build_object('ok',false,'motivo','ambiguo','candidatos',v_cands);
    END IF;
    SELECT cd.id INTO v_cli FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 1;
  END IF;
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_informado'); END IF;
  SELECT cd.full_name INTO v_nome FROM public.clients_decrypted cd WHERE cd.id=v_cli;

  INSERT INTO public.client_documents
    (client_id, document_type, document_name, file_path, mime_type, uploaded_by, status, origem, notes)
  VALUES (v_cli, 'audio_autorizacao',
          coalesce(nullif(btrim(coalesce(p_nome_arquivo,'')),''), 'Áudio de autorização — '||v_nome),
          p_file_path, 'audio/webm', auth.uid(), 'recebido', 'chat',
          nullif(btrim(coalesce(p_transcricao,'')),''))
  RETURNING id INTO v_doc;

  RETURN jsonb_build_object('ok',true,'client_document_id',v_doc,'cliente',v_nome,
    'tem_transcricao',(nullif(btrim(coalesce(p_transcricao,'')),'') IS NOT NULL));
END; $function$;
