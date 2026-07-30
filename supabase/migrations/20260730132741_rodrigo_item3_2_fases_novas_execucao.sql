-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730132741), então bate byte a byte com o que está no ar.
-- ============================================================================
-- RESPOSTA DO RODRIGO — ITEM 3.2: "criar essas definições que você mandou".
-- A planilha tem estados que as 11 fases não cobriam: arquivado (11 casos), suspenso (2),
-- extinta (1) e pagamento parcial ("UMA PARTE", 1 caso). Agora existem — nada de force-fit.
-- Aditivo: nenhuma linha existente afetada (a tabela está vazia em produção).
ALTER TABLE public.execucoes DROP CONSTRAINT execucoes_fase_check;
ALTER TABLE public.execucoes ADD CONSTRAINT execucoes_fase_check CHECK (fase IN
  ('ajuizada','prazo_pagamento','pedido_penhora','sisbajud','penhora_negativa',
   'redirecionamento','pago','pago_parcial','deposito_judicial','expedicao_alvara',
   'alvara_pendente_assinatura','arquivada','suspensa','extinta','encerrada'));

-- normalizador aceita como a planilha escreve
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
  v_para := CASE WHEN v_para IN ('penhora negativa','penhora_negativa') THEN 'penhora_negativa'
                 WHEN v_para IN ('pedido de penhora','penhora','pedido_penhora') THEN 'pedido_penhora'
                 WHEN v_para IN ('prazo de pagamento','15 dias','prazo_pagamento') THEN 'prazo_pagamento'
                 WHEN v_para IN ('deposito judicial','depósito judicial','deposito_judicial') THEN 'deposito_judicial'
                 WHEN v_para IN ('expedicao de alvara','expedição de alvará','pedir alvara','pedir alvará','expedicao_alvara') THEN 'expedicao_alvara'
                 WHEN v_para IN ('alvara pendente assinatura','alvará pendente','alvara_pendente_assinatura') THEN 'alvara_pendente_assinatura'
                 WHEN v_para IN ('uma parte','pago em parte','pago parcial','parcial','pago_parcial') THEN 'pago_parcial'
                 WHEN v_para IN ('arquivado','arquivada','processo arquivado') THEN 'arquivada'
                 WHEN v_para IN ('suspenso','suspensa','processo suspenso') THEN 'suspensa'
                 WHEN v_para IN ('extinta','extinto','execucao extinta','execução extinta') THEN 'extinta'
                 ELSE v_para END;
  IF v_para NOT IN ('ajuizada','prazo_pagamento','pedido_penhora','sisbajud','penhora_negativa',
                    'redirecionamento','pago','pago_parcial','deposito_judicial','expedicao_alvara',
                    'alvara_pendente_assinatura','arquivada','suspensa','extinta','encerrada') THEN
    RETURN jsonb_build_object('ok',false,'motivo','fase_invalida',
      'mensagem','Fases: ajuizada, prazo_pagamento, pedido_penhora, sisbajud, penhora_negativa, redirecionamento, pago, pago_parcial, deposito_judicial, expedicao_alvara, alvara_pendente_assinatura, arquivada, suspensa, extinta, encerrada.');
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

  IF v_para = 'expedicao_alvara' THEN
    v_task := public.criar_pendencia('alvara','Alvará: expedição pedida — processo '||coalesce(v_num,'?'),
      v_cli, coalesce(nullif(btrim(coalesce(p_observacao,'')),''),'Acompanhar expedição do alvará.'),
      auth.uid(), NULL, NULL, 'kanban_pendencias');
    UPDATE public.user_tasks SET process_id = v_proc WHERE id = v_task;
  END IF;

  RETURN jsonb_build_object('ok',true,'processo',v_num,'fase_anterior',v_de,'fase_atual',v_para,
    'pendencia_alvara_criada',(v_task IS NOT NULL),
    'nota', CASE WHEN v_para='pago_parcial' THEN 'Pagamento parcial: execução segue viva para o saldo.'
                 WHEN v_para IN ('arquivada','suspensa') THEN 'Fase não-terminal: o tickler de revisão continua vigiando.'
                 ELSE NULL END);
END; $$;
REVOKE EXECUTE ON FUNCTION public.atualizar_fase_execucao(text,uuid,text,text) FROM PUBLIC, anon;

UPDATE public.tool_catalog SET tool_schema = jsonb_set(tool_schema, '{description}',
  to_jsonb('Muda a fase da execução de um processo e registra o evento na linha do tempo. Fases: ajuizada, prazo_pagamento, pedido_penhora, sisbajud, penhora_negativa, redirecionamento, pago, pago_parcial (pago em parte), deposito_judicial, expedicao_alvara, alvara_pendente_assinatura, arquivada, suspensa, extinta, encerrada. Ao entrar em expedicao_alvara, nasce pendência de alvará. arquivada e suspensa NÃO encerram: o tickler continua vigiando.'::text)),
  updated_at = now()
 WHERE code = 'atualizar_fase_execucao';