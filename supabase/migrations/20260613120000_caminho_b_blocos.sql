-- Caminho B: geração da peça do N3 em BLOCOS (uma chamada de LLM por seção),
-- concatenados num documento único ao final. Colunas de apoio em orchestration_runs.
-- Idempotente e não-destrutivo.

ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS block_index integer NOT NULL DEFAULT 0;   -- próximo bloco a redigir (0-based)

ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb; -- textos dos blocos já redigidos

ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS fixed_facts text;                          -- dados canônicos fixados no bloco 1

ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS n3_usage jsonb;                            -- uso acumulado (model/tokens/duração)

COMMENT ON COLUMN public.orchestration_runs.block_index IS 'Caminho B: índice do próximo bloco do N3 a redigir.';
COMMENT ON COLUMN public.orchestration_runs.blocks IS 'Caminho B: array com o texto de cada bloco já concluído.';
COMMENT ON COLUMN public.orchestration_runs.fixed_facts IS 'Caminho B: dados canônicos do caso fixados no bloco 1, reusados nos demais.';
COMMENT ON COLUMN public.orchestration_runs.n3_usage IS 'Uso acumulado do N3 (model_used, input/output_tokens, duration_ms) p/ gravar na mensagem final.';
