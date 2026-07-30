-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730111918), então bate byte a byte com o que está no ar.
--
-- ATENÇÃO — ORDEM DE MIGRAÇÃO: as funções registrar_diligencia e cumprir_diligencia
-- criadas AQUI foram REESCRITAS depois. As versões VIVAS são as das migrações de
-- version MAIOR: registrar_diligencia = 20260730112204;
-- cumprir_diligencia = 20260730133038. consultar_diligencias segue sendo esta.
-- ============================================================================
-- CARD 11 (P2) — Diligências de balcão virtual como tipo dedicado.
-- Fonte: DILIGÊNCIAS.xlsx — 329 linhas na aba geral (PROCESSO | DILIGENCIA | "até <data>")
-- + abas por vara (CLIENTE | PROCESSO | TAREFA | ANDAMENTO) com "DILIGENCIAR NOVAMENTE <data>".
-- Duas coisas que a planilha ensina e o sistema não tinha: (1) o PROTOCOLO do balcão virtual
-- ("fazer balcão virtual - guardar protocolo") é o produto da diligência, não um detalhe;
-- (2) diligência re-nasce (rediligenciar) — mesma mecânica do tickler do Card 9.
-- PONTE DECLARADA: process_numero_texto existe porque a base tem 0 processos e as 329 linhas
-- citam números que ainda não estão cadastrados. Quando o processo entrar, o vínculo é feito.
-- GATE: jurídico (advogado/sócio/admin), igual execuções. Se o Rodrigo disser que a recepção
-- também faz balcão virtual, o gate muda em 1 linha — decisão dele, não presumida aqui.

CREATE TABLE public.diligencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid REFERENCES public.processes(id) ON DELETE SET NULL,
  process_numero_texto text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  vara text,
  tipo text NOT NULL CHECK (tipo IN
    ('balcao_virtual','concluso_analise','expedicao_alvara','peticao','carta_precatoria','outro')),
  descricao text NOT NULL,
  prazo date,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','cumprida','prejudicada')),
  protocolo text,
  resultado text,
  cumprida_em date,
  diligencia_origem_id uuid REFERENCES public.diligencias(id) ON DELETE SET NULL,
  responsavel_user_id uuid,
  responsavel_nome text,
  notes text,
  is_test boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diligencia_precisa_processo CHECK (process_id IS NOT NULL OR nullif(btrim(coalesce(process_numero_texto,'')),'') IS NOT NULL)
);
CREATE INDEX idx_diligencias_pendentes ON public.diligencias(prazo) WHERE status='pendente';
CREATE INDEX idx_diligencias_processo ON public.diligencias(process_id);
CREATE INDEX idx_diligencias_vara ON public.diligencias(vara);

ALTER TABLE public.diligencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diligencias read" ON public.diligencias
  FOR SELECT TO authenticated
  USING (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role));

-- vocabulário de pendência (armadilha 23514 recorrente — aditivo, antes de qualquer INSERT)
ALTER TABLE public.user_tasks DROP CONSTRAINT user_tasks_pendencia_tipo_chk;
ALTER TABLE public.user_tasks ADD CONSTRAINT user_tasks_pendencia_tipo_chk
  CHECK (pendencia_tipo IS NULL OR pendencia_tipo = ANY (ARRAY[
    'documentacao','comprovante_endereco','senha_inss','reset_inss','extratos',
    'falta_documentacao','audiencia','reuniao','andamento','whatsapp','ligacao','outro',
    'reclamacao_administrativa','recuperacao_senha_gov','conversao_conta_gov','alvara',
    'revisao_execucao','prazo_embargos','prazo_recurso','prazo_pagamento_execucao',
    'sugestao_ajuizar_execucao',
    'diligencia'
  ]));

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
DECLARE r record; v_nova uuid; v_task uuid;
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

  -- fecha a pendência de prazo aberta desta diligência
  UPDATE public.user_tasks t SET completed_at = now(), updated_at = now()
   WHERE t.is_pendencia AND t.pendencia_tipo='diligencia'
     AND t.completed_at IS NULL AND t.cancelled_at IS NULL
     AND ((r.process_id IS NOT NULL AND t.process_id = r.process_id)
          OR (r.process_id IS NULL AND r.client_id IS NOT NULL AND t.client_id = r.client_id))
     AND t.title ILIKE '%'||r.tipo||'%';

  -- "DILIGENCIAR NOVAMENTE <data>": nasce linha nova, a cumprida fica no histórico
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
  END IF;

  RETURN jsonb_build_object('ok',true,'diligencia_id',p_diligencia_id,'protocolo',p_protocolo,
    'rediligencia_id',v_nova,'rediligenciar_em',p_rediligenciar_em);
END; $$;

