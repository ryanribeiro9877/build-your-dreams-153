-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730123129), então bate byte a byte com o que está no ar.
--
-- ATENÇÃO — DUAS FUNÇÕES CRIADAS AQUI FORAM REESCRITAS DEPOIS. O que está vivo em
-- produção é a versão da migração de version MAIOR, não a deste arquivo:
--   · public.consultar_procuracoes  -> reescrita por 20260730123251
--     (card15_fix_consulta_inclui_vencidas_na_janela): a janela passa a incluir
--     as VENCIDAS e o retorno ganha a chave 'ja_vencidas'.
--   · public.registrar_procuracao   -> reescrita por 20260730123348
--     (card15_fix_renovacao_encontra_vencida): a "anterior" passa a ser a última
--     NÃO SUBSTITUÍDA (vigente OU vencida) e o retorno ganha as chaves
--     'status_da_anterior' e 'pendencia_renovacao_fechada'.
-- Continuam vivas deste arquivo: a tabela public.procuracoes, o vocabulário de
-- pendencia_tipo, public.processar_procuracoes_vencendo, o cron
-- procuracoes_vencendo_daily e public.gerar_campanha_renovacao_procuracao.
-- ============================================================================
-- CARD 15 (P2) — Renovação anual de procuração (campanha recorrente).
--
-- ESTADO MEDIDO: existem 6 procurações em client_documents, e a tabela NÃO tem data de
-- assinatura nem validade — só created_at (data do upload, que não é a data da assinatura).
-- Sem vigência não há como saber o que vence, então a renovação anual é hoje invisível.
-- O objetivo de campanha 'renovar_procuracao' JÁ EXISTE no check de campanhas desde o Card 4:
-- o trilho estava pronto esperando o dado.
--
-- DECISÃO DE MODELO: tabela dedicada em vez de colunas em client_documents. Motivos:
-- (1) client_documents é genérico (13 tipos) e ganharia colunas que só valem para 1 tipo;
-- (2) procuração tem LINHAGEM (a nova substitui a antiga) e ciclo de vida próprio;
-- (3) o PDF continua em client_documents e é referenciado por client_document_id.
--
-- PARÂMETROS DECLARADOS (não inventados como lei): validade padrão 12 meses e janela de aviso
-- de 30 dias são DEFAULTS sobrescritíveis — confirmação do Rodrigo pendente (ver doc de pendências).

