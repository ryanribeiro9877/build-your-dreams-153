-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730112025), então bate byte a byte com o que está no ar.
-- ============================================================================

-- CARD 14 (P2) — Apólices SUSEP como registro estruturado.
-- Hoje o dado vive como TEXTO LIVRE numa célula: "3 empresas, 7 seguros", "6 seguros"
-- (Dados_-_Seguro_SUSEP.xlsx, coluna "Tem seguro SUSEP?"). Impossível contar prêmio,
-- separar por seguradora ou provar o desconto — e a tese "SUSEP — seguros não autorizados"
-- (já existe em tipos_acao) depende exatamente disso.
-- Peça central: reconhecida (boolean, NULL = ainda não perguntado ao cliente). É o campo que
-- transforma apólice em tese: seguro que o cliente NÃO reconhece = desconto não autorizado.
-- GATE: leitura recepção+jurídico (a recepção coleta na ligação, o advogado usa na peça).

CREATE TABLE public.apolices_seguro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  process_id uuid REFERENCES public.processes(id) ON DELETE SET NULL,
  seguradora text NOT NULL,
  produto text,
  numero_apolice text,
  numero_processo_susep text,
  premio_valor numeric(12,2),
  premio_periodicidade text CHECK (premio_periodicidade IS NULL OR premio_periodicidade IN ('mensal','unico','anual','outro')),
  vigencia_inicio date,
  vigencia_fim date,
  origem_desconto text CHECK (origem_desconto IS NULL OR origem_desconto IN ('extrato_inss','conta_bancaria','contracheque','outro')),
  reconhecida boolean,
  cancelada_em date,
  restituicao_valor numeric(12,2),
  notes text,
  is_test boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_apolices_client ON public.apolices_seguro(client_id);
CREATE INDEX idx_apolices_nao_reconhecidas ON public.apolices_seguro(client_id) WHERE reconhecida IS FALSE;
CREATE INDEX idx_apolices_seguradora ON public.apolices_seguro(seguradora);

ALTER TABLE public.apolices_seguro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apolices read" ON public.apolices_seguro
  FOR SELECT TO authenticated
  USING (public.can_view_clients() OR public.is_socio_or_advogado());

