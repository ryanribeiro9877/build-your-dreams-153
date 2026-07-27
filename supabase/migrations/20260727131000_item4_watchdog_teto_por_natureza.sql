-- ============================================================================
-- Item 4 (27/07) — run zumbi: teto de tempo por NATUREZA do run
-- ============================================================================
-- Sintoma: run 7e8e4080 (10:24) ficou em executing_n3 "bloco 4 de 5" com spinner
-- infinito e só virou failed ~18 min depois; o usuário não tinha como saber.
--
-- O watchdog (cron 'falhar-orquestracoes-travadas', a cada 2 min) JÁ existia e
-- funciona — confirmei 720 execuções bem-sucedidas nas últimas 24h. O problema era
-- o teto: 30 min para TUDO, e como o edge renova updated_at durante a geração, o
-- teto de inatividade (6min20 = LLM_N3_TIMEOUT_MS) não fecha um run vivo-mas-perdido.
-- Uma AÇÃO/CONSULTA nunca leva 30 min → teto próprio de 5 min. Peça longa (redação
-- em blocos, legitimamente demorada) continua com 30 min.
--
-- Nota: aquele run só entrou em "bloco 4 de 5" porque um pedido de ABRIR PROCESSO
-- foi roteado para redação de peça — causa corrigida em B1/B3 (roteamento por
-- objeto). Isto aqui é a rede de segurança.
--
-- 'delegating' entrou na lista de status vigiados (podia pendurar) e a mensagem ao
-- usuário deixa claro que não haverá nova tentativa.
--
-- O teto de ação é CONSTANTE INTERNA, não um 3º parâmetro: um parâmetro novo com
-- DEFAULT criaria sobrecarga ambígua com a chamada sem argumentos do cron (42725) e
-- quebraria o deadletter.
--
-- Dry-run (ROLLBACK): run de AÇÃO com 6 min e updated_at renovado → failed + aviso
-- na conversa; run de PEÇA com 6 min → intacto.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fail_stale_orchestration_runs(
  p_max_age       interval DEFAULT '00:06:20'::interval,
  p_max_total_age interval DEFAULT '00:30:00'::interval
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record; v_seq integer; v_count integer := 0; v_error text; v_teto interval;
  c_max_total_acao constant interval := '00:05:00';
BEGIN
  FOR r IN
    SELECT id, session_id, user_id, created_at, updated_at, intent_category
      FROM public.orchestration_runs
     WHERE status IN ('routing_n1','routing_n2','executing_n3','validating_n2','validating_n1','delegating')
  LOOP
    v_teto := CASE WHEN coalesce(r.intent_category,'') IN ('ACAO_COM_TOOL','CONSULTA','TRIVIAL')
                   THEN c_max_total_acao ELSE p_max_total_age END;
    IF r.created_at < now() - v_teto THEN
      v_error := 'timeout: run excedeu a idade total maxima (watchdog idade absoluta)';
    ELSIF r.updated_at < now() - p_max_age THEN
      v_error := 'timeout: passo nao concluiu no tempo limite (watchdog)';
    ELSE
      CONTINUE; -- geração viva: não mata
    END IF;

    UPDATE public.orchestration_runs
       SET status = 'failed', error = v_error, updated_at = now() WHERE id = r.id;

    SELECT COALESCE(max(sequence_number), 0) + 1 INTO v_seq
      FROM public.chat_messages WHERE session_id = r.session_id;

    INSERT INTO public.chat_messages (session_id, user_id, role, content, sequence_number, metadata)
    VALUES (r.session_id, r.user_id, 'assistant',
            'A geração falhou por tempo limite e não vou continuar tentando. Pode enviar de novo, por favor?',
            v_seq, jsonb_build_object('kind','error','error','watchdog_timeout'));

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;