CREATE TABLE public.procuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_document_id uuid REFERENCES public.client_documents(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'ad_judicia' CHECK (tipo IN ('ad_judicia','ad_judicia_et_extra','especifica','outro')),
  data_assinatura date NOT NULL,
  validade_meses int NOT NULL DEFAULT 12 CHECK (validade_meses BETWEEN 1 AND 120),
  validade_ate date NOT NULL,
  status text NOT NULL DEFAULT 'vigente' CHECK (status IN ('vigente','vencida','renovada','revogada')),
  substituida_por_id uuid REFERENCES public.procuracoes(id) ON DELETE SET NULL,
  pendencia_task_id uuid REFERENCES public.user_tasks(id) ON DELETE SET NULL,
  notes text,
  is_test boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_procuracoes_client ON public.procuracoes(client_id);
CREATE INDEX idx_procuracoes_vencendo ON public.procuracoes(validade_ate) WHERE status='vigente';
-- uma só procuração vigente por cliente (a nova renova a antiga)
CREATE UNIQUE INDEX uq_procuracao_vigente_por_cliente ON public.procuracoes(client_id) WHERE status='vigente';

ALTER TABLE public.procuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "procuracoes read" ON public.procuracoes
  FOR SELECT TO authenticated
  USING (public.can_view_clients() OR public.is_socio_or_advogado());

-- vocabulário (aditivo — armadilha 23514)
ALTER TABLE public.user_tasks DROP CONSTRAINT user_tasks_pendencia_tipo_chk;
ALTER TABLE public.user_tasks ADD CONSTRAINT user_tasks_pendencia_tipo_chk
  CHECK (pendencia_tipo IS NULL OR pendencia_tipo = ANY (ARRAY[
    'documentacao','comprovante_endereco','senha_inss','reset_inss','extratos',
    'falta_documentacao','audiencia','reuniao','andamento','whatsapp','ligacao','outro',
    'reclamacao_administrativa','recuperacao_senha_gov','conversao_conta_gov','alvara',
    'revisao_execucao','prazo_embargos','prazo_recurso','prazo_pagamento_execucao',
    'sugestao_ajuizar_execucao','diligencia',
    'renovacao_procuracao'
  ]));

CREATE OR REPLACE FUNCTION public.registrar_procuracao(
  p_data_assinatura date, p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL,
  p_tipo text DEFAULT 'ad_judicia', p_validade_meses int DEFAULT 12,
  p_client_document_id uuid DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_nome text; v_n int; v_cands jsonb; v_tipo text; v_meses int;
        v_ate date; v_id uuid; v_antiga uuid;
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

  -- a nova RENOVA a anterior (linhagem) e libera o índice único de vigente
  SELECT p.id INTO v_antiga FROM public.procuracoes p WHERE p.client_id=v_cli AND p.status='vigente';
  IF v_antiga IS NOT NULL THEN
    UPDATE public.procuracoes SET status='renovada', updated_at=now() WHERE id=v_antiga;
    -- fecha a pendência de renovação que estava aberta, se houver
    UPDATE public.user_tasks t SET completed_at=now(), updated_at=now()
     WHERE t.id = (SELECT pendencia_task_id FROM public.procuracoes WHERE id=v_antiga)
       AND t.completed_at IS NULL AND t.cancelled_at IS NULL;
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
    'ja_vencida',(v_ate < current_date),
    'aviso', CASE WHEN v_ate < current_date
                  THEN 'Esta procuração JÁ ESTÁ VENCIDA em '||v_ate||' — precisa de renovação imediata.'
                  WHEN v_ate <= current_date + 30
                  THEN 'Vence em menos de 30 dias ('||v_ate||').' ELSE NULL END);
END; $$;

CREATE OR REPLACE FUNCTION public.consultar_procuracoes(
  p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL,
  p_vencendo_em_dias int DEFAULT NULL, p_incluir_historico boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_n int; v_out jsonb;
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
           'vencida',(p.status='vigente' AND p.validade_ate < current_date),
           'tem_pdf',(p.client_document_id IS NOT NULL))
         ORDER BY p.validade_ate)
    INTO v_out
  FROM public.procuracoes p JOIN public.clients_decrypted cd ON cd.id=p.client_id
  WHERE (v_cli IS NULL OR p.client_id = v_cli)
    AND (p_incluir_historico OR p.status IN ('vigente','vencida'))
    AND (p_vencendo_em_dias IS NULL
         OR (p.status='vigente' AND p.validade_ate <= current_date + p_vencendo_em_dias));

  RETURN jsonb_build_object('ok',true,'total',coalesce(jsonb_array_length(v_out),0),
    'procuracoes',coalesce(v_out,'[]'::jsonb));
END; $$;

