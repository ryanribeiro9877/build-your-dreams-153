-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (29/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260729141052), então bate byte a byte com o que está no ar.
-- ============================================================================

-- CARD 8 (Motor 3) — Pipeline de execução: tabela 1:1 com processes + linha do tempo.
-- "São os processos que pagam a conta do escritório" (Rodrigo). Fases espelham os
-- campos reais das planilhas Execução 1 e 2. responsavel_nome é PONTE até o Card 2
-- (Daiane/Robson ainda não têm usuário no sistema — pendência P0 conhecida).
-- Colunas proxima_revisao/revisao_intervalo_dias já nascem aqui (Card 9 usa).

CREATE TABLE public.execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL UNIQUE REFERENCES public.processes(id) ON DELETE CASCADE,
  fase text NOT NULL DEFAULT 'ajuizada' CHECK (fase IN
    ('ajuizada','prazo_pagamento','pedido_penhora','sisbajud','penhora_negativa',
     'redirecionamento','pago','deposito_judicial','expedicao_alvara',
     'alvara_pendente_assinatura','encerrada')),
  reu_nome text,
  reu_tipo text CHECK (reu_tipo IS NULL OR reu_tipo IN ('sindicato','banco','empresa','pessoa_fisica','outro')),
  responsavel_user_id uuid,
  responsavel_nome text,
  valor_execucao numeric(14,2),
  proxima_revisao date,
  revisao_intervalo_dias int CHECK (revisao_intervalo_dias IS NULL OR revisao_intervalo_dias BETWEEN 1 AND 90),
  notes text,
  is_test boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_execucoes_fase ON public.execucoes(fase);
CREATE INDEX idx_execucoes_revisao ON public.execucoes(proxima_revisao) WHERE fase <> 'encerrada';

CREATE TABLE public.execucao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id uuid NOT NULL REFERENCES public.execucoes(id) ON DELETE CASCADE,
  fase_de text,
  fase_para text NOT NULL,
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_execucao_eventos_exec ON public.execucao_eventos(execucao_id, created_at);

ALTER TABLE public.execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execucao_eventos ENABLE ROW LEVEL SECURITY;
-- execução é dado do jurídico: advogado + sócio + admin (recepção fora)
CREATE POLICY "execucoes read" ON public.execucoes
  FOR SELECT TO authenticated
  USING (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "execucao_eventos read" ON public.execucao_eventos
  FOR SELECT TO authenticated
  USING (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role));

