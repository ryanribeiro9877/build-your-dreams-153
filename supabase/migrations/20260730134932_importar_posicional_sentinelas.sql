-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730134932), então bate byte a byte com o que está no ar.
--
-- NÃO estava na lista do briefing de P2 — achei varrendo as migrações de 30/07 e
-- espelhei porque estava aplicada em produção e ausente do repo.
-- Esta é a versão VIVA de `importar_processos_posicional` (reescreve a de
-- 20260730134849_importar_processos_formato_posicional).
-- ============================================================================

-- Sentinelas no wrapper posicional: valores que repetem centenas de vezes viajam como código
-- e são expandidos aqui. Motivo: 144 linhas carregavam a MESMA observação de 90 caracteres
-- (13KB de eco no transporte). Códigos: obs '@SI' · origem S/1/2 · reu_tipo s/b/e/o · resp D.
CREATE OR REPLACE FUNCTION public.importar_processos_posicional(
  p_lote jsonb, p_dry_run boolean DEFAULT true, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_obj jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'numero',  r->>0,
      'cliente', r->>1,
      'reu',     r->>2,
      'reu_tipo', CASE r->>3 WHEN 's' THEN 'sindicato' WHEN 'b' THEN 'banco'
                             WHEN 'e' THEN 'empresa'   WHEN 'o' THEN 'outro' ELSE r->>3 END,
      'fase',    r->>4,
      'tem_execucao', CASE WHEN (r->>5)='t' THEN true ELSE NULL END,
      'proxima_revisao', r->>6,
      'sentenca_procedente', CASE WHEN (r->>7)='t' THEN true ELSE NULL END,
      'responsavel', CASE r->>8 WHEN 'D' THEN 'Daiane' ELSE r->>8 END,
      'obs', CASE r->>9
               WHEN '@SI' THEN 'Situação não informada na planilha de origem (decisão Rodrigo 30/07: entrar como ajuizada).'
               ELSE r->>9 END,
      'origem', CASE r->>10 WHEN 'S' THEN 'Sentenças procedentes'
                            WHEN '1' THEN 'Execuções em andamento 1'
                            WHEN '2' THEN 'Execução em andamento 2' ELSE r->>10 END))), '[]'::jsonb)
  INTO v_obj
  FROM jsonb_array_elements(p_lote) r;

  RETURN public.importar_processos_execucoes_planilha(v_obj, p_dry_run, p_user_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.importar_processos_posicional(jsonb,boolean,uuid) FROM PUBLIC, anon;
