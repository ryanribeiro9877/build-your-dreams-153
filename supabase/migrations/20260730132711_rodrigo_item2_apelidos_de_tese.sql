-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730132711), então bate byte a byte com o que está no ar.
--
-- ATENÇÃO: esta migração REESCREVE public.preparar_audiencia(uuid), que havia
-- sido criada por 20260730113853_card13_lembretes_cron_e_preparacao.sql. Esta é
-- a version MAIOR, logo é ESTA a versão VIVA da função em produção.
-- ============================================================================

-- RESPOSTA DO RODRIGO — ITEM 2: de-para dos nomes de tese da planilha de audiências.
-- Confirmado por ele: RMC e RCC são a mesma coisa (conjunto atrelado) → Cartão consignado RMC/RCC;
-- SUSEP, Seguro Prestamista e Agi Protege confirmados; e a definição nova que ele deu:
-- "FRAUDE BANCÁRIA = qualquer cliente que NÃO RECONHECE o contrato" → é exatamente a tese
-- "Refin não autorizado / inexistência de relação jurídica (inclui negativa de débito...)".
-- Tabela de apelidos em vez de texto casado por acaso: a planilha e o sistema falam idiomas
-- diferentes e vão continuar falando. Novos apelidos entram por INSERT, sem mexer em função.

