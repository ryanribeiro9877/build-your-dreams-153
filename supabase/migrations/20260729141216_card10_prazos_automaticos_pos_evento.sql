-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (29/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260729141216), então bate byte a byte com o que foi aplicado.
--
-- ATENÇÃO: esta versão de `registrar_evento_processual` NÃO grava `process_id` nas
-- pendências. Quem consertou isso foi a migração POSTERIOR
-- 20260729141704_motores23_fix_process_id_em_pendencias, que reescreve a função.
-- A versão viva em produção é a de lá — a ordem dos espelhos (pelo version) é o
-- que reconstrói o estado correto.
-- ============================================================================

-- CARD 10 (Motor 3) — Prazos legais automáticos pós-evento.
-- sentença procedente → 5 dias úteis (embargos) + 10 dias úteis (recurso), a monitorar;
-- execução ajuizada → 15 dias úteis (pagamento) + inicia/avança o pipeline do Card 8.
-- Prazos nascem como pendências com data_fatal (trilho vivo do dashboard).
-- LIMITAÇÃO DECLARADA: dias úteis = seg–sex, SEM feriados (não há tabela de feriados;
-- criar uma é melhoria futura — nunca estimar feriado silenciosamente).
-- Vencimento do prazo de recurso sem ação → sugestão "ajuizar execução" (no cron diário).

CREATE OR REPLACE FUNCTION public.somar_dias_uteis(p_inicio date, p_dias int)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $$
DECLARE v date := p_inicio; i int := 0;
BEGIN
  WHILE i < p_dias LOOP
    v := v + 1;
    IF extract(isodow FROM v) < 6 THEN i := i + 1; END IF;
  END LOOP;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_evento_processual(
  p_evento text, p_process_id uuid DEFAULT NULL, p_processo_numero text DEFAULT NULL,
  p_data_evento date DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_proc uuid; v_num text; v_cli uuid; v_ev text; v_data date;
        v_prazos jsonb := '[]'::jsonb; d1 date; d2 date; v_exec uuid;
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
    d1 := public.somar_dias_uteis(v_data, 5);   -- embargos
    d2 := public.somar_dias_uteis(v_data, 10);  -- recurso
    PERFORM public.criar_pendencia('prazo_embargos',
      'Prazo embargos (5 d.u.) — processo '||coalesce(v_num,'?'), v_cli,
      'Sentença procedente em '||v_data||'. Monitorar se o réu embarga até '||d1||'. (Dias úteis sem feriados — conferir calendário.)',
      auth.uid(), d1::timestamptz, d1, 'kanban_pendencias');
    PERFORM public.criar_pendencia('prazo_recurso',
      'Prazo recurso (10 d.u.) — processo '||coalesce(v_num,'?'), v_cli,
      'Sentença procedente em '||v_data||'. Monitorar se o réu recorre até '||d2||'. Vencido sem recurso → ajuizar execução. (Dias úteis sem feriados — conferir calendário.)',
      auth.uid(), d2::timestamptz, d2, 'kanban_pendencias');
    v_prazos := jsonb_build_array(
      jsonb_build_object('tipo','prazo_embargos','data_fatal',d1),
      jsonb_build_object('tipo','prazo_recurso','data_fatal',d2));

  ELSIF v_ev = 'execucao_ajuizada' THEN
    d1 := public.somar_dias_uteis(v_data, 15);  -- pagamento
    PERFORM public.criar_pendencia('prazo_pagamento_execucao',
      'Prazo pagamento execução (15 d.u.) — processo '||coalesce(v_num,'?'), v_cli,
      'Execução ajuizada em '||v_data||'. Réu tem até '||d1||' para pagar. (Dias úteis sem feriados — conferir calendário.)',
      auth.uid(), d1::timestamptz, d1, 'kanban_pendencias');
    v_prazos := jsonb_build_array(jsonb_build_object('tipo','prazo_pagamento_execucao','data_fatal',d1));

    -- conecta ao pipeline do Card 8: cria ou avança para prazo_pagamento
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

-- Sugestão pós-vencimento: prazo_recurso vencido e ainda aberto → pendência "ajuizar execução"
CREATE OR REPLACE FUNCTION public.sugerir_execucao_pos_prazo()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r record; v int := 0;
BEGIN
  FOR r IN
    SELECT t.process_id, t.client_id, p.process_number
      FROM public.user_tasks t JOIN public.processes p ON p.id=t.process_id
     WHERE t.is_pendencia AND t.pendencia_tipo='prazo_recurso'
       AND t.data_fatal < current_date
       AND t.completed_at IS NULL AND t.cancelled_at IS NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.user_tasks s
                    WHERE s.is_pendencia AND s.pendencia_tipo='sugestao_ajuizar_execucao'
                      AND s.process_id=r.process_id
                      AND s.completed_at IS NULL AND s.cancelled_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.execucoes e WHERE e.process_id=r.process_id) THEN
      PERFORM public.criar_pendencia('sugestao_ajuizar_execucao',
        'Sugerido: ajuizar execução — processo '||coalesce(r.process_number,'?'),
        r.client_id,
        'Prazo de recurso venceu sem recurso registrado. Avaliar ajuizamento da execução.',
        NULL, now(), NULL, 'kanban_pendencias');
      v := v + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'sugestoes_criadas',v);
END; $$;
REVOKE EXECUTE ON FUNCTION public.sugerir_execucao_pos_prazo() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('sugerir_execucao_pos_prazo_daily','40 10 * * *',
  $$SELECT public.sugerir_execucao_pos_prazo();$$);

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, tool_schema, sort_order, is_active) VALUES
('registrar_evento_processual','Registrar evento processual (dispara prazos)',
 'Sentença procedente ou execução ajuizada: cria os prazos legais automaticamente (dias úteis).',
 'acao','🔧',
 '{"name":"registrar_evento_processual","description":"Registra um evento processual e dispara os prazos automáticos: sentenca_procedente → prazos de 5 d.u. (embargos) e 10 d.u. (recurso); execucao_ajuizada → prazo de 15 d.u. (pagamento) + inicia/avança o pipeline de execução. Dias úteis calculados sem feriados — sempre avisar o usuário para conferir o calendário forense.","parameters":{"type":"object","required":["evento"],"properties":{"evento":{"type":"string","description":"sentenca_procedente ou execucao_ajuizada."},"process_id":{"type":"string"},"processo_numero":{"type":"string"},"data_evento":{"type":"string","description":"YYYY-MM-DD; default hoje."},"observacao":{"type":"string"}}}}'::jsonb, 124, true);

UPDATE public.agents
   SET allowed_tools = allowed_tools || ARRAY['registrar_evento_processual']
 WHERE allowed_tools @> ARRAY['registrar_relacao_bancaria']
   AND NOT allowed_tools @> ARRAY['registrar_evento_processual'];
