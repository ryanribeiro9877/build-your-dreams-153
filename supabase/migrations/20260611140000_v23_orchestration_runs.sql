-- ============================================================================
-- V23 — orchestration_runs: maquina de estado da orquestracao N1->N2->N3
-- ============================================================================
-- Cada mensagem do usuario dispara um "run". O orchestrator processa UM passo
-- por invocacao (rapida) e dispara o proximo, ate concluir. Permite a cadeia
-- completa com validacao sem estourar o tempo de um Edge Function.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.orchestration_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_message_id  uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  original_message text NOT NULL,
  status           text NOT NULL DEFAULT 'routing_n1',
  -- routing_n1 | routing_n2 | executing_n3 | validating_n2 | validating_n1 | done | failed
  entry_agent_id   uuid,            -- N1 (assistant_root)
  target_n2_id     uuid,            -- Diretor escolhido
  target_n3_id     uuid,            -- Especialista escolhido
  draft            text,            -- rascunho produzido pelo N3
  feedback         text,            -- feedback de validacao para o N3 corrigir
  iterations       integer NOT NULL DEFAULT 0,
  chain            jsonb NOT NULL DEFAULT '[]'::jsonb,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orch_runs_session ON public.orchestration_runs (session_id);
CREATE INDEX IF NOT EXISTS idx_orch_runs_status ON public.orchestration_runs (status);

ALTER TABLE public.orchestration_runs ENABLE ROW LEVEL SECURITY;

-- Dono le o proprio run; escrita so via service_role (edge function)
DO $$ BEGIN
  CREATE POLICY "orch_runs_select_own" ON public.orchestration_runs
    FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tech'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