-- resolver interno de processo (id OU número) — não é tool
CREATE OR REPLACE FUNCTION public._resolver_processo(p_process_id uuid, p_processo_numero text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v uuid; v_n int;
BEGIN
  IF p_process_id IS NOT NULL THEN RETURN p_process_id; END IF;
  IF nullif(btrim(coalesce(p_processo_numero,'')),'') IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_n FROM public.processes p WHERE p.process_number ILIKE '%'||btrim(p_processo_numero)||'%';
  IF v_n <> 1 THEN RETURN NULL; END IF;
  SELECT p.id INTO v FROM public.processes p WHERE p.process_number ILIKE '%'||btrim(p_processo_numero)||'%';
  RETURN v;
END; $$;
REVOKE EXECUTE ON FUNCTION public._resolver_processo(uuid,text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.iniciar_execucao(
  p_process_id uuid DEFAULT NULL, p_processo_numero text DEFAULT NULL,
  p_reu_nome text DEFAULT NULL, p_reu_tipo text DEFAULT NULL,
  p_responsavel_nome text DEFAULT NULL, p_valor numeric DEFAULT NULL,
  p_fase text DEFAULT 'ajuizada', p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_proc uuid; v_id uuid; v_fase text; v_num text;
BEGIN
  IF NOT (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para iniciar execução' USING errcode='42501';
  END IF;
  v_proc := public._resolver_processo(p_process_id, p_processo_numero);
  IF v_proc IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','processo_nao_encontrado_ou_ambiguo',
      'mensagem','Informe o número exato do processo ou o process_id.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.execucoes e WHERE e.process_id=v_proc) THEN
    RETURN jsonb_build_object('ok',false,'motivo','execucao_ja_existe');
  END IF;
  v_fase := lower(btrim(coalesce(p_fase,'ajuizada')));
  IF v_fase NOT IN ('ajuizada','prazo_pagamento','pedido_penhora','sisbajud','penhora_negativa',
                    'redirecionamento','pago','deposito_judicial','expedicao_alvara',
                    'alvara_pendente_assinatura','encerrada') THEN
    v_fase := 'ajuizada';
  END IF;

  INSERT INTO public.execucoes (process_id, fase, reu_nome, reu_tipo, responsavel_nome, valor_execucao, notes, created_by)
  VALUES (v_proc, v_fase, nullif(btrim(coalesce(p_reu_nome,'')),''),
          nullif(lower(btrim(coalesce(p_reu_tipo,''))),''),
          nullif(btrim(coalesce(p_responsavel_nome,'')),''), p_valor,
          nullif(btrim(coalesce(p_observacao,'')),''), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.execucao_eventos (execucao_id, fase_de, fase_para, observacao, created_by)
  VALUES (v_id, NULL, v_fase, coalesce(nullif(btrim(coalesce(p_observacao,'')),''),'Execução registrada.'), auth.uid());

  SELECT process_number INTO v_num FROM public.processes WHERE id=v_proc;
  RETURN jsonb_build_object('ok',true,'execucao_id',v_id,'processo',v_num,'fase',v_fase);
END; $$;

CREATE OR REPLACE FUNCTION public.atualizar_fase_execucao(
  p_fase text, p_process_id uuid DEFAULT NULL, p_processo_numero text DEFAULT NULL,
  p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_proc uuid; v_exec uuid; v_de text; v_para text; v_num text; v_cli uuid; v_task uuid;
BEGIN
  IF NOT (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  v_para := lower(btrim(coalesce(p_fase,'')));
  v_para := CASE WHEN v_para IN ('penhora negativa') THEN 'penhora_negativa'
                 WHEN v_para IN ('pedido de penhora','penhora') THEN 'pedido_penhora'
                 WHEN v_para IN ('prazo de pagamento','15 dias','prazo_pagamento') THEN 'prazo_pagamento'
                 WHEN v_para IN ('deposito judicial','depósito judicial','deposito_judicial') THEN 'deposito_judicial'
                 WHEN v_para IN ('expedicao de alvara','expedição de alvará','pedir alvara','pedir alvará','expedicao_alvara') THEN 'expedicao_alvara'
                 WHEN v_para IN ('alvara pendente assinatura','alvará pendente','alvara_pendente_assinatura') THEN 'alvara_pendente_assinatura'
                 ELSE v_para END;
  IF v_para NOT IN ('ajuizada','prazo_pagamento','pedido_penhora','sisbajud','penhora_negativa',
                    'redirecionamento','pago','deposito_judicial','expedicao_alvara',
                    'alvara_pendente_assinatura','encerrada') THEN
    RETURN jsonb_build_object('ok',false,'motivo','fase_invalida',
      'mensagem','Fases: ajuizada, prazo_pagamento, pedido_penhora, sisbajud, penhora_negativa, redirecionamento, pago, deposito_judicial, expedicao_alvara, alvara_pendente_assinatura, encerrada.');
  END IF;

  v_proc := public._resolver_processo(p_process_id, p_processo_numero);
  IF v_proc IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','processo_nao_encontrado_ou_ambiguo'); END IF;

  SELECT e.id, e.fase INTO v_exec, v_de FROM public.execucoes e WHERE e.process_id=v_proc;
  IF v_exec IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','execucao_nao_iniciada',
      'mensagem','Use iniciar_execucao primeiro para este processo.');
  END IF;

  UPDATE public.execucoes SET fase=v_para, updated_at=now() WHERE id=v_exec;
  INSERT INTO public.execucao_eventos (execucao_id, fase_de, fase_para, observacao, created_by)
  VALUES (v_exec, v_de, v_para, nullif(btrim(coalesce(p_observacao,'')),''), auth.uid());

  SELECT p.process_number, p.client_id INTO v_num, v_cli FROM public.processes p WHERE p.id=v_proc;

  -- "pedir alvará → conecta ao fluxo de diligência existente": nasce pendência
  IF v_para = 'expedicao_alvara' THEN
    v_task := public.criar_pendencia('alvara','Alvará: expedição pedida — processo '||coalesce(v_num,'?'),
      v_cli, coalesce(nullif(btrim(coalesce(p_observacao,'')),''),'Acompanhar expedição do alvará.'),
      auth.uid(), NULL, NULL, 'kanban_pendencias');
  END IF;

  RETURN jsonb_build_object('ok',true,'processo',v_num,'fase_anterior',v_de,'fase_atual',v_para,
    'pendencia_alvara_criada',(v_task IS NOT NULL));
END; $$;

CREATE OR REPLACE FUNCTION public.consultar_execucoes(
  p_fase text DEFAULT NULL, p_responsavel text DEFAULT NULL, p_processo_numero text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_out jsonb;
BEGIN
  IF NOT (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
           'processo',p.process_number,'cliente',p.client_name,'fase',e.fase,
           'reu',e.reu_nome,'reu_tipo',e.reu_tipo,'responsavel',coalesce(e.responsavel_nome,'?'),
           'valor',e.valor_execucao,'proxima_revisao',e.proxima_revisao,
           'ultima_movimentacao',(SELECT max(ev.created_at) FROM public.execucao_eventos ev WHERE ev.execucao_id=e.id))
         ORDER BY e.updated_at DESC)
    INTO v_out
  FROM public.execucoes e JOIN public.processes p ON p.id=e.process_id
  WHERE (p_fase IS NULL OR e.fase = lower(btrim(p_fase)))
    AND (p_responsavel IS NULL OR e.responsavel_nome ILIKE '%'||btrim(p_responsavel)||'%')
    AND (p_processo_numero IS NULL OR p.process_number ILIKE '%'||btrim(p_processo_numero)||'%');
  RETURN jsonb_build_object('ok',true,'execucoes',coalesce(v_out,'[]'::jsonb));
END; $$;

REVOKE EXECUTE ON FUNCTION public.iniciar_execucao(uuid,text,text,text,text,numeric,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.atualizar_fase_execucao(text,uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consultar_execucoes(text,text,text) FROM PUBLIC, anon;

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, tool_schema, sort_order, is_active) VALUES
('iniciar_execucao','Iniciar execução no processo',
 'Cria o pipeline de execução para um processo (fase, réu, responsável, valor).',
 'acao','🔧',
 '{"name":"iniciar_execucao","description":"Inicia o acompanhamento de execução de um processo: fase inicial, réu/parte contrária, responsável (ex.: Daiane, Rodrigo) e valor. Um processo tem no máximo uma execução.","parameters":{"type":"object","properties":{"process_id":{"type":"string"},"processo_numero":{"type":"string","description":"Número do processo (resolve se único)."},"reu_nome":{"type":"string"},"reu_tipo":{"type":"string","description":"sindicato, banco, empresa, pessoa_fisica ou outro."},"responsavel_nome":{"type":"string","description":"Quem toca a execução (texto livre até os usuários existirem)."},"valor":{"type":"number"},"fase":{"type":"string","description":"Fase inicial; default ajuizada."},"observacao":{"type":"string"}}}}'::jsonb, 120, true),
('atualizar_fase_execucao','Atualizar fase da execução',
 'Move a execução de fase (penhora negativa, pago, alvará...) registrando a linha do tempo.',
 'acao','🔧',
 '{"name":"atualizar_fase_execucao","description":"Muda a fase da execução de um processo e registra o evento na linha do tempo. Fases: ajuizada, prazo_pagamento, pedido_penhora, sisbajud, penhora_negativa, redirecionamento, pago, deposito_judicial, expedicao_alvara, alvara_pendente_assinatura, encerrada. Ao entrar em expedicao_alvara, nasce pendência de alvará.","parameters":{"type":"object","required":["fase"],"properties":{"fase":{"type":"string"},"process_id":{"type":"string"},"processo_numero":{"type":"string"},"observacao":{"type":"string"}}}}'::jsonb, 121, true),
('consultar_execucoes','Consultar execuções',
 'Lista execuções por fase, responsável ou processo.',
 'consulta','🔎',
 '{"name":"consultar_execucoes","description":"Lista as execuções em andamento: por fase (ex.: quais estão em penhora?), por responsável (ex.: execuções da Daiane) ou por processo.","parameters":{"type":"object","properties":{"fase":{"type":"string"},"responsavel":{"type":"string"},"processo_numero":{"type":"string"}}}}'::jsonb, 122, true);

UPDATE public.agents
   SET allowed_tools = allowed_tools || ARRAY['iniciar_execucao','atualizar_fase_execucao','consultar_execucoes']
 WHERE allowed_tools @> ARRAY['registrar_relacao_bancaria']
   AND NOT allowed_tools @> ARRAY['iniciar_execucao'];
