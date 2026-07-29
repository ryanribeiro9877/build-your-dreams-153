-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (29/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260729140944), então bate byte a byte com o que está no ar.
-- ============================================================================

-- CARD 6 (Motor 2) — Reclamações Administrativas (Procon/Bacen/INSS/etc.) com prazos.
-- Prazo NÃO vira entidade nova: nasce como pendência com data_fatal via criar_pendencia,
-- que o dashboard de prazos e o cron pendencias_data_fatal_daily (11:00) já vigiam.

CREATE TABLE public.reclamacoes_administrativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  process_id uuid REFERENCES public.processes(id) ON DELETE SET NULL,
  orgao text NOT NULL CHECK (orgao IN ('procon','bacen','inss','consumidor_gov','ouvidoria_banco','email_banco','outro')),
  tese text,
  data_reclamacao date NOT NULL DEFAULT current_date,
  protocolo text,
  prazo_resposta date,
  prazo_fatal date,
  resposta_em date,
  resposta_texto text,
  desfecho text NOT NULL DEFAULT 'pendente' CHECK (desfecho IN ('pendente','atendida','negada','sem_resposta')),
  notes text,
  is_test boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reclamacoes_client ON public.reclamacoes_administrativas(client_id);
CREATE INDEX idx_reclamacoes_prazo ON public.reclamacoes_administrativas(prazo_resposta) WHERE desfecho='pendente';

ALTER TABLE public.reclamacoes_administrativas ENABLE ROW LEVEL SECURITY;
-- dado do cliente/jurídico: mesmo gate de client_bank_relations
CREATE POLICY "reclamacoes read" ON public.reclamacoes_administrativas
  FOR SELECT TO authenticated
  USING (public.can_view_clients() OR public.is_socio_or_advogado());
-- escrita só pelas RPCs SECURITY DEFINER (nenhuma policy de INSERT/UPDATE/DELETE)