-- ===== O MOTOR RECORRENTE =====
-- Duas coisas por dia: (1) marcar vencidas o que passou da validade;
-- (2) abrir pendência de renovação na janela de aviso, com dedup pelo vínculo guardado.
CREATE OR REPLACE FUNCTION public.processar_procuracoes_vencendo(p_janela_dias int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r record; v_task uuid; v_criadas int := 0; v_vencidas int := 0; v_nome text;
BEGIN
  UPDATE public.procuracoes SET status='vencida', updated_at=now()
   WHERE status='vigente' AND validade_ate < current_date;
  GET DIAGNOSTICS v_vencidas = ROW_COUNT;

  FOR r IN
    SELECT p.id, p.client_id, p.validade_ate
      FROM public.procuracoes p
     WHERE p.status IN ('vigente','vencida')
       AND p.substituida_por_id IS NULL
       AND p.validade_ate <= current_date + p_janela_dias
       AND (p.pendencia_task_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.user_tasks t
                            WHERE t.id = p.pendencia_task_id
                              AND t.completed_at IS NULL AND t.cancelled_at IS NULL))
  LOOP
    IF EXISTS (SELECT 1 FROM public.user_tasks t
                WHERE t.is_pendencia AND t.pendencia_tipo='renovacao_procuracao'
                  AND t.client_id = r.client_id
                  AND t.completed_at IS NULL AND t.cancelled_at IS NULL) THEN
      CONTINUE;
    END IF;
    SELECT cd.full_name INTO v_nome FROM public.clients_decrypted cd WHERE cd.id=r.client_id;
    v_task := public.criar_pendencia('renovacao_procuracao',
      'Renovar procuração: '||coalesce(v_nome,'?'), r.client_id,
      'Procuração vence/venceu em '||r.validade_ate||'. Chamar o cliente para assinar a nova.',
      NULL, r.validade_ate::timestamptz, r.validade_ate, 'kanban_pendencias');
    UPDATE public.procuracoes SET pendencia_task_id = v_task WHERE id = r.id;
    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'marcadas_vencidas',v_vencidas,
    'pendencias_renovacao_criadas',v_criadas,'janela_dias',p_janela_dias,'executado_em',now());
END; $$;
REVOKE EXECUTE ON FUNCTION public.processar_procuracoes_vencendo(int) FROM PUBLIC, anon, authenticated;

-- 10:50 UTC = 07:50 Bahia (depois dos outros ticklers, antes do data_fatal das 11:00)
SELECT cron.schedule('procuracoes_vencendo_daily','50 10 * * *',
  $$SELECT public.processar_procuracoes_vencendo(30);$$);

-- A CAMPANHA: reusa campanhas/campanha_itens do Card 4 com o objetivo 'renovar_procuracao'
-- que já existia no check. Não passa por criar_campanha porque search_clients não conhece
-- filtro de vigência de procuração — os itens são montados aqui, do jeito certo.
CREATE OR REPLACE FUNCTION public.gerar_campanha_renovacao_procuracao(
  p_janela_dias int DEFAULT 30, p_nome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_camp uuid; v_nome text; v_itens int; v_sem_telefone int;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para criar campanha' USING errcode='42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.procuracoes p
                  WHERE p.status IN ('vigente','vencida') AND p.substituida_por_id IS NULL
                    AND p.validade_ate <= current_date + p_janela_dias) THEN
    RETURN jsonb_build_object('ok',false,'motivo','nada_a_renovar',
      'mensagem','Nenhuma procuração vencendo em '||p_janela_dias||' dias.');
  END IF;

  v_nome := coalesce(nullif(btrim(coalesce(p_nome,'')),''),
                     'Renovação de procuração — vencendo até '||(current_date + p_janela_dias));
  INSERT INTO public.campanhas (nome, objetivo, filtro, status, created_by)
  VALUES (v_nome, 'renovar_procuracao',
          jsonb_build_object('procuracao_vence_em_dias', p_janela_dias), 'ativa', auth.uid())
  RETURNING id INTO v_camp;

  -- não repete cliente que já está em campanha aberta do mesmo objetivo
  INSERT INTO public.campanha_itens (campanha_id, client_id)
  SELECT v_camp, p.client_id
    FROM public.procuracoes p
   WHERE p.status IN ('vigente','vencida') AND p.substituida_por_id IS NULL
     AND p.validade_ate <= current_date + p_janela_dias
     AND NOT EXISTS (
       SELECT 1 FROM public.campanha_itens i JOIN public.campanhas c ON c.id=i.campanha_id
        WHERE i.client_id = p.client_id AND c.objetivo='renovar_procuracao'
          AND c.status='ativa' AND i.status IN ('pendente','em_andamento'))
   GROUP BY p.client_id;
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  SELECT count(*) INTO v_sem_telefone
    FROM public.campanha_itens i JOIN public.clients c ON c.id=i.client_id
   WHERE i.campanha_id = v_camp AND nullif(btrim(coalesce(c.phone,'')),'') IS NULL;

  RETURN jsonb_build_object('ok',true,'campanha_id',v_camp,'nome',v_nome,
    'clientes_na_fila',v_itens,'sem_telefone',v_sem_telefone,'janela_dias',p_janela_dias,
    'aviso', CASE WHEN v_sem_telefone > 0
                  THEN v_sem_telefone||' de '||v_itens||' clientes da fila estão SEM TELEFONE cadastrado — a fila é parcialmente inacionável até o import de telefones.'
                  ELSE NULL END);
