-- Watchdog de runs órfãos da orquestração.
-- Se a Edge Function morrer no meio de um passo (ex.: estouro de wall-clock), o run
-- fica preso em estado intermediário sem desfecho e a UI trava em loading infinito.
-- Este job marca como 'failed' qualquer run intermediário cujo updated_at seja mais
-- antigo que o limite, e publica uma mensagem de erro no chat (dispara Realtime →
-- a UI sai do loading). Idempotente e não-destrutivo.

CREATE OR REPLACE FUNCTION public.fail_stale_orchestration_runs(
  p_max_age interval DEFAULT interval '5 minutes'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_seq integer;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id, session_id, user_id
      FROM public.orchestration_runs
     WHERE status IN ('routing_n1','routing_n2','executing_n3','validating_n2','validating_n1')
       AND updated_at < now() - p_max_age
  LOOP
    UPDATE public.orchestration_runs
       SET status = 'failed',
           error = 'timeout: passo nao concluiu no tempo limite (watchdog)',
           updated_at = now()
     WHERE id = r.id;

    SELECT COALESCE(max(sequence_number), 0) + 1 INTO v_seq
      FROM public.chat_messages WHERE session_id = r.session_id;

    INSERT INTO public.chat_messages (session_id, user_id, role, content, sequence_number, metadata)
    VALUES (r.session_id, r.user_id, 'assistant',
            'Nao consegui concluir a orquestracao agora (tempo limite). Tente novamente.',
            v_seq,
            jsonb_build_object('kind','error','error','watchdog_timeout'));

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Agenda o watchdog a cada 2 minutos (idempotente: remove o job anterior se existir).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fail-stale-orch-runs') THEN
    PERFORM cron.unschedule('fail-stale-orch-runs');
  END IF;
  PERFORM cron.schedule(
    'fail-stale-orch-runs',
    '*/2 * * * *',
    $cron$ SELECT public.fail_stale_orchestration_runs(); $cron$
  );
END $$;