CREATE OR REPLACE FUNCTION public.registrar_apolice(
  p_seguradora text, p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL,
  p_produto text DEFAULT NULL, p_numero_apolice text DEFAULT NULL,
  p_premio_valor numeric DEFAULT NULL, p_premio_periodicidade text DEFAULT NULL,
  p_origem_desconto text DEFAULT NULL, p_reconhecida boolean DEFAULT NULL,
  p_vigencia_inicio date DEFAULT NULL, p_numero_processo_susep text DEFAULT NULL,
  p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_nome text; v_n int; v_cands jsonb; v_id uuid; v_per text; v_org text;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão para registrar apólice' USING errcode='42501';
  END IF;
  IF nullif(btrim(coalesce(p_seguradora,'')),'') IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','seguradora_obrigatoria');
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

  v_per := lower(btrim(coalesce(p_premio_periodicidade,'')));
  v_per := CASE WHEN v_per IN ('mensal','mes','mês','por mes') THEN 'mensal'
                WHEN v_per IN ('unico','único','parcela unica','à vista') THEN 'unico'
                WHEN v_per IN ('anual','ano') THEN 'anual'
                WHEN v_per = '' THEN NULL ELSE 'outro' END;
  v_org := lower(btrim(coalesce(p_origem_desconto,'')));
  v_org := CASE WHEN v_org IN ('extrato_inss','inss','extrato do inss','beneficio','benefício') THEN 'extrato_inss'
                WHEN v_org IN ('conta_bancaria','conta','conta bancaria','conta bancária','banco') THEN 'conta_bancaria'
                WHEN v_org IN ('contracheque','folha') THEN 'contracheque'
                WHEN v_org = '' THEN NULL ELSE 'outro' END;

  INSERT INTO public.apolices_seguro
    (client_id, seguradora, produto, numero_apolice, numero_processo_susep, premio_valor,
     premio_periodicidade, vigencia_inicio, origem_desconto, reconhecida, notes, created_by)
  VALUES (v_cli, btrim(p_seguradora), nullif(btrim(coalesce(p_produto,'')),''),
          nullif(btrim(coalesce(p_numero_apolice,'')),''), nullif(btrim(coalesce(p_numero_processo_susep,'')),''),
          p_premio_valor, v_per, p_vigencia_inicio, v_org, p_reconhecida,
          nullif(btrim(coalesce(p_observacao,'')),''), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok',true,'apolice_id',v_id,'cliente',v_nome,
    'seguradora',btrim(p_seguradora),'produto',p_produto,'reconhecida',p_reconhecida,
    'nota', CASE WHEN p_reconhecida IS FALSE
                 THEN 'Apólice NÃO reconhecida pelo cliente — insumo da tese de seguro não autorizado (SUSEP).'
                 WHEN p_reconhecida IS NULL
                 THEN 'Não foi informado se o cliente reconhece a apólice — perguntar na próxima ligação.'
                 ELSE NULL END);
END; $$;

CREATE OR REPLACE FUNCTION public.atualizar_apolice(
  p_apolice_id uuid, p_reconhecida boolean DEFAULT NULL, p_cancelada_em date DEFAULT NULL,
  p_restituicao_valor numeric DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_nome text; v_seg text;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  UPDATE public.apolices_seguro a SET
    reconhecida = coalesce(p_reconhecida, a.reconhecida),
    cancelada_em = coalesce(p_cancelada_em, a.cancelada_em),
    restituicao_valor = coalesce(p_restituicao_valor, a.restituicao_valor),
    notes = CASE WHEN nullif(btrim(coalesce(p_observacao,'')),'') IS NULL THEN a.notes
                 ELSE coalesce(a.notes||E'\n','')||btrim(p_observacao) END,
    updated_at = now()
  WHERE a.id = p_apolice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','apolice_nao_encontrada'); END IF;

  SELECT cd.full_name, a.seguradora INTO v_nome, v_seg
    FROM public.apolices_seguro a JOIN public.clients_decrypted cd ON cd.id=a.client_id
   WHERE a.id = p_apolice_id;
  RETURN jsonb_build_object('ok',true,'cliente',v_nome,'seguradora',v_seg);
END; $$;

CREATE OR REPLACE FUNCTION public.consultar_apolices(
  p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL,
  p_apenas_nao_reconhecidas boolean DEFAULT false, p_seguradora text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_n int; v_out jsonb; v_tot numeric;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  IF p_client_id IS NULL AND nullif(btrim(coalesce(p_cliente_nome,'')),'') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    IF v_n = 1 THEN
      SELECT cd.id INTO v_cli FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    ELSIF v_n > 1 THEN RETURN jsonb_build_object('ok',false,'motivo','ambiguo');
    ELSE RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_encontrado'); END IF;
  ELSE
    v_cli := p_client_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'id',a.id,'cliente',cd.full_name,'seguradora',a.seguradora,'produto',a.produto,
           'numero_apolice',a.numero_apolice,'premio',a.premio_valor,'periodicidade',a.premio_periodicidade,
           'origem_desconto',a.origem_desconto,'reconhecida',a.reconhecida,
           'cancelada_em',a.cancelada_em,'restituicao',a.restituicao_valor)
         ORDER BY cd.full_name, a.seguradora),
       sum(a.premio_valor) FILTER (WHERE a.premio_periodicidade='mensal')
    INTO v_out, v_tot
  FROM public.apolices_seguro a JOIN public.clients_decrypted cd ON cd.id=a.client_id
  WHERE (v_cli IS NULL OR a.client_id = v_cli)
    AND (NOT p_apenas_nao_reconhecidas OR a.reconhecida IS FALSE)
    AND (p_seguradora IS NULL OR a.seguradora ILIKE '%'||btrim(p_seguradora)||'%');

  RETURN jsonb_build_object('ok',true,'total',coalesce(jsonb_array_length(v_out),0),
    'premio_mensal_somado',v_tot,'apolices',coalesce(v_out,'[]'::jsonb));
END; $$;

REVOKE EXECUTE ON FUNCTION public.registrar_apolice(text,uuid,text,text,text,numeric,text,text,boolean,date,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.atualizar_apolice(uuid,boolean,date,numeric,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consultar_apolices(uuid,text,boolean,text) FROM PUBLIC, anon;

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, tool_schema, sort_order, is_active) VALUES
('registrar_apolice','Registrar apólice de seguro (SUSEP)',
 'Registra apólice estruturada: seguradora, produto, prêmio, origem do desconto e se o cliente reconhece.',
 'acao','🔧',
 '{"name":"registrar_apolice","description":"Registra uma apólice de seguro do cliente de forma estruturada (substitui a anotação livre \"tem 7 seguros\"). O campo reconhecida é o que separa seguro contratado de desconto não autorizado — se o cliente disse que não reconhece, informe false.","parameters":{"type":"object","required":["seguradora"],"properties":{"seguradora":{"type":"string","description":"Nome da seguradora (ex.: Zurich, Facta Seguros, BMG Seguros)."},"client_id":{"type":"string"},"cliente_nome":{"type":"string"},"produto":{"type":"string","description":"Produto/tipo (ex.: prestamista, vida, AGI Protege, PAP Card, BMG MED, capitalização)."},"numero_apolice":{"type":"string"},"premio_valor":{"type":"number","description":"Valor do prêmio descontado."},"premio_periodicidade":{"type":"string","description":"mensal, unico, anual ou outro."},"origem_desconto":{"type":"string","description":"Onde aparece o desconto: extrato_inss, conta_bancaria, contracheque ou outro."},"reconhecida":{"type":"boolean","description":"true = cliente reconhece ter contratado; false = NÃO reconhece (insumo da tese); omitir se não perguntado."},"vigencia_inicio":{"type":"string","description":"YYYY-MM-DD."},"numero_processo_susep":{"type":"string","description":"Número do processo SUSEP do produto, se constar."},"observacao":{"type":"string"}}}}'::jsonb, 143, true),
('atualizar_apolice','Atualizar apólice',
 'Marca se o cliente reconhece, cancelamento e valor restituído.',
 'acao','🔧',
 '{"name":"atualizar_apolice","description":"Atualiza uma apólice: se o cliente reconhece (após a ligação de confirmação), data de cancelamento e valor restituído.","parameters":{"type":"object","required":["apolice_id"],"properties":{"apolice_id":{"type":"string"},"reconhecida":{"type":"boolean"},"cancelada_em":{"type":"string","description":"YYYY-MM-DD."},"restituicao_valor":{"type":"number"},"observacao":{"type":"string"}}}}'::jsonb, 144, true),
('consultar_apolices','Consultar apólices de seguro',
 'Lista apólices por cliente ou seguradora; pode filtrar só as não reconhecidas e soma o prêmio mensal.',
 'consulta','🔎',
 '{"name":"consultar_apolices","description":"Lista apólices de seguro: de um cliente, de uma seguradora, ou apenas as que o cliente NÃO reconhece (candidatas à tese SUSEP). Devolve também a soma dos prêmios mensais.","parameters":{"type":"object","properties":{"client_id":{"type":"string"},"cliente_nome":{"type":"string"},"apenas_nao_reconhecidas":{"type":"boolean","description":"true para listar só as não reconhecidas pelo cliente."},"seguradora":{"type":"string"}}}}'::jsonb, 145, true);

UPDATE public.agents
   SET allowed_tools = allowed_tools || ARRAY['registrar_apolice','atualizar_apolice','consultar_apolices']
 WHERE allowed_tools @> ARRAY['registrar_relacao_bancaria']
   AND NOT allowed_tools @> ARRAY['registrar_apolice'];