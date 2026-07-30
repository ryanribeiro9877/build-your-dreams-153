-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730133038), então bate byte a byte com o que está no ar.
--
-- ATENÇÃO — ORDEM DE MIGRAÇÃO: esta migração REESCREVE cumprir_diligencia
-- (criada em 20260730111918 e reescrita em 20260730112204). Como esta é a
-- version MAIOR, a versão VIVA de cumprir_diligencia é a DESTE arquivo.
-- ============================================================================
-- RESPOSTA DO RODRIGO — ITEM 4.5: "não" — NÃO manter a trava de protocolo obrigatório.
-- Decisão do dono do processo, acatada. Mas o sinal não desaparece: cumprir sem protocolo
-- passa a ser PERMITIDO e DECLARADO no retorno (sem_protocolo=true + aviso), para que a falta
-- de prova seja visível em vez de silenciosa. A planilha dele mesma dizia "guardar protocolo";
-- se um dia quiserem a trava de volta, é uma linha.
-- Itens 4.1/4.2/4.3 respondidos "sim": validade de procuração 12 meses, aviso 30 dias e régua
-- de lembrete D-7/D-3/D-1/D-0 deixam de ser suposição e passam a ser regra confirmada.
-- Item 4.4 "somente o jurídico": o gate atual de diligências já é exatamente esse — nada muda.
CREATE OR REPLACE FUNCTION public.cumprir_diligencia(
  p_diligencia_id uuid, p_protocolo text DEFAULT NULL, p_resultado text DEFAULT NULL,
  p_rediligenciar_em date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r record; v_nova uuid; v_task uuid; v_fechadas int := 0; v_sem_prot boolean;
BEGIN
  IF NOT (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;

  SELECT * INTO r FROM public.diligencias WHERE id = p_diligencia_id;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','diligencia_nao_encontrada'); END IF;
  IF r.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok',false,'motivo','diligencia_ja_encerrada','status_atual',r.status);
  END IF;

  v_sem_prot := (nullif(btrim(coalesce(p_protocolo,'')),'') IS NULL);

  UPDATE public.diligencias SET
    status='cumprida', protocolo = nullif(btrim(coalesce(p_protocolo,'')),''),
    resultado = nullif(btrim(coalesce(p_resultado,'')),''),
    cumprida_em = current_date,
    notes = CASE WHEN v_sem_prot AND r.tipo='balcao_virtual'
                 THEN coalesce(r.notes||E'\n','')||'[cumprida sem protocolo em '||current_date||']'
                 ELSE r.notes END,
    updated_at = now()
  WHERE id = p_diligencia_id;

  IF r.pendencia_task_id IS NOT NULL THEN
    UPDATE public.user_tasks t SET completed_at = now(), updated_at = now()
     WHERE t.id = r.pendencia_task_id AND t.completed_at IS NULL AND t.cancelled_at IS NULL;
    GET DIAGNOSTICS v_fechadas = ROW_COUNT;
  END IF;

  IF p_rediligenciar_em IS NOT NULL THEN
    INSERT INTO public.diligencias
      (process_id, process_numero_texto, client_id, vara, tipo, descricao, prazo,
       responsavel_nome, diligencia_origem_id, notes, created_by)
    VALUES (r.process_id, r.process_numero_texto, r.client_id, r.vara, r.tipo, r.descricao,
            p_rediligenciar_em, r.responsavel_nome, r.id,
            'Rediligência gerada ao cumprir a diligência de '||current_date||'.', auth.uid())
    RETURNING id INTO v_nova;

    v_task := public.criar_pendencia('diligencia',
      'Diligência ('||r.tipo||') — processo '||coalesce(r.process_numero_texto,
        (SELECT p.process_number FROM public.processes p WHERE p.id=r.process_id),'?'),
      r.client_id, r.descricao||' [rediligência]', auth.uid(),
      p_rediligenciar_em::timestamptz, p_rediligenciar_em, 'kanban_pendencias');
    IF r.process_id IS NOT NULL THEN
      UPDATE public.user_tasks SET process_id = r.process_id WHERE id = v_task;
    END IF;
    UPDATE public.diligencias SET pendencia_task_id = v_task WHERE id = v_nova;
  END IF;

  RETURN jsonb_build_object('ok',true,'diligencia_id',p_diligencia_id,'protocolo',p_protocolo,
    'sem_protocolo',v_sem_prot,
    'pendencia_fechada',(v_fechadas = 1),
    'rediligencia_id',v_nova,'rediligenciar_em',p_rediligenciar_em,
    'aviso', CASE WHEN v_sem_prot AND r.tipo='balcao_virtual'
                  THEN 'Cumprida SEM número de protocolo — fica sem comprovação do balcão virtual (registrado nas observações).'
                  ELSE NULL END);
END; $$;
REVOKE EXECUTE ON FUNCTION public.cumprir_diligencia(uuid,text,text,date) FROM PUBLIC, anon;

UPDATE public.tool_catalog SET tool_schema = jsonb_set(tool_schema, '{description}',
  to_jsonb('Registra o cumprimento de uma diligência: guarda o protocolo (recomendado no balcão virtual, mas NÃO obrigatório por decisão do Rodrigo em 30/07 — a falta é declarada no retorno e nas observações), o resultado, fecha a pendência de prazo e, se informado, agenda a rediligência ("diligenciar novamente no dia X"), que nasce como diligência nova ligada à original.'::text)),
  updated_at = now()
 WHERE code = 'cumprir_diligencia';