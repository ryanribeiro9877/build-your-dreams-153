-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730123348), então bate byte a byte com o que está no ar.
--
-- REESCREVE public.registrar_procuracao, criada em 20260730123129
-- (card15_procuracao_vigencia_e_campanha_recorrente). ESTA é a versão VIVA da
-- função: nenhuma migração de version MAIOR a toca.
-- ============================================================================
-- FIX Nº2 (pego na prova, 30/07) — mais grave que o primeiro porque é o CAMINHO NORMAL.
-- registrar_procuracao buscava a procuração anterior por status='vigente'. Só que a sequência
-- real é: procuração vence → cron processar_procuracoes_vencendo marca 'vencida' → SÓ DEPOIS
-- o cliente vem assinar a nova. Com o filtro em 'vigente', a renovação não achava a antiga:
--   • não marcava 'renovada' nem gravava substituida_por_id (linhagem perdida)
--   • não fechava a pendência de renovação (ficava aberta para sempre)
--   • a vencida seguia aparecendo na consulta de janela (dado sujo eterno)
-- Medido: renovou_anterior=false, pendências abertas=1/fechadas=0, e a vencida ainda listada.
-- O índice único (só sobre 'vigente') não denunciava nada — as duas linhas coexistiam legalmente.
-- Correção: a "anterior" é a última NÃO SUBSTITUÍDA, vigente ou vencida.
CREATE OR REPLACE FUNCTION public.registrar_procuracao(
  p_data_assinatura date, p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL,
  p_tipo text DEFAULT 'ad_judicia', p_validade_meses int DEFAULT 12,
  p_client_document_id uuid DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_nome text; v_n int; v_cands jsonb; v_tipo text; v_meses int;
        v_ate date; v_id uuid; v_antiga uuid; v_antiga_status text; v_task uuid; v_fechou boolean := false;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para registrar procuração' USING errcode='42501';
  END IF;
  IF p_data_assinatura IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','data_assinatura_obrigatoria',
      'mensagem','A data de ASSINATURA é o que define a vigência — não use a data do upload.');
  END IF;
  IF p_data_assinatura > current_date THEN
    RETURN jsonb_build_object('ok',false,'motivo','data_futura',
      'mensagem','Data de assinatura no futuro. Conferir.');
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

  v_tipo := lower(btrim(coalesce(p_tipo,'ad_judicia')));
  v_tipo := CASE WHEN v_tipo IN ('ad_judicia','ad judicia','judicial') THEN 'ad_judicia'
                 WHEN v_tipo IN ('ad_judicia_et_extra','ad judicia et extra','judicial e extrajudicial') THEN 'ad_judicia_et_extra'
                 WHEN v_tipo IN ('especifica','específica','especial') THEN 'especifica'
                 ELSE 'outro' END;
  v_meses := coalesce(p_validade_meses, 12);
  IF v_meses < 1 OR v_meses > 120 THEN v_meses := 12; END IF;
  v_ate := (p_data_assinatura + make_interval(months => v_meses))::date;

  -- a "anterior" é a última NÃO SUBSTITUÍDA — vigente OU vencida (a vencida é o caso comum)
  SELECT p.id, p.status, p.pendencia_task_id INTO v_antiga, v_antiga_status, v_task
    FROM public.procuracoes p
   WHERE p.client_id = v_cli AND p.substituida_por_id IS NULL
     AND p.status IN ('vigente','vencida')
   ORDER BY p.validade_ate DESC LIMIT 1;

  IF v_antiga IS NOT NULL THEN
    UPDATE public.procuracoes SET status='renovada', updated_at=now() WHERE id=v_antiga;
    IF v_task IS NOT NULL THEN
      UPDATE public.user_tasks t SET completed_at=now(), updated_at=now()
       WHERE t.id = v_task AND t.completed_at IS NULL AND t.cancelled_at IS NULL;
      v_fechou := FOUND;
    END IF;
    -- rede de segurança: pendência de renovação aberta deste cliente sem vínculo guardado
    IF NOT v_fechou THEN
      UPDATE public.user_tasks t SET completed_at=now(), updated_at=now()
       WHERE t.is_pendencia AND t.pendencia_tipo='renovacao_procuracao'
         AND t.client_id = v_cli AND t.completed_at IS NULL AND t.cancelled_at IS NULL;
      v_fechou := FOUND;
    END IF;
  END IF;

  INSERT INTO public.procuracoes
    (client_id, client_document_id, tipo, data_assinatura, validade_meses, validade_ate, notes, created_by)
  VALUES (v_cli, p_client_document_id, v_tipo, p_data_assinatura, v_meses, v_ate,
          nullif(btrim(coalesce(p_observacao,'')),''), auth.uid())
  RETURNING id INTO v_id;

  IF v_antiga IS NOT NULL THEN
    UPDATE public.procuracoes SET substituida_por_id = v_id WHERE id = v_antiga;
  END IF;

  RETURN jsonb_build_object('ok',true,'procuracao_id',v_id,'cliente',v_nome,'tipo',v_tipo,
    'data_assinatura',p_data_assinatura,'validade_ate',v_ate,
    'renovou_anterior',(v_antiga IS NOT NULL),
    'status_da_anterior',v_antiga_status,
    'pendencia_renovacao_fechada',v_fechou,
    'ja_vencida',(v_ate < current_date),
    'aviso', CASE WHEN v_ate < current_date
                  THEN 'Esta procuração JÁ ESTÁ VENCIDA em '||v_ate||' — precisa de renovação imediata.'
                  WHEN v_ate <= current_date + 30
                  THEN 'Vence em menos de 30 dias ('||v_ate||').' ELSE NULL END);
END; $$;
REVOKE EXECUTE ON FUNCTION public.registrar_procuracao(date,uuid,text,text,int,uuid,text) FROM PUBLIC, anon;