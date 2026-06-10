-- V25: acao_tipo em document_library (roteamento de modelos) e em
-- orchestration_runs (auditoria do roteamento), + mech_report (auditoria do
-- validador mecânico pós-N3). Idempotente e não-destrutiva.

-- 1) coluna em document_library
ALTER TABLE public.document_library
  ADD COLUMN IF NOT EXISTS acao_tipo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_library_acao_tipo_chk'
  ) THEN
    ALTER TABLE public.document_library
      ADD CONSTRAINT document_library_acao_tipo_chk
      CHECK (acao_tipo IS NULL OR acao_tipo IN
        ('fraude_inexistencia','revisional_juros','rmc_rcc',
         'portabilidade','seguro_atrelado','outro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_document_library_acao_tipo
  ON public.document_library (acao_tipo);

-- 2) colunas no run: acao_tipo (auditoria do roteamento) e mech_report
--    (resultado do validador mecânico, por rodada, em jsonb)
ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS acao_tipo text;

ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS mech_report jsonb;

-- 3) backfill conservador: modelos atuais são de fraude de consignado
UPDATE public.document_library
   SET acao_tipo = 'fraude_inexistencia'
 WHERE acao_tipo IS NULL
   AND (doc_type ILIKE '%fraude%' OR doc_type ILIKE '%consign%'
        OR categoria ILIKE '%fraude%' OR categoria ILIKE '%consign%');
