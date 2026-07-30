-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730113853), então bate byte a byte com o que está no ar.
--
-- ATENÇÃO: a função public.preparar_audiencia(uuid) criada AQUI foi REESCRITA
-- depois por 20260730132711_rodrigo_item2_apelidos_de_tese.sql. A versão VIVA em
-- produção é a da migração de version MAIOR (20260730132711), que acrescenta o
-- 3º fallback por apelido, a chave tese_resolvida_via, a chave tese e um texto
-- de limitacao diferente. Não use este corpo como referência do contrato atual.
-- ============================================================================

-- CARD 13 (P2) — parte 2: lembrete ao cliente (cron + registro) e preparação da audiência.
-- Reusa o pendencia_tipo 'audiencia' que já existe no vocabulário (nenhuma migração de check).
-- Preparação: cruza os docs ÂNCORA da tese (tipo_acao_ancora_docs, o padrão do §24.1) com o
-- que o cliente já tem em client_documents. A matriz COMPLETA de obrigatórios é o Card 12 —
-- dependência declarada: hoje isto cobre a âncora + procuração, não o kit inteiro.

CREATE OR REPLACE FUNCTION public.gerar_pendencias_lembrete_audiencia()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r record; v_task uuid; v_criadas int := 0;
BEGIN
  FOR r IN
    SELECT l.id, l.data_prevista, a.id AS aud_id, a.client_id, a.client_name, a.data_hora,
           a.parte_contraria, a.advogado_user_id, a.link_local, a.process_id
      FROM public.audiencia_lembretes l
      JOIN public.audiencias a ON a.id = l.audiencia_id
     WHERE l.status='pendente'
       AND l.pendencia_task_id IS NULL
       AND l.data_prevista <= current_date
       AND a.status IN ('marcada','confirmada')
       AND a.data_hora >= now()
  LOOP
    v_task := public.criar_pendencia('audiencia',
      'Lembrar cliente da audiência: '||coalesce(r.client_name,'?'),
      r.client_id,
      'Audiência em '||to_char(r.data_hora,'DD/MM/YYYY HH24:MI')||
        coalesce(' · parte contrária: '||r.parte_contraria,'')||
        coalesce(' · local/link: '||r.link_local,'')||
        ' — ligar para confirmar presença e orientar documentos.',
      r.advogado_user_id, r.data_prevista::timestamptz, r.data_prevista, 'kanban_pendencias');
    IF r.process_id IS NOT NULL THEN
      UPDATE public.user_tasks SET process_id = r.process_id WHERE id = v_task;
    END IF;
    UPDATE public.audiencia_lembretes SET pendencia_task_id = v_task WHERE id = r.id;
    v_criadas := v_criadas + 1;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'lembretes_virados_pendencia',v_criadas,'executado_em',now());
END; $$;
REVOKE EXECUTE ON FUNCTION public.gerar_pendencias_lembrete_audiencia() FROM PUBLIC, anon, authenticated;

-- 10:20 UTC = 07:20 Bahia (antes do tickler de execução 10:30 e do data_fatal 11:00)
SELECT cron.schedule('audiencia_lembretes_daily','20 10 * * *',
  $$SELECT public.gerar_pendencias_lembrete_audiencia();$$);

CREATE OR REPLACE FUNCTION public.registrar_lembrete_audiencia(
  p_lembrete_id uuid, p_status text DEFAULT 'feito', p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_st text; v_task uuid; v_aud uuid;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  v_st := lower(btrim(coalesce(p_status,'feito')));
  v_st := CASE WHEN v_st IN ('feito','avisado','ok','falei') THEN 'feito'
               WHEN v_st IN ('nao_atendeu','não atendeu','nao atendeu') THEN 'nao_atendeu'
               WHEN v_st IN ('cancelado') THEN 'cancelado' ELSE NULL END;
  IF v_st IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','status_invalido',
      'mensagem','Status: feito, nao_atendeu ou cancelado.');
  END IF;

  UPDATE public.audiencia_lembretes l SET
    status = v_st, feito_em = now(), feito_por = auth.uid(),
    observacao = coalesce(nullif(btrim(coalesce(p_observacao,'')),''), l.observacao)
  WHERE l.id = p_lembrete_id
  RETURNING l.pendencia_task_id, l.audiencia_id INTO v_task, v_aud;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','lembrete_nao_encontrado'); END IF;

  -- 'feito' e 'cancelado' encerram a pendência; 'nao_atendeu' MANTÉM aberta (tem que tentar de novo)
  IF v_st IN ('feito','cancelado') AND v_task IS NOT NULL THEN
    UPDATE public.user_tasks SET completed_at = now(), updated_at = now()
     WHERE id = v_task AND completed_at IS NULL AND cancelled_at IS NULL;
  END IF;

  RETURN jsonb_build_object('ok',true,'lembrete_id',p_lembrete_id,'status',v_st,
    'pendencia_encerrada',(v_st IN ('feito','cancelado') AND v_task IS NOT NULL),
    'nota', CASE WHEN v_st='nao_atendeu' THEN 'Pendência permanece aberta para nova tentativa.' ELSE NULL END);