END; $$;

REVOKE EXECUTE ON FUNCTION public.registrar_procuracao(date,uuid,text,text,int,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consultar_procuracoes(uuid,text,int,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gerar_campanha_renovacao_procuracao(int,text) FROM PUBLIC, anon;

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, tool_schema, sort_order, is_active) VALUES
('registrar_procuracao','Registrar procuração (com vigência)',
 'Registra a procuração pela DATA DE ASSINATURA e calcula a validade; renova a anterior automaticamente.',
 'acao','🔧',
 '{"name":"registrar_procuracao","description":"Registra a procuração de um cliente com a data em que foi ASSINADA (não a data do upload) e a validade em meses (padrão 12). Se o cliente já tinha procuração vigente, ela é marcada como renovada e a pendência de renovação aberta é fechada. Avisa se a procuração já está vencida ou vence em menos de 30 dias.","parameters":{"type":"object","required":["data_assinatura"],"properties":{"data_assinatura":{"type":"string","description":"YYYY-MM-DD — data da assinatura."},"client_id":{"type":"string"},"cliente_nome":{"type":"string"},"tipo":{"type":"string","description":"ad_judicia (default), ad_judicia_et_extra, especifica ou outro."},"validade_meses":{"type":"integer","description":"Padrão 12."},"client_document_id":{"type":"string","description":"UUID do PDF já anexado ao dossiê, se houver."},"observacao":{"type":"string"}}}}'::jsonb, 148, true),
('consultar_procuracoes','Consultar procurações',
 'Lista procurações por cliente ou as que vencem em N dias, com dias restantes.',
 'consulta','🔎',
 '{"name":"consultar_procuracoes","description":"Lista procurações: de um cliente, ou todas as que vencem nos próximos N dias (ex.: \"quais procurações vencem esse mês?\"). Mostra dias para vencer e marca as vencidas.","parameters":{"type":"object","properties":{"client_id":{"type":"string"},"cliente_nome":{"type":"string"},"vencendo_em_dias":{"type":"integer","description":"Ex.: 30 para o próximo mês."},"incluir_historico":{"type":"boolean","description":"true para ver também as já renovadas/revogadas."}}}}'::jsonb, 149, true),
('gerar_campanha_renovacao_procuracao','Gerar campanha de renovação de procuração',
 'Cria a fila de ligações dos clientes com procuração vencendo (reusa a tela Campanhas).',
 'acao','🔧',
 '{"name":"gerar_campanha_renovacao_procuracao","description":"Cria uma campanha de ligações (objetivo renovar_procuracao) com todos os clientes cuja procuração vence na janela informada. Não repete cliente que já está em campanha aberta do mesmo objetivo. Avisa quantos estão sem telefone.","parameters":{"type":"object","properties":{"janela_dias":{"type":"integer","description":"Padrão 30."},"nome":{"type":"string","description":"Nome da campanha; gerado se omitido."}}}}'::jsonb, 150, true);

UPDATE public.agents
   SET allowed_tools = allowed_tools || ARRAY['registrar_procuracao','consultar_procuracoes','gerar_campanha_renovacao_procuracao']
 WHERE allowed_tools @> ARRAY['registrar_relacao_bancaria']
   AND NOT allowed_tools @> ARRAY['registrar_procuracao'];