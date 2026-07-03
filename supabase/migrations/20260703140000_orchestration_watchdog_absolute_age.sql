-- Watchdog da orquestração — TETO DE IDADE ABSOLUTA (Frente 3).
--
-- Problema: fail_stale_orchestration_runs só falhava runs "stale" por updated_at
-- (janela ~6min20s). Como cada BLOCO da redação (Caminho B) bumpa updated_at a
-- cada ~1,5-2 min, uma run lenta-porém-viva NUNCA era considerada stale — ela
-- "progredia eternamente" e o usuário ficava esperando indefinidamente.
--
-- Correção: ADICIONAR um teto de idade absoluta baseado em created_at, PRESERVANDO
-- o watchdog por updated_at (que continua pegando worker morto rapidamente).
--
-- Escolha do teto (p_max_total_age = 30 min) — justificativa com base em dados
-- reais de produção:
--   * Cada passo (1 bloco) leva ~1,5-2 min; um passe completo de 5 blocos
--     (N3_BLOCKS.length = 5) leva ~9-10 min.
--   * MAX_ITERATIONS = 2 (correções mecânicas) e MAX_CONSULTIVE_ITERATIONS = 2
--     (correções consultivas) => o laço é LIMITADO (~25 blocos no pior caso).
--   * Caso comum (rascunho + 0-1 rodada de correção): ~10-25 min.
--   * Pior caso teórico (2 mecânicas + 2 consultivas): ~40-50 min, porém raro.
--   * 30 min cobre com folga o caso comum (inclusive 1 rodada de correção) e
--     garante estado terminal para runs patológicas em tempo limitado. Runs que
--     estouram 30 min são quase sempre patológicas; a UX de peças longas legítimas
--     é resolvida pelo indicador de progresso + aviso "ainda processando"
--     (Frentes 1 e 2), NÃO por matar o run.
--   * Recomendação de acompanhamento: a otimização "reenviar só o bloco afetado"
--     (briefing separado) reduz o pior caso bem abaixo de 30 min, permitindo baixar
--     este teto com segurança no futuro.

-- Remove a assinatura antiga de 1 parâmetro. Sem isto, o CREATE OR REPLACE abaixo
-- cria uma SEGUNDA função (overload) e a chamada sem args do cron (jobid 2) fica
-- ambígua ("function is not unique"). O DROP garante uma única assinatura.
DROP FUNCTION IF EXISTS public.fail_stale_orchestration_runs(interval);

CREATE OR REPLACE FUNCTION public.fail_stale_orchestration_runs(
  p_max_age interval DEFAULT '00:06:20'::interval,
  p_max_total_age interval DEFAULT '00:30:00'::interval
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_seq integer;
  v_count integer := 0;
  v_error text;
BEGIN
  FOR r IN
    SELECT id, session_id, user_id, created_at, updated_at
      FROM public.orchestration_runs
     WHERE status IN ('routing_n1','routing_n2','executing_n3','validating_n2','validating_n1')
       AND ( updated_at < now() - p_max_age                 -- worker morto (sem progresso)
          OR created_at < now() - p_max_total_age )         -- idade absoluta (progride, mas não converge)
  LOOP
    -- Distingue a causa no campo error (para observabilidade), mas a mensagem ao
    -- usuário é a mesma e clara em ambos os casos.
    IF r.created_at < now() - p_max_total_age THEN
      v_error := 'timeout: run excedeu a idade total maxima (watchdog idade absoluta)';
    ELSE
      v_error := 'timeout: passo nao concluiu no tempo limite (watchdog)';
    END IF;

    UPDATE public.orchestration_runs
       SET status = 'failed',
           error = v_error,
           updated_at = now()
     WHERE id = r.id;

    SELECT COALESCE(max(sequence_number), 0) + 1 INTO v_seq
      FROM public.chat_messages WHERE session_id = r.session_id;

    INSERT INTO public.chat_messages (session_id, user_id, role, content, sequence_number, metadata)
    VALUES (r.session_id, r.user_id, 'assistant',
            'O processamento excedeu o tempo limite. Tente novamente ou, se persistir, acione o suporte.',
            v_seq,
            jsonb_build_object('kind','error','error','watchdog_timeout'));

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.fail_stale_orchestration_runs(interval, interval) IS
  'Watchdog: falha runs de orquestração presas. p_max_age = sem progresso (worker morto); '
  'p_max_total_age = idade absoluta desde created_at (progride mas não converge). '
  'Insere mensagem de erro em chat_messages para destravar a UI. Cron jobid 2 chama sem args (usa defaults).';
