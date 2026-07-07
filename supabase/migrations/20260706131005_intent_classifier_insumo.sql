-- Card 2.8 (evolução) — Classificador de intenção com suficiência de insumo.
-- Amplia os valores de auditoria em orchestration_runs para as 3 categorias e os
-- 3 caminhos. Substitui os CHECKs do 2.8 (que só previam TRIVIAL/NEGOCIO/INCERTO
-- e fast/full). Idempotente e não-destrutiva; mantém os valores legados no CHECK
-- de intent_category por segurança (linhas antigas não violam).

-- Novos caminhos: fast (trivial) | need_info (pede dados) | full (cadeia completa).
ALTER TABLE public.orchestration_runs
  DROP CONSTRAINT IF EXISTS orchestration_runs_route_path_chk;
ALTER TABLE public.orchestration_runs
  ADD CONSTRAINT orchestration_runs_route_path_chk
  CHECK (route_path IS NULL OR route_path IN ('fast','need_info','full'));

-- Novas categorias: TRIVIAL | NEGOCIO_SEM_INSUMO | NEGOCIO_COM_INSUMO.
-- (Legados 'NEGOCIO'/'INCERTO' mantidos no CHECK para não invalidar linhas antigas.)
ALTER TABLE public.orchestration_runs
  DROP CONSTRAINT IF EXISTS orchestration_runs_intent_category_chk;
ALTER TABLE public.orchestration_runs
  ADD CONSTRAINT orchestration_runs_intent_category_chk
  CHECK (intent_category IS NULL OR intent_category IN
    ('TRIVIAL','NEGOCIO_SEM_INSUMO','NEGOCIO_COM_INSUMO','NEGOCIO','INCERTO'));

COMMENT ON COLUMN public.orchestration_runs.route_path IS
  'Card 2.8: caminho seguido — fast (trivial), need_info (pede dados, sem N3) ou full (cadeia completa).';
COMMENT ON COLUMN public.orchestration_runs.intent_category IS
  'Card 2.8: categoria do classificador — TRIVIAL, NEGOCIO_SEM_INSUMO ou NEGOCIO_COM_INSUMO.';