CREATE OR REPLACE FUNCTION public.registrar_reclamacao(
  p_orgao text, p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL,
  p_tese text DEFAULT NULL, p_data_reclamacao date DEFAULT NULL, p_protocolo text DEFAULT NULL,
  p_prazo_resposta date DEFAULT NULL, p_prazo_fatal date DEFAULT NULL,
  p_process_id uuid DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_nome text; v_n int; v_cands jsonb; v_orgao text; v_id uuid; v_task uuid;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para registrar reclamação' USING errcode='42501';
  END IF;
  v_orgao := lower(btrim(coalesce(p_orgao,'')));
  v_orgao := CASE WHEN v_orgao IN ('procon') THEN 'procon'
                  WHEN v_orgao IN ('bacen','banco central','bc') THEN 'bacen'
                  WHEN v_orgao IN ('inss','meu inss') THEN 'inss'
                  WHEN v_orgao IN ('consumidor.gov','consumidor gov','consumidor_gov') THEN 'consumidor_gov'
                  WHEN v_orgao IN ('ouvidoria','ouvidoria_banco','ouvidoria do banco') THEN 'ouvidoria_banco'
                  WHEN v_orgao IN ('email','e-mail','email_banco','email ao banco') THEN 'email_banco'
                  WHEN v_orgao <> '' THEN 'outro' ELSE NULL END;
  IF v_orgao IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','orgao_invalido',
      'mensagem','Órgão deve ser: procon, bacen, inss, consumidor_gov, ouvidoria_banco, email_banco ou outro.');
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

  INSERT INTO public.reclamacoes_administrativas
    (client_id, process_id, orgao, tese, data_reclamacao, protocolo, prazo_resposta, prazo_fatal, notes, created_by)
  VALUES (v_cli, p_process_id, v_orgao, nullif(btrim(coalesce(p_tese,'')),''),
          coalesce(p_data_reclamacao, current_date), nullif(btrim(coalesce(p_protocolo,'')),''),
          p_prazo_resposta, p_prazo_fatal, nullif(btrim(coalesce(p_observacao,'')),''), auth.uid())
  RETURNING id INTO v_id;

  -- prazo entra no trilho vivo: pendência com data_fatal
  IF coalesce(p_prazo_fatal, p_prazo_resposta) IS NOT NULL THEN
    v_task := public.criar_pendencia('reclamacao_administrativa',
      'Prazo reclamação '||upper(v_orgao)||': '||v_nome, v_cli,
      coalesce(nullif(btrim(coalesce(p_tese,'')),''),'Acompanhar resposta da reclamação.')
        || coalesce(' Protocolo: '||nullif(btrim(coalesce(p_protocolo,'')),''),''),
      auth.uid(),
      coalesce(p_prazo_resposta, p_prazo_fatal)::timestamptz,
      coalesce(p_prazo_fatal, p_prazo_resposta),
      'kanban_pendencias');
  END IF;

  RETURN jsonb_build_object('ok',true,'reclamacao_id',v_id,'cliente',v_nome,'orgao',v_orgao,
    'pendencia_prazo_criada',(v_task IS NOT NULL));
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_resposta_reclamacao(
  p_reclamacao_id uuid, p_desfecho text, p_resposta_texto text DEFAULT NULL, p_resposta_em date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_desf text; v_nome text; v_orgao text;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  v_desf := lower(btrim(coalesce(p_desfecho,'')));
  v_desf := CASE WHEN v_desf IN ('atendida','atendido','procedente') THEN 'atendida'
                 WHEN v_desf IN ('negada','negado','improcedente') THEN 'negada'
                 WHEN v_desf IN ('sem_resposta','sem resposta','silencio') THEN 'sem_resposta'
                 ELSE NULL END;
  IF v_desf IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','desfecho_invalido',
      'mensagem','Desfecho deve ser: atendida, negada ou sem_resposta.');
  END IF;

  UPDATE public.reclamacoes_administrativas r
     SET desfecho = v_desf,
         resposta_texto = coalesce(nullif(btrim(coalesce(p_resposta_texto,'')),''), r.resposta_texto),
         resposta_em = coalesce(p_resposta_em, current_date),
         updated_at = now()
   WHERE r.id = p_reclamacao_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','reclamacao_nao_encontrada'); END IF;

  SELECT cd.full_name, r.orgao INTO v_nome, v_orgao
    FROM public.reclamacoes_administrativas r JOIN public.clients_decrypted cd ON cd.id=r.client_id
   WHERE r.id = p_reclamacao_id;

  RETURN jsonb_build_object('ok',true,'cliente',v_nome,'orgao',v_orgao,'desfecho',v_desf,
    'nota', CASE WHEN v_desf IN ('negada','sem_resposta')
                 THEN 'Resposta negativa/silêncio pode servir de prova (interesse de agir / inversão do ônus).'
                 ELSE NULL END);
END; $$;

CREATE OR REPLACE FUNCTION public.consultar_reclamacoes(
  p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL, p_vencendo_ate date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_n int; v_out jsonb;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  IF nullif(btrim(coalesce(p_cliente_nome,'')),'') IS NOT NULL AND p_client_id IS NULL THEN
    SELECT count(*) INTO v_n FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    IF v_n = 1 THEN
      SELECT cd.id INTO v_cli FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    ELSIF v_n > 1 THEN
      RETURN jsonb_build_object('ok',false,'motivo','ambiguo');
    ELSE
      RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_encontrado');
    END IF;
  ELSE
    v_cli := p_client_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'id',r.id,'cliente',cd.full_name,'orgao',r.orgao,'tese',r.tese,
           'data',r.data_reclamacao,'protocolo',r.protocolo,
           'prazo_resposta',r.prazo_resposta,'prazo_fatal',r.prazo_fatal,
           'desfecho',r.desfecho,'resposta_em',r.resposta_em)
         ORDER BY coalesce(r.prazo_fatal,r.prazo_resposta) NULLS LAST)
    INTO v_out
  FROM public.reclamacoes_administrativas r
  JOIN public.clients_decrypted cd ON cd.id=r.client_id
  WHERE (v_cli IS NULL OR r.client_id=v_cli)
    AND (p_vencendo_ate IS NULL OR (r.desfecho='pendente' AND coalesce(r.prazo_fatal,r.prazo_resposta) <= p_vencendo_ate));

  RETURN jsonb_build_object('ok',true,'reclamacoes',coalesce(v_out,'[]'::jsonb));
