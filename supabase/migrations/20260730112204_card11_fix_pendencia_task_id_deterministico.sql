-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730112204), então bate byte a byte com o que está no ar.
--
-- ATENÇÃO — ORDEM DE MIGRAÇÃO: esta migração REESCREVE registrar_diligencia e
-- cumprir_diligencia, criadas em 20260730111918. Para registrar_diligencia a
-- versão VIVA é a DESTE arquivo (version maior que 20260730111918). Para
-- cumprir_diligencia a versão VIVA é a de 20260730133038 (version MAIOR ainda),
-- que remove a trava de protocolo obrigatório.
-- ============================================================================
-- FIX (pego na prova, 29/07): cumprir_diligencia procurava a pendência a fechar por
-- process_id/client_id + título ILIKE tipo. No caminho PONTE (processo ainda não cadastrado)
-- a pendência nasce com client_id E process_id nulos → nada casava e a pendência ficava
-- ABERTA PARA SEMPRE. Medido: abertas=1, fechadas=0 depois de cumprir.
-- Gravidade real: com 0 processos na base, as 329 linhas da planilha cairiam TODAS nesse caminho.
-- Correção: guardar o vínculo (pendencia_task_id) em vez de derivá-lo. Casamento por título
-- era frágil por construção — sai de cena.

ALTER TABLE public.diligencias ADD COLUMN pendencia_task_id uuid REFERENCES public.user_tasks(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.registrar_diligencia(
  p_descricao text, p_tipo text DEFAULT 'balcao_virtual',
  p_process_id uuid DEFAULT NULL, p_processo_numero text DEFAULT NULL,
  p_vara text DEFAULT NULL, p_prazo date DEFAULT NULL,
  p_responsavel_nome text DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_tipo text; v_proc uuid; v_cli uuid; v_num text; v_id uuid; v_task uuid; v_ponte boolean := false;
BEGIN
  IF NOT (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para registrar diligência' USING errcode='42501';
  END IF;
  IF nullif(btrim(coalesce(p_descricao,'')),'') IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','descricao_obrigatoria');
  END IF;

  v_tipo := lower(btrim(coalesce(p_tipo,'balcao_virtual')));
  v_tipo := CASE WHEN v_tipo IN ('balcao virtual','balcao_virtual','balcão virtual','balcao') THEN 'balcao_virtual'
                 WHEN v_tipo IN ('concluso','concluso para analise','concluso_analise','colocar concluso') THEN 'concluso_analise'
                 WHEN v_tipo IN ('alvara','alvará','expedicao de alvara','expedição de alvará','expedicao_alvara') THEN 'expedicao_alvara'
                 WHEN v_tipo IN ('peticao','petição','juntar peticao') THEN 'peticao'
                 WHEN v_tipo IN ('carta precatoria','carta precatória','carta_precatoria') THEN 'carta_precatoria'
                 WHEN v_tipo IN ('outro') THEN 'outro'
                 ELSE NULL END;
  IF v_tipo IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','tipo_invalido',
      'mensagem','Tipos: balcao_virtual, concluso_analise, expedicao_alvara, peticao, carta_precatoria, outro.');
  END IF;

  v_proc := public._resolver_processo(p_process_id, p_processo_numero);
  IF v_proc IS NULL AND nullif(btrim(coalesce(p_processo_numero,'')),'') IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','processo_nao_informado',
      'mensagem','Informe o número do processo (a diligência sempre pertence a um processo).');
  END IF;
  IF v_proc IS NULL THEN v_ponte := true; END IF;
  IF v_proc IS NOT NULL THEN
    SELECT p.client_id, p.process_number INTO v_cli, v_num FROM public.processes p WHERE p.id=v_proc;
  END IF;

  INSERT INTO public.diligencias
    (process_id, process_numero_texto, client_id, vara, tipo, descricao, prazo,
     responsavel_nome, notes, created_by)
  VALUES (v_proc, CASE WHEN v_ponte THEN btrim(p_processo_numero) ELSE NULL END, v_cli,
          nullif(btrim(coalesce(p_vara,'')),''), v_tipo, btrim(p_descricao), p_prazo,
          nullif(btrim(coalesce(p_responsavel_nome,'')),''),
          nullif(btrim(coalesce(p_observacao,'')),''), auth.uid())
  RETURNING id INTO v_id;

  IF p_prazo IS NOT NULL THEN
    v_task := public.criar_pendencia('diligencia',
      'Diligência ('||v_tipo||') — processo '||coalesce(v_num, btrim(p_processo_numero), '?'),
      v_cli, btrim(p_descricao)||coalesce(' | Vara: '||nullif(btrim(coalesce(p_vara,'')),''),''),
      auth.uid(), p_prazo::timestamptz, p_prazo, 'kanban_pendencias');
    IF v_proc IS NOT NULL THEN
      UPDATE public.user_tasks SET process_id = v_proc WHERE id = v_task;
    END IF;
    UPDATE public.diligencias SET pendencia_task_id = v_task WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok',true,'diligencia_id',v_id,'tipo',v_tipo,
    'processo',coalesce(v_num, btrim(p_processo_numero)),
    'processo_vinculado',(v_proc IS NOT NULL),
    'pendencia_prazo_criada',(v_task IS NOT NULL),
    'aviso', CASE WHEN v_ponte THEN 'Processo ainda não cadastrado no sistema — diligência guardada pelo número. Vincular quando o processo for criado.' ELSE NULL END);
END; $$;

CREATE OR REPLACE FUNCTION public.cumprir_diligencia(
  p_diligencia_id uuid, p_protocolo text DEFAULT NULL, p_resultado text DEFAULT NULL,
  p_rediligenciar_em date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r record; v_nova uuid; v_task uuid; v_fechadas int := 0;
BEGIN
  IF NOT (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;

  SELECT * INTO r FROM public.diligencias WHERE id = p_diligencia_id;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','diligencia_nao_encontrada'); END IF;
  IF r.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok',false,'motivo','diligencia_ja_encerrada','status_atual',r.status);
  END IF;
  IF r.tipo = 'balcao_virtual' AND nullif(btrim(coalesce(p_protocolo,'')),'') IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','protocolo_obrigatorio',
      'mensagem','Balcão virtual sem protocolo não tem prova. Informe o número do protocolo.');
  END IF;

  UPDATE public.diligencias SET
    status='cumprida', protocolo = nullif(btrim(coalesce(p_protocolo,'')),''),
    resultado = nullif(btrim(coalesce(p_resultado,'')),''),
    cumprida_em = current_date, updated_at = now()
  WHERE id = p_diligencia_id;

  -- fecha a pendência pelo VÍNCULO GUARDADO (funciona também no caminho ponte)
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
    'pendencia_fechada',(v_fechadas = 1),
    'rediligencia_id',v_nova,'rediligenciar_em',p_rediligenciar_em);
END; $$;

REVOKE EXECUTE ON FUNCTION public.registrar_diligencia(text,text,uuid,text,text,date,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cumprir_diligencia(uuid,text,text,date) FROM PUBLIC, anon;