CREATE OR REPLACE FUNCTION public.consultar_diligencias(
  p_status text DEFAULT 'pendente', p_vara text DEFAULT NULL,
  p_vencendo_ate date DEFAULT NULL, p_processo_numero text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_out jsonb; v_st text;
BEGIN
  IF NOT (public.is_socio_or_advogado() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  v_st := lower(btrim(coalesce(p_status,'pendente')));
  IF v_st NOT IN ('pendente','cumprida','prejudicada','todas') THEN v_st := 'pendente'; END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'id',d.id,
           'processo',coalesce((SELECT p.process_number FROM public.processes p WHERE p.id=d.process_id), d.process_numero_texto),
           'processo_vinculado',(d.process_id IS NOT NULL),
           'cliente',(SELECT cd.full_name FROM public.clients_decrypted cd WHERE cd.id=d.client_id),
           'vara',d.vara,'tipo',d.tipo,'descricao',d.descricao,'prazo',d.prazo,
           'status',d.status,'protocolo',d.protocolo,'responsavel',d.responsavel_nome,
           'vencida',(d.status='pendente' AND d.prazo IS NOT NULL AND d.prazo < current_date))
         ORDER BY d.prazo NULLS LAST)
    INTO v_out
  FROM public.diligencias d
  WHERE (v_st='todas' OR d.status = v_st)
    AND (p_vara IS NULL OR d.vara ILIKE '%'||btrim(p_vara)||'%')
    AND (p_vencendo_ate IS NULL OR (d.prazo IS NOT NULL AND d.prazo <= p_vencendo_ate))
    AND (p_processo_numero IS NULL
         OR coalesce((SELECT p.process_number FROM public.processes p WHERE p.id=d.process_id), d.process_numero_texto)
            ILIKE '%'||btrim(p_processo_numero)||'%');

  RETURN jsonb_build_object('ok',true,'status_filtro',v_st,
    'total',coalesce(jsonb_array_length(v_out),0),'diligencias',coalesce(v_out,'[]'::jsonb));
END; $$;

REVOKE EXECUTE ON FUNCTION public.registrar_diligencia(text,text,uuid,text,text,date,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cumprir_diligencia(uuid,text,text,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consultar_diligencias(text,text,date,text) FROM PUBLIC, anon;

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, tool_schema, sort_order, is_active) VALUES
('registrar_diligencia','Registrar diligência',
 'Registra diligência (balcão virtual, concluso, alvará, petição) com vara e prazo; o prazo vira pendência.',
 'acao','🔧',
 '{"name":"registrar_diligencia","description":"Registra uma diligência a ser feita num processo: balcão virtual, colocar concluso para análise, diligenciar expedição de alvará, juntar petição, carta precatória. Prazo vira pendência automática. Se o processo ainda não estiver cadastrado, a diligência é guardada pelo número informado e avisa.","parameters":{"type":"object","required":["descricao"],"properties":{"descricao":{"type":"string","description":"O que precisa ser feito (ex.: fazer balcão virtual pedindo agilidade na análise)."},"tipo":{"type":"string","description":"balcao_virtual (default), concluso_analise, expedicao_alvara, peticao, carta_precatoria ou outro."},"process_id":{"type":"string"},"processo_numero":{"type":"string","description":"Número do processo."},"vara":{"type":"string","description":"Vara/comarca (ex.: 10ª Vara de Família de Salvador)."},"prazo":{"type":"string","description":"Prazo YYYY-MM-DD (ex.: até 24/07/2026)."},"responsavel_nome":{"type":"string"},"observacao":{"type":"string"}}}}'::jsonb, 140, true),
('cumprir_diligencia','Cumprir diligência (com protocolo)',
 'Marca a diligência como cumprida guardando o protocolo; opcionalmente agenda a rediligência.',
 'acao','🔧',
 '{"name":"cumprir_diligencia","description":"Registra o cumprimento de uma diligência: guarda o PROTOCOLO (obrigatório em balcão virtual — sem protocolo não há prova), o resultado, fecha a pendência de prazo e, se informado, agenda a rediligência (\"diligenciar novamente no dia X\"), que nasce como diligência nova ligada à original.","parameters":{"type":"object","required":["diligencia_id"],"properties":{"diligencia_id":{"type":"string","description":"UUID da diligência (consultar_diligencias)."},"protocolo":{"type":"string","description":"Número do protocolo do balcão virtual/petição."},"resultado":{"type":"string","description":"O que o cartório/juízo respondeu."},"rediligenciar_em":{"type":"string","description":"YYYY-MM-DD — se precisar diligenciar novamente."}}}}'::jsonb, 141, true),
('consultar_diligencias','Consultar diligências',
 'Lista diligências por status, vara, processo ou vencendo até uma data.',
 'consulta','🔎',
 '{"name":"consultar_diligencias","description":"Lista diligências: pendentes (default), cumpridas ou todas; filtra por vara, por processo ou pelas que vencem até uma data. Marca as vencidas.","parameters":{"type":"object","properties":{"status":{"type":"string","description":"pendente, cumprida, prejudicada ou todas."},"vara":{"type":"string"},"vencendo_ate":{"type":"string","description":"YYYY-MM-DD."},"processo_numero":{"type":"string"}}}}'::jsonb, 142, true);

UPDATE public.agents
   SET allowed_tools = allowed_tools || ARRAY['registrar_diligencia','cumprir_diligencia','consultar_diligencias']
 WHERE allowed_tools @> ARRAY['registrar_relacao_bancaria']
   AND NOT allowed_tools @> ARRAY['registrar_diligencia'];