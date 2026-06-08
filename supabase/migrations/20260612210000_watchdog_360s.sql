-- Ajusta o watchdog para o cenário Pro + streaming: peças completas legítimas
-- levam ~2-4 min. O limite sobe para 6 min (360s) — acima do tempo de geração e
-- abaixo do wall-clock de 400s — para não matar uma geração em curso. Além disso,
-- o N3 renova orchestration_runs.updated_at durante o streaming, então um run
-- ativo nunca é marcado como travado. Idempotente.

CREATE OR REPLACE FUNCTION public.fail_stale_orchestration_runs(
  p_max_age interval DEFAULT interval '6 minutes'
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
