-- Stop instantâneo da orquestração — estado de cancelamento por run.
--
-- Adiciona a flag cancel_requested à orchestration_runs. O front NÃO escreve
-- direto (escrita é service_role-only por RLS): o endpoint mode:"cancel" do
-- chat-orchestrator grava esta flag após autenticar o dono da run. O worker
-- (processStep) lê a flag durante a geração (streaming e passos curtos) e aborta
-- a chamada de LLM em ~1-2s; ao detectar o abort, encerra a run como 'cancelled'.
--
-- 'cancelled' é um status TERMINAL novo do domínio (a coluna status é texto livre,
-- sem CHECK constraint — nada a alterar). O watchdog (fail_stale_orchestration_runs)
-- só age sobre status não-terminais, então runs 'cancelled' ficam intactas.
--
-- Reversível: ALTER TABLE public.orchestration_runs DROP COLUMN IF EXISTS cancel_requested;

ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orchestration_runs.cancel_requested IS
  'STOP instantâneo: setada pelo endpoint mode:"cancel" (dono da run). O worker lê '
  'durante a geração e aborta a chamada de LLM; a run é encerrada como status=''cancelled''.';
