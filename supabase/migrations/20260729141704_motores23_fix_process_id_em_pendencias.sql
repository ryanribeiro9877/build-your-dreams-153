-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (29/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260729141704), então bate byte a byte com o que está no ar.
--
-- É a ÚLTIMA das 7 dos Motores 2/3 e reescreve 3 funções criadas pelas anteriores
-- (gerar_pendencias_revisao_execucao, registrar_evento_processual,
-- atualizar_fase_execucao). Estas são as versões VIVAS em produção — os espelhos
-- dos cards 9 e 10 têm as versões anteriores, e é a ordem por `version` que
-- reconstrói o estado correto.
-- ============================================================================

-- FIX (pego na prova de 29/07): criar_pendencia NÃO grava process_id — o INSERT dela
-- não inclui a coluna. Consequências reais: (a) dedup do tickler nunca casava →
-- pendência de revisão duplicaria TODO DIA; (b) remarcar_revisao_execucao não fechava
-- a pendência aberta (provado: abertas=1, fechadas=0); (c) sugerir_execucao_pos_prazo
-- faz JOIN por process_id → nunca dispararia.
-- Fix cirúrgico: capturar o id devolvido por criar_pendencia e gravar process_id
-- em seguida, nas 3 funções que criam pendência ligada a processo.

CREATE OR REPLACE FUNCTION public.gerar_pendencias_revisao_execucao()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r record; v_criadas int := 0; v_task uuid;
BEGIN
  FOR r IN
    SELECT e.id, e.process_id, e.proxima_revisao, e.revisao_intervalo_dias,
           e.responsavel_user_id, p.process_number, p.client_id
      FROM public.execucoes e JOIN public.processes p ON p.id = e.process_id
     WHERE e.fase <> 'encerrada'
       AND e.proxima_revisao IS NOT NULL
       AND e.proxima_revisao <= current_date
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.user_tasks t
       WHERE t.is_pendencia AND t.pendencia_tipo='revisao_execucao'
         AND t.process_id = r.process_id
         AND t.completed_at IS NULL AND t.cancelled_at IS NULL
    ) THEN
      v_task := public.criar_pendencia('revisao_execucao',
        'Revisar execução — processo '||coalesce(r.process_number,'?'),
        r.client_id,
        'Revisão cíclica: verificar depósito judicial / movimentação. Após olhar, remarque ("volta em N dias") ou mude a fase.',
        r.responsavel_user_id, now(), r.proxima_revisao, 'kanban_pendencias');
      UPDATE public.user_tasks SET process_id = r.process_id WHERE id = v_task;
      v_criadas := v_criadas + 1;
    END IF;

    UPDATE public.execucoes e2
       SET proxima_revisao = CASE WHEN e2.revisao_intervalo_dias IS NOT NULL
                                  THEN current_date + e2.revisao_intervalo_dias
                                  ELSE NULL END,
           updated_at = now()
     WHERE e2.id = r.id;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'pendencias_criadas',v_criadas,'executado_em',now());