END; $$;
REVOKE EXECUTE ON FUNCTION public.registrar_lembrete_audiencia(uuid,text,text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.preparar_audiencia(p_audiencia_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE a record; v_tipo_id uuid; v_ancora text[]; v_falta jsonb; v_tem jsonb; v_lembretes jsonb;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;

  SELECT * INTO a FROM public.audiencias WHERE id = p_audiencia_id;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','audiencia_nao_encontrada'); END IF;

  -- resolver a tese: pelo processo (fonte forte) ou pelo texto tipo_acao (fallback declarado)
  IF a.process_id IS NOT NULL THEN
    SELECT p.tipo_acao_id INTO v_tipo_id FROM public.processes p WHERE p.id=a.process_id;
  END IF;
  IF v_tipo_id IS NULL AND nullif(btrim(coalesce(a.tipo_acao,'')),'') IS NOT NULL THEN
    SELECT t.id INTO v_tipo_id FROM public.tipos_acao t
     WHERE public.txt_fold(t.nome) = public.txt_fold(a.tipo_acao)
        OR public.txt_fold(coalesce(t.code,'')) = public.txt_fold(a.tipo_acao)
     LIMIT 1;
  END IF;

  SELECT ad.document_types INTO v_ancora FROM public.tipo_acao_ancora_docs ad WHERE ad.tipo_acao_id = v_tipo_id;
  -- procuração é universal para audiência, independente da tese
  v_ancora := coalesce(v_ancora, ARRAY[]::text[]) || ARRAY['procuracao'];

  SELECT jsonb_agg(DISTINCT d) INTO v_falta
    FROM unnest(v_ancora) d
   WHERE a.client_id IS NULL OR NOT EXISTS (
     SELECT 1 FROM public.client_documents cdoc
      WHERE cdoc.client_id = a.client_id AND cdoc.document_type = d
        AND coalesce(cdoc.status,'') <> 'rejeitado');
  SELECT jsonb_agg(DISTINCT d) INTO v_tem
    FROM unnest(v_ancora) d
   WHERE a.client_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.client_documents cdoc
      WHERE cdoc.client_id = a.client_id AND cdoc.document_type = d
        AND coalesce(cdoc.status,'') <> 'rejeitado');

  SELECT jsonb_agg(jsonb_build_object('id',l.id,'data',l.data_prevista,'status',l.status) ORDER BY l.data_prevista)
    INTO v_lembretes FROM public.audiencia_lembretes l WHERE l.audiencia_id = p_audiencia_id;

  RETURN jsonb_build_object('ok',true,
    'cliente',coalesce((SELECT cd.full_name FROM public.clients_decrypted cd WHERE cd.id=a.client_id), a.client_name),
    'cliente_vinculado',(a.client_id IS NOT NULL),
    'data_hora',a.data_hora,'tipo_acao',a.tipo_acao,'parte_contraria',a.parte_contraria,
    'local_ou_link',a.link_local,'status',a.status,
    'tese_resolvida',(v_tipo_id IS NOT NULL),
    'documentos_esperados',to_jsonb(v_ancora),
    'documentos_presentes',coalesce(v_tem,'[]'::jsonb),
    'documentos_faltando',coalesce(v_falta,'[]'::jsonb),
    'lembretes',coalesce(v_lembretes,'[]'::jsonb),
    'limitacao','Lista baseada nos documentos ÂNCORA da tese (§24.1) + procuração. A matriz completa de documentos obrigatórios por tese é o Card 12 e ainda não existe.');
END; $$;
REVOKE EXECUTE ON FUNCTION public.preparar_audiencia(uuid) FROM PUBLIC, anon;

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, tool_schema, sort_order, is_active) VALUES
('registrar_lembrete_audiencia','Registrar lembrete de audiência',
 'Marca o lembrete como feito, não atendeu (segue aberto) ou cancelado.',
 'acao','🔧',
 '{"name":"registrar_lembrete_audiencia","description":"Registra o resultado da ligação de lembrete de audiência. \"feito\" e \"cancelado\" encerram a pendência; \"nao_atendeu\" MANTÉM a pendência aberta para nova tentativa.","parameters":{"type":"object","required":["lembrete_id"],"properties":{"lembrete_id":{"type":"string","description":"UUID do lembrete (vem da preparar_audiencia ou do card da pendência)."},"status":{"type":"string","description":"feito (default), nao_atendeu ou cancelado."},"observacao":{"type":"string"}}}}'::jsonb, 146, true),
('preparar_audiencia','Preparar audiência',
 'Devolve o dossiê da audiência: dados, documentos esperados x presentes x faltando, e os lembretes.',
 'consulta','🔎',
 '{"name":"preparar_audiencia","description":"Prepara uma audiência: mostra data, tipo de ação, parte contrária, local/link, quais documentos a tese exige (âncora do §24.1 + procuração), quais o cliente já tem e quais faltam, e a régua de lembretes. Use quando pedirem \"o que falta para a audiência do cliente X\".","parameters":{"type":"object","required":["audiencia_id"],"properties":{"audiencia_id":{"type":"string","description":"UUID da audiência (consultar_audiencias)."}}}}'::jsonb, 147, true);

UPDATE public.agents
   SET allowed_tools = allowed_tools || ARRAY['registrar_lembrete_audiencia','preparar_audiencia']
 WHERE allowed_tools @> ARRAY['registrar_relacao_bancaria']
   AND NOT allowed_tools @> ARRAY['preparar_audiencia'];