END; $$;

REVOKE EXECUTE ON FUNCTION public.registrar_reclamacao(text,uuid,text,text,date,text,date,date,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_resposta_reclamacao(uuid,text,text,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consultar_reclamacoes(uuid,text,date) FROM PUBLIC, anon;

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, tool_schema, sort_order, is_active) VALUES
('registrar_reclamacao','Registrar reclamação administrativa',
 'Registra reclamação em Procon/Bacen/INSS/consumidor.gov/ouvidoria com prazos; o prazo vira pendência com data fatal.',
 'acao','🔧',
 '{"name":"registrar_reclamacao","description":"Registra uma reclamação administrativa (Procon, Bacen, INSS, consumidor.gov, ouvidoria do banco, e-mail ao banco) com protocolo e prazos. Prazo de resposta/fatal vira pendência automática no dashboard de prazos. Pré-requisito de ação em várias teses.","parameters":{"type":"object","required":["orgao"],"properties":{"orgao":{"type":"string","description":"procon, bacen, inss, consumidor_gov, ouvidoria_banco, email_banco ou outro."},"client_id":{"type":"string","description":"UUID do cliente (consultar_cliente)."},"cliente_nome":{"type":"string","description":"Nome do cliente como o usuário falou (a função resolve; ambíguo devolve candidatos)."},"tese":{"type":"string","description":"Tese/assunto da reclamação."},"data_reclamacao":{"type":"string","description":"Data da reclamação (YYYY-MM-DD); default hoje."},"protocolo":{"type":"string","description":"Número de protocolo."},"prazo_resposta":{"type":"string","description":"Prazo esperado de resposta (YYYY-MM-DD)."},"prazo_fatal":{"type":"string","description":"Prazo FATAL (YYYY-MM-DD) — vira data fatal da pendência."},"process_id":{"type":"string","description":"UUID do processo vinculado, se houver."},"observacao":{"type":"string"}}}}'::jsonb, 110, true),
('registrar_resposta_reclamacao','Registrar resposta de reclamação',
 'Registra o desfecho de uma reclamação administrativa (atendida/negada/sem_resposta).',
 'acao','🔧',
 '{"name":"registrar_resposta_reclamacao","description":"Registra a resposta/desfecho de uma reclamação administrativa existente. Negada ou sem resposta pode servir de prova (interesse de agir).","parameters":{"type":"object","required":["reclamacao_id","desfecho"],"properties":{"reclamacao_id":{"type":"string","description":"UUID da reclamação (consultar_reclamacoes)."},"desfecho":{"type":"string","description":"atendida, negada ou sem_resposta."},"resposta_texto":{"type":"string","description":"Resumo da resposta."},"resposta_em":{"type":"string","description":"Data da resposta (YYYY-MM-DD); default hoje."}}}}'::jsonb, 111, true),
('consultar_reclamacoes','Consultar reclamações administrativas',
 'Lista reclamações por cliente e/ou vencendo até uma data.',
 'consulta','🔎',
 '{"name":"consultar_reclamacoes","description":"Lista reclamações administrativas: por cliente, todas, ou apenas as pendentes vencendo até uma data (ex.: \"quais reclamações vencem essa semana?\").","parameters":{"type":"object","properties":{"client_id":{"type":"string"},"cliente_nome":{"type":"string"},"vencendo_ate":{"type":"string","description":"YYYY-MM-DD — só pendentes com prazo até esta data."}}}}'::jsonb, 112, true);

UPDATE public.agents
   SET allowed_tools = allowed_tools || ARRAY['registrar_reclamacao','registrar_resposta_reclamacao','consultar_reclamacoes']
 WHERE allowed_tools @> ARRAY['registrar_relacao_bancaria']
   AND NOT allowed_tools @> ARRAY['registrar_reclamacao'];