END; $$;
REVOKE EXECUTE ON FUNCTION public.gerar_pendencias_revisao_execucao() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_evento_processual(
  p_evento text, p_process_id uuid DEFAULT NULL, p_processo_numero text DEFAULT NULL,
  p_data_evento date DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_proc uuid; v_num text; v_cli uuid; v_ev text; v_data date;
        v_prazos jsonb := '[]'::jsonb; d1 date; d2 date; v_exec uuid; v_task uuid;
BEGIN
  IF NOT (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  v_ev := lower(btrim(coalesce(p_evento,'')));
  v_ev := CASE WHEN v_ev IN ('sentenca_procedente','sentença procedente','sentenca procedente','procedente') THEN 'sentenca_procedente'
               WHEN v_ev IN ('execucao_ajuizada','execução ajuizada','execucao ajuizada','execucao protocolada','execução protocolada') THEN 'execucao_ajuizada'
               ELSE NULL END;
  IF v_ev IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','evento_invalido',
      'mensagem','Eventos suportados: sentenca_procedente, execucao_ajuizada.');
  END IF;

  v_proc := public._resolver_processo(p_process_id, p_processo_numero);
  IF v_proc IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','processo_nao_encontrado_ou_ambiguo'); END IF;
  SELECT p.process_number, p.client_id INTO v_num, v_cli FROM public.processes p WHERE p.id=v_proc;
  v_data := coalesce(p_data_evento, current_date);

  IF v_ev = 'sentenca_procedente' THEN
    d1 := public.somar_dias_uteis(v_data, 5);
    d2 := public.somar_dias_uteis(v_data, 10);
    v_task := public.criar_pendencia('prazo_embargos',
      'Prazo embargos (5 d.u.) — processo '||coalesce(v_num,'?'), v_cli,
      'Sentença procedente em '||v_data||'. Monitorar se o réu embarga até '||d1||'. (Dias úteis sem feriados — conferir calendário.)',
      auth.uid(), d1::timestamptz, d1, 'kanban_pendencias');
    UPDATE public.user_tasks SET process_id = v_proc WHERE id = v_task;
    v_task := public.criar_pendencia('prazo_recurso',
      'Prazo recurso (10 d.u.) — processo '||coalesce(v_num,'?'), v_cli,
      'Sentença procedente em '||v_data||'. Monitorar se o réu recorre até '||d2||'. Vencido sem recurso → ajuizar execução. (Dias úteis sem feriados — conferir calendário.)',
      auth.uid(), d2::timestamptz, d2, 'kanban_pendencias');
    UPDATE public.user_tasks SET process_id = v_proc WHERE id = v_task;
    v_prazos := jsonb_build_array(
      jsonb_build_object('tipo','prazo_embargos','data_fatal',d1),
      jsonb_build_object('tipo','prazo_recurso','data_fatal',d2));

  ELSIF v_ev = 'execucao_ajuizada' THEN
    d1 := public.somar_dias_uteis(v_data, 15);
    v_task := public.criar_pendencia('prazo_pagamento_execucao',
      'Prazo pagamento execução (15 d.u.) — processo '||coalesce(v_num,'?'), v_cli,
      'Execução ajuizada em '||v_data||'. Réu tem até '||d1||' para pagar. (Dias úteis sem feriados — conferir calendário.)',
      auth.uid(), d1::timestamptz, d1, 'kanban_pendencias');
    UPDATE public.user_tasks SET process_id = v_proc WHERE id = v_task;
    v_prazos := jsonb_build_array(jsonb_build_object('tipo','prazo_pagamento_execucao','data_fatal',d1));

    SELECT e.id INTO v_exec FROM public.execucoes e WHERE e.process_id=v_proc;
    IF v_exec IS NULL THEN
      INSERT INTO public.execucoes (process_id, fase, notes, created_by)
      VALUES (v_proc, 'prazo_pagamento', 'Criada automaticamente por registrar_evento_processual.', auth.uid())
      RETURNING id INTO v_exec;
      INSERT INTO public.execucao_eventos (execucao_id, fase_de, fase_para, observacao, created_by)
      VALUES (v_exec, NULL, 'prazo_pagamento', 'Execução ajuizada em '||v_data||'.', auth.uid());
    ELSE
      UPDATE public.execucoes SET fase='prazo_pagamento', updated_at=now() WHERE id=v_exec AND fase='ajuizada';
      INSERT INTO public.execucao_eventos (execucao_id, fase_de, fase_para, observacao, created_by)
      VALUES (v_exec, 'ajuizada', 'prazo_pagamento', 'Execução ajuizada em '||v_data||' (evento).', auth.uid());
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'processo',v_num,'evento',v_ev,'prazos_criados',v_prazos,
    'aviso','Dias úteis calculados sem feriados — conferir calendário forense.');
END; $$;
REVOKE EXECUTE ON FUNCTION public.registrar_evento_processual(text,uuid,text,date,text) FROM PUBLIC, anon;

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

  IF v_para = 'expedicao_alvara' THEN
    v_task := public.criar_pendencia('alvara','Alvará: expedição pedida — processo '||coalesce(v_num,'?'),
      v_cli, coalesce(nullif(btrim(coalesce(p_observacao,'')),''),'Acompanhar expedição do alvará.'),
      auth.uid(), NULL, NULL, 'kanban_pendencias');
    UPDATE public.user_tasks SET process_id = v_proc WHERE id = v_task;
  END IF;

  RETURN jsonb_build_object('ok',true,'processo',v_num,'fase_anterior',v_de,'fase_atual',v_para,
    'pendencia_alvara_criada',(v_task IS NOT NULL));
END; $$;
REVOKE EXECUTE ON FUNCTION public.atualizar_fase_execucao(text,uuid,text,text) FROM PUBLIC, anon;