CREATE TABLE public.tipo_acao_apelidos (
  apelido_fold text PRIMARY KEY,
  apelido_original text NOT NULL,
  tipo_acao_id uuid NOT NULL REFERENCES public.tipos_acao(id) ON DELETE CASCADE,
  fonte text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tipo_acao_apelidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apelidos read" ON public.tipo_acao_apelidos
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.tipo_acao_apelidos (apelido_fold, apelido_original, tipo_acao_id, fonte)
SELECT public.txt_fold(x.ap), x.ap, t.id, 'Rodrigo 30/07/2026 (ditado)'
FROM (VALUES
  ('RMC',            'Cartão consignado RMC/RCC'),
  ('RCC',            'Cartão consignado RMC/RCC'),
  ('RMC/RCC',        'Cartão consignado RMC/RCC'),
  ('SUSEP',          'SUSEP — seguros não autorizados'),
  ('Seguro Prestamista','Seguro prestamista / PAP Card / BMG MED'),
  ('PAP Card',       'Seguro prestamista / PAP Card / BMG MED'),
  ('BMG MED',        'Seguro prestamista / PAP Card / BMG MED'),
  ('Agi Protege',    'Desconto indevido (Bradesco: tarifa, capitalização, investimento, seguro; inclui AGI Protege)'),
  ('AGI Protege',    'Desconto indevido (Bradesco: tarifa, capitalização, investimento, seguro; inclui AGI Protege)'),
  ('Fraude bancária','Refin não autorizado / inexistência de relação jurídica (inclui negativa de débito e empréstimo travestido)'),
  ('Fraude',         'Refin não autorizado / inexistência de relação jurídica (inclui negativa de débito e empréstimo travestido)'),
  ('Empréstimo Pessoal','Empréstimo pessoal')
) AS x(ap, tese)
JOIN public.tipos_acao t ON t.nome = x.tese
ON CONFLICT (apelido_fold) DO NOTHING;

COMMENT ON TABLE public.tipo_acao_apelidos IS
'De-para entre o vocabulário das planilhas do Rodrigo e tipos_acao. Regra do Rodrigo (30/07): fraude bancária = cliente que não reconhece o contrato.';

-- preparar_audiencia passa a resolver a tese pelos apelidos (antes só casava nome exato)
CREATE OR REPLACE FUNCTION public.preparar_audiencia(p_audiencia_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE a record; v_tipo_id uuid; v_via text; v_ancora text[]; v_falta jsonb; v_tem jsonb; v_lembretes jsonb;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.is_socio_or_advogado()
          OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;

  SELECT * INTO a FROM public.audiencias WHERE id = p_audiencia_id;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','audiencia_nao_encontrada'); END IF;

  IF a.process_id IS NOT NULL THEN
    SELECT p.tipo_acao_id INTO v_tipo_id FROM public.processes p WHERE p.id=a.process_id;
    IF v_tipo_id IS NOT NULL THEN v_via := 'processo'; END IF;
  END IF;
  IF v_tipo_id IS NULL AND nullif(btrim(coalesce(a.tipo_acao,'')),'') IS NOT NULL THEN
    SELECT t.id INTO v_tipo_id FROM public.tipos_acao t
     WHERE public.txt_fold(t.nome) = public.txt_fold(a.tipo_acao)
        OR public.txt_fold(coalesce(t.code,'')) = public.txt_fold(a.tipo_acao) LIMIT 1;
    IF v_tipo_id IS NOT NULL THEN v_via := 'nome_exato'; END IF;
  END IF;
  IF v_tipo_id IS NULL AND nullif(btrim(coalesce(a.tipo_acao,'')),'') IS NOT NULL THEN
    SELECT ap.tipo_acao_id INTO v_tipo_id FROM public.tipo_acao_apelidos ap
     WHERE ap.apelido_fold = public.txt_fold(a.tipo_acao) LIMIT 1;
    IF v_tipo_id IS NOT NULL THEN v_via := 'apelido'; END IF;
  END IF;

  SELECT ad.document_types INTO v_ancora FROM public.tipo_acao_ancora_docs ad WHERE ad.tipo_acao_id = v_tipo_id;
  v_ancora := coalesce(v_ancora, ARRAY[]::text[]) || ARRAY['procuracao'];

  SELECT jsonb_agg(DISTINCT d) INTO v_falta FROM unnest(v_ancora) d
   WHERE a.client_id IS NULL OR NOT EXISTS (
     SELECT 1 FROM public.client_documents cdoc
      WHERE cdoc.client_id = a.client_id AND cdoc.document_type = d
        AND coalesce(cdoc.status,'') <> 'rejeitado');
  SELECT jsonb_agg(DISTINCT d) INTO v_tem FROM unnest(v_ancora) d
   WHERE a.client_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.client_documents cdoc
      WHERE cdoc.client_id = a.client_id AND cdoc.document_type = d
        AND coalesce(cdoc.status,'') <> 'rejeitado');
  SELECT jsonb_agg(jsonb_build_object('id',l.id,'data',l.data_prevista,'status',l.status) ORDER BY l.data_prevista)
    INTO v_lembretes FROM public.audiencia_lembretes l WHERE l.audiencia_id = p_audiencia_id;

  RETURN jsonb_build_object('ok',true,
    'cliente',coalesce((SELECT cd.full_name FROM public.clients_decrypted cd WHERE cd.id=a.client_id), a.client_name),
    'cliente_vinculado',(a.client_id IS NOT NULL),
    'data_hora',a.data_hora,'tipo_acao',a.tipo_acao,'parte_contraria',a.parte_contraria,
    'local_ou_link',a.link_local,'status',a.status,
    'tese_resolvida',(v_tipo_id IS NOT NULL),'tese_resolvida_via',v_via,
    'tese',(SELECT t.nome FROM public.tipos_acao t WHERE t.id=v_tipo_id),
    'documentos_esperados',to_jsonb(v_ancora),
    'documentos_presentes',coalesce(v_tem,'[]'::jsonb),
    'documentos_faltando',coalesce(v_falta,'[]'::jsonb),
    'lembretes',coalesce(v_lembretes,'[]'::jsonb),
    'limitacao','Documentos = âncora da tese (§24.1) + procuração. A matriz completa por tese (Card 12) segue pendente com o Rodrigo.');
END; $$;
REVOKE EXECUTE ON FUNCTION public.preparar_audiencia(uuid) FROM PUBLIC, anon;