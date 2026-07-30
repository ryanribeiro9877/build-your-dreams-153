-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730134849), então bate byte a byte com o que foi aplicado.
--
-- NÃO estava na lista do briefing de P2 — achei varrendo as migrações de 30/07 e
-- espelhei porque estava aplicada em produção e ausente do repo.
-- ATENÇÃO: esta versão de `importar_processos_posicional` é SUBSTITUÍDA pela
-- migração POSTERIOR 20260730134932_importar_posicional_sentinelas. A versão viva
-- é a de lá; é a ordem por `version` que reconstrói o estado correto.
-- ============================================================================

-- Wrapper posicional do importador: aceita array de arrays em vez de objetos, porque os nomes
-- das chaves representavam ~45% do payload e o canal de transporte (MCP) tem custo por byte.
-- Ordem fixa: [numero, cliente, reu, reu_tipo, fase, tem_execucao, proxima_revisao,
--              sentenca_procedente, responsavel, obs, origem]
-- Converte e delega para importar_processos_execucoes_planilha (nenhuma regra duplicada).
CREATE OR REPLACE FUNCTION public.importar_processos_posicional(
  p_lote jsonb, p_dry_run boolean DEFAULT true, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_obj jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'numero',               r->>0,
      'cliente',              r->>1,
      'reu',                  r->>2,
      'reu_tipo',             r->>3,
      'fase',                 r->>4,
      'tem_execucao',         CASE WHEN (r->>5) = 't' THEN true ELSE NULL END,
      'proxima_revisao',      r->>6,
      'sentenca_procedente',  CASE WHEN (r->>7) = 't' THEN true ELSE NULL END,
      'responsavel',          r->>8,
      'obs',                  r->>9,
      'origem',               r->>10))), '[]'::jsonb)
  INTO v_obj
  FROM jsonb_array_elements(p_lote) r;

  RETURN public.importar_processos_execucoes_planilha(v_obj, p_dry_run, p_user_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.importar_processos_posicional(jsonb,boolean,uuid) FROM PUBLIC, anon;
