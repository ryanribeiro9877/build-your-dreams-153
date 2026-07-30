-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730123251), então bate byte a byte com o que está no ar.
--
-- REESCREVE public.consultar_procuracoes, criada em 20260730123129
-- (card15_procuracao_vigencia_e_campanha_recorrente). ESTA é a versão VIVA da
-- função: nenhuma migração de version MAIOR a toca.
-- ============================================================================
-- FIX (pego na prova, 30/07): consultar_procuracoes com p_vencendo_em_dias filtrava
-- status='vigente', então procuração JÁ VENCIDA não aparecia na pergunta "quais vencem
-- nos próximos 30 dias?" — o caso mais urgente era o único invisível.
-- Medido: 1 procuração vencida em 30/01/2026 e a consulta devolveu total=0.
-- O cron já tratava vencidas corretamente; a inconsistência era só na leitura — que é
-- exatamente onde uma pessoa confia e deixa de agir.
CREATE OR REPLACE FUNCTION public.consultar_procuracoes(
  p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL,
  p_vencendo_em_dias int DEFAULT NULL, p_incluir_historico boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_n int; v_out jsonb; v_vencidas int;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  IF p_client_id IS NULL AND nullif(btrim(coalesce(p_cliente_nome,'')),'') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    IF v_n = 1 THEN SELECT cd.id INTO v_cli FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    ELSIF v_n > 1 THEN RETURN jsonb_build_object('ok',false,'motivo','ambiguo');
    ELSE RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_encontrado'); END IF;
  ELSE v_cli := p_client_id; END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'id',p.id,'cliente',cd.full_name,'tipo',p.tipo,
           'data_assinatura',p.data_assinatura,'validade_ate',p.validade_ate,'status',p.status,
           'dias_para_vencer',(p.validade_ate - current_date),
           'vencida',(p.validade_ate < current_date AND p.substituida_por_id IS NULL),
           'tem_pdf',(p.client_document_id IS NOT NULL))
         ORDER BY p.validade_ate),
       count(*) FILTER (WHERE p.validade_ate < current_date AND p.substituida_por_id IS NULL)
    INTO v_out, v_vencidas
  FROM public.procuracoes p JOIN public.clients_decrypted cd ON cd.id=p.client_id
  WHERE (v_cli IS NULL OR p.client_id = v_cli)
    AND (p_incluir_historico OR p.status IN ('vigente','vencida'))
    -- janela inclui VENCIDAS: quem já venceu é mais urgente, não menos
    AND (p_vencendo_em_dias IS NULL
         OR (p.status IN ('vigente','vencida') AND p.substituida_por_id IS NULL
             AND p.validade_ate <= current_date + p_vencendo_em_dias));

  RETURN jsonb_build_object('ok',true,'total',coalesce(jsonb_array_length(v_out),0),
    'ja_vencidas',coalesce(v_vencidas,0),'procuracoes',coalesce(v_out,'[]'::jsonb));
END; $$;
REVOKE EXECUTE ON FUNCTION public.consultar_procuracoes(uuid,text,int,boolean) FROM PUBLIC, anon;