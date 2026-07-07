-- Card 2.8 — Classificador de intenção (fast-path para triviais).
-- Auditoria em orchestration_runs: por qual CAMINHO a mensagem seguiu
-- (fast-path trivial vs. cadeia completa) e a CATEGORIA classificada na entrada.
-- Permite medir depois a taxa de fast-path. Idempotente e não-destrutiva.

ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS route_path text;

ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS intent_category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orchestration_runs_route_path_chk'
  ) THEN
    ALTER TABLE public.orchestration_runs
      ADD CONSTRAINT orchestration_runs_route_path_chk
      CHECK (route_path IS NULL OR route_path IN ('fast','full'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orchestration_runs_intent_category_chk'
  ) THEN
    ALTER TABLE public.orchestration_runs
      ADD CONSTRAINT orchestration_runs_intent_category_chk
      CHECK (intent_category IS NULL OR intent_category IN ('TRIVIAL','NEGOCIO','INCERTO'));
  END IF;
END $$;

COMMENT ON COLUMN public.orchestration_runs.route_path IS
  'Card 2.8: caminho seguido — fast (fast-path trivial, sem N2/N3) ou full (cadeia completa).';
COMMENT ON COLUMN public.orchestration_runs.intent_category IS
  'Card 2.8: categoria do classificador de intenção na entrada — TRIVIAL, NEGOCIO ou INCERTO.';
