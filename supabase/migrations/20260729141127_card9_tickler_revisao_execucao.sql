-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (29/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260729141127), então bate byte a byte com o que está no ar.
-- ============================================================================

-- CARD 9 (Motor 3) — Tickler "olhar novamente no dia X" (coluna DATA da Execução 2).
-- Rodrigo re-olha cada execução a cada 7–10 dias caçando depósito judicial.
-- Job diário gera a pendência no dia certo; recorrência opcional re-agenda sozinha;
-- remarcar_revisao_execucao é a versão-1-frase ("olhei, nada ainda, volta em 10 dias").
-- Dedup: não cria segunda pendência aberta do mesmo tipo para o mesmo processo.

CREATE OR REPLACE FUNCTION public.gerar_pendencias_revisao_execucao()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r record; v_criadas int := 0; v_num text;
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
      PERFORM public.criar_pendencia('revisao_execucao',
        'Revisar execução — processo '||coalesce(r.process_number,'?'),
        r.client_id,
        'Revisão cíclica: verificar depósito judicial / movimentação. Após olhar, remarque ("volta em N dias") ou mude a fase.',
        r.responsavel_user_id, now(), r.proxima_revisao, 'kanban_pendencias');
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

CREATE OR REPLACE FUNCTION public.remarcar_revisao_execucao(
  p_dias int, p_process_id uuid DEFAULT NULL, p_processo_numero text DEFAULT NULL,
  p_intervalo_recorrente int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_proc uuid; v_num text; v_nova date;
BEGIN
  IF NOT (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 90 THEN
    RETURN jsonb_build_object('ok',false,'motivo','dias_invalido','mensagem','Informe de 1 a 90 dias.');
  END IF;
  v_proc := public._resolver_processo(p_process_id, p_processo_numero);
  IF v_proc IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','processo_nao_encontrado_ou_ambiguo'); END IF;

  v_nova := current_date + p_dias;
  UPDATE public.execucoes e
     SET proxima_revisao = v_nova,
         revisao_intervalo_dias = coalesce(p_intervalo_recorrente, e.revisao_intervalo_dias),
         updated_at = now()
   WHERE e.process_id = v_proc;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','execucao_nao_iniciada'); END IF;

  -- fecha a pendência de revisão aberta (olhou, nada ainda)
  UPDATE public.user_tasks t
     SET completed_at = now(), updated_at = now()
   WHERE t.is_pendencia AND t.pendencia_tipo='revisao_execucao'
     AND t.process_id = v_proc AND t.completed_at IS NULL AND t.cancelled_at IS NULL;

  SELECT process_number INTO v_num FROM public.processes WHERE id=v_proc;
  RETURN jsonb_build_object('ok',true,'processo',v_num,'proxima_revisao',v_nova);
END; $$;
REVOKE EXECUTE ON FUNCTION public.remarcar_revisao_execucao(int,uuid,text,int) FROM PUBLIC, anon;

-- cron diário 07:30 America/Bahia = 10:30 UTC (antes do pendencias_data_fatal_daily 11:00)
SELECT cron.schedule('execucoes_revisao_daily','30 10 * * *',
  $$SELECT public.gerar_pendencias_revisao_execucao();$$);

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, tool_schema, sort_order, is_active) VALUES
('remarcar_revisao_execucao','Remarcar revisão de execução',
 'Fecha a revisão de hoje e agenda a próxima ("olhei, nada ainda, volta em N dias").',
 'acao','🔧',
 '{"name":"remarcar_revisao_execucao","description":"Depois de olhar uma execução: fecha a pendência de revisão aberta e agenda a próxima revisão para daqui a N dias. Opcionalmente fixa recorrência (a cada N dias, automático).","parameters":{"type":"object","required":["dias"],"properties":{"dias":{"type":"integer","description":"Daqui a quantos dias revisar de novo (1–90)."},"process_id":{"type":"string"},"processo_numero":{"type":"string"},"intervalo_recorrente":{"type":"integer","description":"Se informado, toda revisão futura re-agenda sozinha a cada N dias."}}}}'::jsonb, 123, true);

UPDATE public.agents
   SET allowed_tools = allowed_tools || ARRAY['remarcar_revisao_execucao']
 WHERE allowed_tools @> ARRAY['registrar_relacao_bancaria']
   AND NOT allowed_tools @> ARRAY['remarcar_revisao_execucao'];
