-- ============================================================================
-- Card 2.3 — Realtime em orchestration_runs (reconciliação por conversa)
-- ============================================================================
-- A UI precisa reconstruir o estado "processando" ESCOPADO por conversa quando
-- o usuário troca de sessão ou recarrega a página. Para isso ela assina
-- orchestration_runs filtrando por session_id e observa a mudança de status
-- (routing_n1 → ... → done/failed). Duas condições eram necessárias e faltavam:
--
--   1) A tabela precisa estar na publicação `supabase_realtime`, senão nenhum
--      evento chega ao cliente.
--   2) REPLICA IDENTITY FULL — sem ela, o payload de UPDATE só traz a PK, então
--      o filtro `session_id=eq.<id>` e a leitura de `status` no cliente não
--      funcionariam para UPDATEs (a orquestração avança via UPDATE de status).
--
-- Idempotente: seguro reaplicar. RLS já restringe SELECT ao dono (policy
-- orch_runs_select_own), então o Realtime só entrega runs do próprio usuário.
-- ============================================================================

BEGIN;

-- Garante que o payload de UPDATE traga a linha completa (session_id + status).
ALTER TABLE public.orchestration_runs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orchestration_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orchestration_runs;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- publicação não existe (ambiente novo/local), ignore.
  NULL;
END$$;

COMMIT;
